import {
  TranslatedParagraph,
  TranslatedSegment,
  TranslatedSubtitle,
} from "@subtitle-agent/core";
import {
  translateSegments as translateSegmentsWithLLM,
  type SegmentTranslationResult,
} from "@subtitle-agent/ai";
import type { SubtitleTranslationDraft } from "./translate-paragraphs";

const DEFAULT_MAX_PARAGRAPHS_PER_REQUEST = 25;
const DEFAULT_OVERLAP_PARAGRAPHS = 4;

export interface SegmentTranslationOptions {
  maxParagraphsPerRequest?: number;
  overlapParagraphs?: number;
}

type SegmentTranslationDraft = SubtitleTranslationDraft & {
  segmentOptions?: SegmentTranslationOptions;
  lastProcessedSegmentParagraphIndex?: number;
};

export type SegmentTranslationChunkHandler = (
  draft: SubtitleTranslationDraft
) => void | Promise<void>;

const noopChunkHandler: SegmentTranslationChunkHandler = async () => {};

const normalizeOptions = (
  options?: SegmentTranslationOptions
): Required<SegmentTranslationOptions> => {
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
  options: Required<SegmentTranslationOptions>
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

const hasSegments = (paragraph: TranslatedParagraph): boolean => {
  return Array.isArray(paragraph.segments) && paragraph.segments.length > 0;
};

const hasSegmentTranslation = (segment: TranslatedSegment): boolean => {
  return Boolean(segment.translation && segment.translation.trim().length > 0);
};

const isSingleSegmentParagraph = (paragraph: TranslatedParagraph): boolean => {
  return hasSegments(paragraph) && paragraph.segments!.length === 1;
};

const maybePopulateSingleSegmentTranslation = (
  paragraph: TranslatedParagraph
): boolean => {
  if (
    !isSingleSegmentParagraph(paragraph) ||
    hasSegmentTranslation(paragraph.segments![0])
  ) {
    return false;
  }

  const paragraphTranslation = paragraph.translation?.trim();
  if (!paragraphTranslation) {
    return false;
  }

  const [segment] = paragraph.segments!;
  paragraph.segments = [
    {
      ...segment,
      translation: paragraphTranslation,
    },
  ];

  return true;
};

const hasPendingSegments = (paragraph: TranslatedParagraph): boolean => {
  if (!hasSegments(paragraph)) {
    return false;
  }

  if (isSingleSegmentParagraph(paragraph)) {
    maybePopulateSingleSegmentTranslation(paragraph);
    return !hasSegmentTranslation(paragraph.segments![0]);
  }

  return paragraph.segments!.some((segment) => !hasSegmentTranslation(segment));
};

const findNextPendingSegmentParagraphIndex = (
  paragraphs: TranslatedParagraph[]
): number => {
  for (let index = 0; index < paragraphs.length; index++) {
    if (hasPendingSegments(paragraphs[index])) {
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
  return paragraphs
    .slice(contextStart, chunkStart)
    .filter(
      (paragraph) =>
        hasSegments(paragraph) && paragraph.segments!.every(hasSegmentTranslation)
    );
};

const getSegmentPromptId = (
  paragraphId: string,
  segment: TranslatedSegment,
  index: number
): string => segment.id ?? `${paragraphId}-segment-${index}`;

const createSegmentKey = (paragraphId: string, segmentId: string): string =>
  `${paragraphId}::${segmentId}`;

const mapTranslationsBySegment = (
  translatedParagraphs: SegmentTranslationResult[]
): Map<string, string> => {
  const translations = new Map<string, string>();

  for (const { id: paragraphId, segments } of translatedParagraphs) {
    for (const { id: segmentId, translation } of segments) {
      translations.set(createSegmentKey(paragraphId, segmentId), translation);
    }
  }

  return translations;
};

export const translateSegments = async (
  draft: SegmentTranslationDraft,
  onChunkResult: SegmentTranslationChunkHandler = noopChunkHandler
): Promise<TranslatedSubtitle> => {
  const translatedSubtitle = draft.translatedSubtitle;
  if (!translatedSubtitle) {
    throw new Error(
      "Cannot translate segments before paragraphs have been translated."
    );
  }

  const paragraphs = translatedSubtitle.paragraphs;
  const totalParagraphs = paragraphs.length;

  if (!totalParagraphs) {
    draft.lastProcessedSegmentParagraphIndex = 0;
    return translatedSubtitle;
  }

  const normalizedOptions = normalizeOptions(draft.segmentOptions);
  draft.segmentOptions = normalizedOptions;

  let cursor = Math.min(
    Math.max(
      draft.lastProcessedSegmentParagraphIndex ??
        findNextPendingSegmentParagraphIndex(paragraphs),
      0
    ),
    totalParagraphs
  );

  if (cursor >= totalParagraphs) {
    draft.lastProcessedSegmentParagraphIndex = totalParagraphs;
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
      draft.lastProcessedSegmentParagraphIndex = cursor;
      await onChunkResult(draft);
      continue;
    }

    const chunk = paragraphs.slice(start, end);
    const paragraphsNeedingTranslation = chunk.filter(hasPendingSegments);

    if (paragraphsNeedingTranslation.length > 0) {
      const contextParagraphs = collectContextParagraphs(
        paragraphs,
        start,
        normalizedOptions.overlapParagraphs
      );

      const promptParagraphs = paragraphsNeedingTranslation.map((paragraph) => ({
        ...paragraph,
        segments: paragraph.segments!
          .filter((segment) => !hasSegmentTranslation(segment))
          .map((segment) => ({ ...segment })),
      }));

      const translatedChunk = await translateSegmentsWithLLM(
        promptParagraphs,
        contextParagraphs
      );

      const translationsMap = mapTranslationsBySegment(translatedChunk);

      for (let index = start; index < end; index++) {
        const paragraph = paragraphs[index];
        if (!hasSegments(paragraph)) {
          continue;
        }

        const updatedSegments = paragraph.segments!.map((segment, segmentIndex) => {
          const key = createSegmentKey(
            paragraph.id,
            getSegmentPromptId(paragraph.id, segment, segmentIndex)
          );
          const translated = translationsMap.get(key)?.trim();
          return translated
            ? {
                ...segment,
                translation: translated,
              }
            : segment;
        });

        paragraphs[index] = {
          ...paragraph,
          segments: updatedSegments,
        };
      }
    }

    cursor = ensureCursorProgress(cursor, end, totalParagraphs);
    draft.lastProcessedSegmentParagraphIndex = cursor;
    await onChunkResult(draft);
  }

  draft.lastProcessedSegmentParagraphIndex = totalParagraphs;
  return translatedSubtitle;
};
