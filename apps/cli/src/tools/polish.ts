import { Paragraph, Word, Segment } from "@subtitle-agent/core";

import { polishWords } from "./polish-words";

export { polishWords } from "./polish-words";

// 默认每次向大模型发出的最大词数，以防上下文过长
const DEFAULT_MAX_WORDS_PER_REQUEST = 400;
// 默认为不同块之间预留的重叠词数，帮助拼接自然
const DEFAULT_OVERLAP_WORDS = 50;

// 分块润色时允许的配置项
export interface ParagraphBuilderOptions {
  maxWordsPerRequest?: number;
  overlapWords?: number;
}

// 润色过程中的草稿状态，用于跨块累积结果
export interface ParagraphBuilderDraft {
  // Full list of segments from transcription
  segments: Segment[];
  // Aggregated polished paragraphs
  paragraphs?: Paragraph[];
  // Chunking options
  options?: ParagraphBuilderOptions;
  // Progress state for resumability
  // Index of the current speaker group being processed
  lastProcessedGroupIndex?: number;
  // Word index within the current speaker group
  lastProcessedWordIndex?: number;
}

// 为段落附加其在全局词序列中的起止索引，便于判断重叠区间
interface ParagraphWithRange {
  paragraph: Paragraph;
  firstWordIndex: number | null;
  lastWordIndex: number | null;
}

const normalizeOptions = (
  options?: ParagraphBuilderOptions
): Required<ParagraphBuilderOptions> => {
  let maxWordsPerRequest = options?.maxWordsPerRequest ?? DEFAULT_MAX_WORDS_PER_REQUEST;
  let overlapWords = options?.overlapWords ?? DEFAULT_OVERLAP_WORDS;

  if (maxWordsPerRequest <= 0) {
    // 小于等于 0 时退回默认值，确保区块长度合理
    maxWordsPerRequest = DEFAULT_MAX_WORDS_PER_REQUEST;
  }

  if (overlapWords < 0) {
    // 重叠词数不允许为负，强制抬到 0
    overlapWords = 0;
  }

  if (overlapWords >= maxWordsPerRequest) {
    // 重叠区间不得覆盖整个区块，至少留出一个非重叠词
    overlapWords = Math.max(0, maxWordsPerRequest - 1);
  }

  return {
    maxWordsPerRequest,
    overlapWords,
  };
};

const computeChunkRange = (
  totalWords: number,
  cursor: number,
  options: Required<ParagraphBuilderOptions>
): { start: number; end: number; isLast: boolean } => {
  const cappedCursor = Math.min(Math.max(cursor, 0), totalWords);
  // 预估本次切片的结尾位置，受限于最大词数上限
  const tentativeEnd = Math.min(
    cappedCursor + options.maxWordsPerRequest,
    totalWords
  );

  if (tentativeEnd >= totalWords) {
    // 已触及尾部，标记为最后一个区块
    return { start: cappedCursor, end: totalWords, isLast: true };
  }

  const remaining = totalWords - tentativeEnd;
  if (remaining < options.overlapWords) {
    // 剩余词不足以留下重叠区，直接吞并到最后
    return { start: cappedCursor, end: totalWords, isLast: true };
  }

  return {
    start: cappedCursor,
    end: tentativeEnd,
    isLast: false,
  };
};

const mapParagraphsToGlobalRanges = (
  paragraphs: Paragraph[],
  wordIndexLookup: Map<string, number>
): ParagraphWithRange[] => {
  return paragraphs.map((paragraph) => {
    let firstWordIndex: number | null = null;
    let lastWordIndex: number | null = null;

    for (const word of paragraph.words) {
      const index = wordIndexLookup.get(word.id);

      if (index === undefined) {
        // 如果无法匹配上原词索引，忽略该词
        continue;
      }

      if (firstWordIndex === null || index < firstWordIndex) {
        // 记录段落覆盖的最小索引
        firstWordIndex = index;
      }

      if (lastWordIndex === null || index > lastWordIndex) {
        // 记录段落覆盖的最大索引
        lastWordIndex = index;
      }
    }

    return {
      paragraph,
      firstWordIndex,
      lastWordIndex,
    };
  });
};

const computeFallbackCursor = (
  currentStart: number,
  chunkEnd: number,
  options: Required<ParagraphBuilderOptions>,
  totalWords: number
): number => {
  const overlapStart = Math.max(currentStart + 1, chunkEnd - options.overlapWords);
  if (overlapStart > currentStart) {
    // 优先尝试跳转到重叠区域的起点
    return Math.min(overlapStart, totalWords);
  }

  // 如果重叠区也不可用，则至少前进一步避免停滞
  return Math.min(totalWords, currentStart + 1);
};

const ensureCursorProgress = (
  previousCursor: number,
  nextCursor: number,
  totalWords: number
): number => {
  if (nextCursor <= previousCursor) {
    // 若新游标未前进，则强制向前一步
    return Math.min(totalWords, previousCursor + 1);
  }

  // 正常情况下将游标限制在总词数范围内
  return Math.min(nextCursor, totalWords);
};

// 根据连续的 speakerId 对 segments 进行分组
const groupSegmentsBySpeaker = (
  segments: Segment[]
): Array<{ speakerId?: string; words: Word[] }> => {
  const groups: Array<{ speakerId?: string; words: Word[] }> = [];
  let currentSpeaker: string | undefined = undefined;
  let currentWords: Word[] = [];

  const flush = () => {
    if (currentWords.length > 0 || groups.length === 0) {
      groups.push({ speakerId: currentSpeaker, words: currentWords });
    }
    currentWords = [];
  };

  for (const seg of segments) {
    const sid = seg.speakerId;
    if (currentWords.length === 0) {
      currentSpeaker = sid;
      currentWords.push(...seg.words);
      continue;
    }

    if (sid === currentSpeaker) {
      currentWords.push(...seg.words);
    } else {
      flush();
      currentSpeaker = sid;
      currentWords = [...seg.words];
    }
  }

  // flush the last group
  flush();

  // 过滤掉空 words 的空组（例如原本为空输入）
  return groups.filter((g) => g.words.length > 0);
};

// 迭代分块润色整篇文本（按 speaker 分组），并在每个区块完成后回调通知外部
export const polish = async (
  draft: ParagraphBuilderDraft,
  onChunkResult: (draft: ParagraphBuilderDraft) => void | Promise<void>
): Promise<ParagraphBuilderDraft> => {
  const groups = groupSegmentsBySpeaker(draft.segments);
  // Debug logging removed in production
  const normalizedOptions = normalizeOptions(draft.options);

  // 写回归一化后的选项
  draft.options = normalizedOptions;

  if (!draft.paragraphs) {
    draft.paragraphs = [];
  }

  // 从断点恢复（组）
  let groupIndex = Math.min(
    Math.max(draft.lastProcessedGroupIndex ?? 0, 0),
    groups.length
  );

  // 如果已经处理完所有组，直接返回
  if (groupIndex >= groups.length) {
    draft.lastProcessedGroupIndex = groups.length;
    draft.lastProcessedWordIndex = 0;
    return draft;
  }

  for (; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex];
    const words = group.words;
    const totalWords = words.length;
    const wordIndexLookup = new Map<string, number>();
    words.forEach((w, idx) => wordIndexLookup.set(w.id, idx));

    // 从断点恢复（词）
    let cursor = Math.min(
      Math.max(draft.lastProcessedWordIndex ?? 0, 0),
      totalWords
    );

    while (cursor < totalWords) {
      const { start, end, isLast } = computeChunkRange(
        totalWords,
        cursor,
        normalizedOptions
      );

      if (end <= start) {
        cursor = ensureCursorProgress(cursor, start + 1, totalWords);
        draft.lastProcessedGroupIndex = groupIndex;
        draft.lastProcessedWordIndex = cursor;
        await onChunkResult(draft);
        continue;
      }

      const { paragraphs: chunkParagraphs } = await polishWords(
        words.slice(start, end)
      );

      const mappedParagraphs = mapParagraphsToGlobalRanges(
        chunkParagraphs,
        wordIndexLookup
      );

      let nextCursor = end;
      if (!isLast && mappedParagraphs.length > 0) {
        const tail = mappedParagraphs[mappedParagraphs.length - 1];
        const stableParagraphs = mappedParagraphs
          .slice(0, -1)
          .map((p) => ({ ...p.paragraph, speakerId: group.speakerId }));
        draft.paragraphs.push(...stableParagraphs);

        if (tail.firstWordIndex !== null) {
          nextCursor = tail.firstWordIndex;
        } else {
          nextCursor = computeFallbackCursor(
            start,
            end,
            normalizedOptions,
            totalWords
          );
        }
      } else if (!isLast && mappedParagraphs.length === 0) {
        nextCursor = computeFallbackCursor(
          start,
          end,
          normalizedOptions,
          totalWords
        );
      } else {
        draft.paragraphs.push(
          ...mappedParagraphs.map((p) => ({ ...p.paragraph, speakerId: group.speakerId }))
        );
        nextCursor = totalWords;
      }

      nextCursor = ensureCursorProgress(cursor, nextCursor, totalWords);
      draft.lastProcessedGroupIndex = groupIndex;
      draft.lastProcessedWordIndex = nextCursor;
      cursor = nextCursor;

      await onChunkResult(draft);
    }

    // 切换到下一组，重置组内词游标
    draft.lastProcessedWordIndex = 0;
  }

  // 所有组处理完毕
  draft.lastProcessedGroupIndex = groups.length;
  draft.lastProcessedWordIndex = 0;
  return draft;
};
