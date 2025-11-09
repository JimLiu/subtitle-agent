import {
  Subtitle,
  TranslatedParagraph,
  TranslatedSubtitle,
} from "@subtitle-agent/core";
import {
  translateParagraphs as translateParagraphsWithLLM,
} from "@subtitle-agent/ai";

const DEFAULT_MAX_PARAGRAPHS_PER_REQUEST = 25;
const DEFAULT_OVERLAP_PARAGRAPHS = 4;

export interface SubtitleTranslationOptions {
  maxParagraphsPerRequest?: number;
  overlapParagraphs?: number;
}

export interface SubtitleTranslationDraft {
  subtitle: Subtitle | TranslatedSubtitle;
  targetLanguage: string;
  translatedSubtitle?: TranslatedSubtitle;
  options?: SubtitleTranslationOptions;
  lastProcessedParagraphIndex?: number;
}

export type SubtitleTranslationChunkHandler = (
  draft: SubtitleTranslationDraft
) => void | Promise<void>;

const noopChunkHandler: SubtitleTranslationChunkHandler = async () => {};

const normalizeOptions = (
  options?: SubtitleTranslationOptions
): Required<SubtitleTranslationOptions> => {
  let maxParagraphsPerRequest =
    options?.maxParagraphsPerRequest ?? DEFAULT_MAX_PARAGRAPHS_PER_REQUEST;
  let overlapParagraphs = options?.overlapParagraphs ?? DEFAULT_OVERLAP_PARAGRAPHS;

  if (maxParagraphsPerRequest <= 0) {
    maxParagraphsPerRequest = DEFAULT_MAX_PARAGRAPHS_PER_REQUEST;
  }

  if (overlapParagraphs < 0) {
    overlapParagraphs = 0;
  }

  if (overlapParagraphs >= maxParagraphsPerRequest) {
    overlapParagraphs = Math.max(0, maxParagraphsPerRequest - 1);
  }

  return {
    maxParagraphsPerRequest,
    overlapParagraphs,
  };
};

const computeChunkRange = (
  totalParagraphs: number,
  cursor: number,
  options: Required<SubtitleTranslationOptions>
): { start: number; end: number } => {
  const start = Math.min(Math.max(cursor, 0), totalParagraphs);
  const end = Math.min(totalParagraphs, start + options.maxParagraphsPerRequest);
  return { start, end };
};

const ensureCursorProgress = (
  previousCursor: number,
  nextCursor: number,
  totalParagraphs: number
): number => {
  if (nextCursor <= previousCursor) {
    return Math.min(totalParagraphs, previousCursor + 1);
  }

  return Math.min(nextCursor, totalParagraphs);
};

const hasTranslation = (paragraph: TranslatedParagraph): boolean => {
  return Boolean(paragraph.translation && paragraph.translation.trim().length > 0);
};

const cloneParagraph = (
  paragraph: Subtitle["paragraphs"][number]
): TranslatedParagraph => {
  const maybeTranslated = paragraph as TranslatedParagraph;
  return {
    ...paragraph,
    words: paragraph.words.map((word) => ({ ...word })),
    translation: maybeTranslated.translation,
    segments: maybeTranslated.segments?.map((segment) => ({
      ...segment,
      words: segment.words.map((word) => ({ ...word })),
    })),
  };
};

const isTranslatedSubtitle = (
  subtitle: Subtitle | TranslatedSubtitle
): subtitle is TranslatedSubtitle => {
  return (subtitle as TranslatedSubtitle).targetLanguage !== undefined;
};

const ensureTranslatedSubtitle = (
  draft: SubtitleTranslationDraft
): TranslatedSubtitle => {
  if (
    draft.translatedSubtitle &&
    draft.translatedSubtitle.targetLanguage === draft.targetLanguage
  ) {
    return draft.translatedSubtitle;
  }

  if (
    isTranslatedSubtitle(draft.subtitle) &&
    draft.subtitle.targetLanguage === draft.targetLanguage
  ) {
    draft.translatedSubtitle = {
      ...draft.subtitle,
      targetLanguage: draft.targetLanguage,
      paragraphs: draft.subtitle.paragraphs.map(cloneParagraph),
    };
    return draft.translatedSubtitle;
  }

  const translatedSubtitle: TranslatedSubtitle = {
    ...draft.subtitle,
    targetLanguage: draft.targetLanguage,
    paragraphs: draft.subtitle.paragraphs.map(cloneParagraph),
  };

  draft.translatedSubtitle = translatedSubtitle;
  return translatedSubtitle;
};

const findNextPendingParagraphIndex = (
  paragraphs: TranslatedParagraph[]
): number => {
  for (let index = 0; index < paragraphs.length; index++) {
    if (!hasTranslation(paragraphs[index])) {
      return index;
    }
  }
  return paragraphs.length;
};

const collectContextParagraphs = (
  paragraphs: TranslatedParagraph[],
  chunkStart: number,
  overlapParagraphs: number
): TranslatedParagraph[] => {
  if (overlapParagraphs <= 0 || chunkStart <= 0) {
    return [];
  }

  const contextStart = Math.max(0, chunkStart - overlapParagraphs);
  return paragraphs.slice(contextStart, chunkStart).filter(hasTranslation);
};

export const translateParagraphs = async (
  draft: SubtitleTranslationDraft,
  onChunkResult: SubtitleTranslationChunkHandler = noopChunkHandler
): Promise<TranslatedSubtitle> => {
  const translatedSubtitle = ensureTranslatedSubtitle(draft);
  const normalizedOptions = normalizeOptions(draft.options);
  draft.options = normalizedOptions;

  const paragraphs = translatedSubtitle.paragraphs;
  const totalParagraphs = paragraphs.length;

  let cursor = Math.min(
    Math.max(
      draft.lastProcessedParagraphIndex ??
        findNextPendingParagraphIndex(paragraphs),
      0
    ),
    totalParagraphs
  );

  if (cursor >= totalParagraphs) {
    draft.lastProcessedParagraphIndex = totalParagraphs;
    return translatedSubtitle;
  }

  while (cursor < totalParagraphs) {
    const { start, end } = computeChunkRange(
      totalParagraphs,
      cursor,
      normalizedOptions
    );

    if (end <= start) {
      cursor = ensureCursorProgress(cursor, start + 1, totalParagraphs);
      draft.lastProcessedParagraphIndex = cursor;
      await onChunkResult(draft);
      continue;
    }

    const chunk = paragraphs.slice(start, end);
    const paragraphsNeedingTranslation = chunk.filter(
      (paragraph) => !hasTranslation(paragraph)
    );

    if (paragraphsNeedingTranslation.length > 0) {
      const contextParagraphs = collectContextParagraphs(
        paragraphs,
        start,
        normalizedOptions.overlapParagraphs
      );

      const translatedChunk = await translateParagraphsWithLLM(
        paragraphsNeedingTranslation,
        contextParagraphs
      );

      const translatedMap = new Map(
        translatedChunk
          .filter((paragraph) => hasTranslation(paragraph))
          .map((paragraph) => [paragraph.id, paragraph.translation!.trim()])
      );

      for (let index = start; index < end; index++) {
        const paragraph = paragraphs[index];
        const updatedTranslation = translatedMap.get(paragraph.id);
        if (updatedTranslation) {
          paragraphs[index] = {
            ...paragraph,
            translation: updatedTranslation,
          };
        }
      }
    }

    cursor = ensureCursorProgress(cursor, end, totalParagraphs);
    draft.lastProcessedParagraphIndex = cursor;
    await onChunkResult(draft);
  }

  draft.lastProcessedParagraphIndex = totalParagraphs;
  return translatedSubtitle;
};
