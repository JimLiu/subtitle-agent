import {
  generateId,
  joinWordsText,
  Paragraph,
  realignWordTimestamps,
  Word,
} from "@subtitle-agent/core";
import { correctTextWithLLM } from "@subtitle-agent/ai";

// 根据给定的词数组生成段落对象，保证时间戳和文本的基本结构
const createParagraph = (words: Word[]): Paragraph => {
  if (words.length === 0) {
    // 输入为空时返回占位段落，避免后续逻辑出现 null
    return {
      id: generateId(),
      start: 0,
      end: 0,
      text: "",
      words: [],
    };
  }

  // 对非空词序列按起止时间与原文重建段落
  return {
    id: generateId(),
    start: words[0].start,
    end: words[words.length - 1].end,
    text: words.map((w) => w.text).join(" "),
    words,
  };
};

// 使用大语言模型润色词序列，并返回重新分段后的结果
export const polishWords = async (
  words: Word[]
): Promise<{
  paragraphs: Paragraph[];
  correctedWords: Word[];
}> => {
  // 将全部词拼接成连续文本，作为大模型的输入数据
  const originalText = joinWordsText(words);

  // 调用大模型完成文本纠错与润色
  const correctionResult = await correctTextWithLLM(originalText);

  if (!correctionResult.success) {
    // 大模型返回失败时直接抛错，交由上层处理
    throw new Error("Failed to correct text with LLM");
  }

  // 按润色后的文本重算每个词的时间戳，确保仍与音频同步
  const correctedWords = realignWordTimestamps(
    words,
    correctionResult.correctedText
  );

  // 依据换行符重新划分段落，准备后续输出
  const paragraphs: Paragraph[] = [];
  let currentWords: Word[] = [];

  for (let i = 0; i < correctedWords.length; i++) {
    const word = correctedWords[i];

    // 处理换行符出现在词首的情况，意味着需要切换到新段落
    if (word.text.startsWith("\n")) {
      // 段落已有内容时先封装旧段落
      if (currentWords.length > 0) {
        paragraphs.push(createParagraph(currentWords));
        currentWords = [];
      }

      // 去掉前导换行符后，再加入新段落
      const cleanedWord = { ...word, text: word.text.replace(/^\n+/, "") };
      if (cleanedWord.text) {
        currentWords.push(cleanedWord);
      }
    }
    // 处理换行符出现在词尾的情况，表示当前段落需要收尾
    else if (word.text.endsWith("\n")) {
      // 去掉末尾换行符后加入当前段落
      const cleanedWord = { ...word, text: word.text.replace(/\n+$/, "") };
      if (cleanedWord.text) {
        currentWords.push(cleanedWord);
      }

      // 封装当前段落，后续开启新段落
      if (currentWords.length > 0) {
        paragraphs.push(createParagraph(currentWords));
        currentWords = [];
      }
    }
    // 没有换行符的普通词，直接继续累积
    else {
      currentWords.push(word);
    }
  }

  // 循环结束后若还有剩余词，补齐最后一个段落
  if (currentWords.length > 0) {
    paragraphs.push(createParagraph(currentWords));
  }

  // 极端情况下完全没有词也返回一个空段落，统一返回结构
  if (paragraphs.length === 0 && correctedWords.length === 0) {
    paragraphs.push(createParagraph([]));
  }

  // 返回润色后的段落集合，以及带有新时间戳的词
  return {
    paragraphs,
    correctedWords,
  };
};

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
  words: Word[];
  lastProcessedWordIndex?: number;
  paragraphs?: Paragraph[];
  options?: ParagraphBuilderOptions;
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

// 迭代分块润色整篇文本，并在每个区块完成后回调通知外部
export const polish = async (
  draft: ParagraphBuilderDraft,
  onChunkResult: (draft: ParagraphBuilderDraft) => void | Promise<void>
): Promise<ParagraphBuilderDraft> => {
  // 预先计算总词数并规范化选项，避免每轮重复操作
  const totalWords = draft.words.length;
  const normalizedOptions = normalizeOptions(draft.options);
  const wordIndexLookup = new Map<string, number>();
  draft.words.forEach((word, index) => {
    // 建立词 ID 到序号的映射，方便定位到全局数组
    wordIndexLookup.set(word.id, index);
  });

  // 将规范化后的选项写回草稿，便于外部读取最终配置
  draft.options = normalizedOptions;

  if (!draft.paragraphs) {
    // 初始化段落收集容器
    draft.paragraphs = [];
  }

  // 确定初始游标，既照顾断点续跑又防止越界
  let cursor = Math.min(
    Math.max(draft.lastProcessedWordIndex ?? 0, 0),
    totalWords
  );

  while (cursor < totalWords) {
    // 依据当前游标确定本轮需要处理的词区间
    const { start, end, isLast } = computeChunkRange(
      totalWords,
      cursor,
      normalizedOptions
    );

    if (end <= start) {
      // 防御性逻辑：异常区间时推进游标并通知外部
      cursor = ensureCursorProgress(cursor, start + 1, totalWords);
      draft.lastProcessedWordIndex = cursor;
      await onChunkResult(draft);
      continue;
    }

    // 对当前区块执行润色，返回对应的新段落
    const { paragraphs: chunkParagraphs } = await polishWords(
      draft.words.slice(start, end)
    );

    // 将段落映射回全局索引，判断稳定段与重叠段
    const mappedParagraphs = mapParagraphsToGlobalRanges(
      chunkParagraphs,
      wordIndexLookup
    );

    let nextCursor = end;
    // 默认情况下认为下一次从当前区块末尾继续
    if (!isLast && mappedParagraphs.length > 0) {
      const tail = mappedParagraphs[mappedParagraphs.length - 1];
      const stableParagraphs = mappedParagraphs.slice(0, -1).map((p) => p.paragraph);
      draft.paragraphs.push(...stableParagraphs);

      if (tail.firstWordIndex !== null) {
        // 若尾段有明确覆盖范围，回退到该段首部重算
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
      // 未生成任何段落时再试一次，防止模型删空导致停滞
      nextCursor = computeFallbackCursor(
        start,
        end,
        normalizedOptions,
        totalWords
      );
    } else {
      // 已到最后区块或所有段落都稳定，直接合并入结果
      draft.paragraphs.push(...mappedParagraphs.map((p) => p.paragraph));
      nextCursor = totalWords;
    }

    // 无论如何都确保游标前进到合法位置
    nextCursor = ensureCursorProgress(cursor, nextCursor, totalWords);

    draft.lastProcessedWordIndex = nextCursor;
    cursor = nextCursor;

    // 每处理完一个块便触发回调，方便增量输出或保存
    await onChunkResult(draft);
  }

  // 所有区块处理完毕后返回最终草稿
  return draft;
};
