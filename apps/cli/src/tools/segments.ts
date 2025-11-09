import {
  TranslatedParagraph,
  TranslatedSegment,
  Word,
  isEndOfSentence,
  joinWordsText,
} from "@subtitle-agent/core";

const buildSegmentId = (paragraphId: string, index: number): string =>
  `${paragraphId}-segment-${index}`;

const cloneWord = (word: Word): Word => ({ ...word });

const cloneSegment = (segment: TranslatedSegment): TranslatedSegment => ({
  ...segment,
  words: segment.words.map(cloneWord),
});

const hasWordData = (paragraph: TranslatedParagraph): boolean => {
  return Array.isArray(paragraph.words) && paragraph.words.length > 0;
};

export const createSegmentsFromParagraph = (
  paragraph: TranslatedParagraph
): TranslatedSegment[] => {
  if (paragraph.segments?.length) {
    return paragraph.segments.map(cloneSegment);
  }

  const sourceWords = hasWordData(paragraph)
    ? paragraph.words
    : paragraph.text?.trim()
    ? [
        {
          id: `${paragraph.id}-word-0`,
          text: paragraph.text.trim(),
          start: paragraph.start,
          end: paragraph.end,
        },
      ]
    : [];

  if (!sourceWords.length) {
    return [];
  }

  const segments: TranslatedSegment[] = [];
  let currentWords: Word[] = [];

  const flushSegment = () => {
    if (!currentWords.length) {
      return;
    }

    const words = currentWords.map(cloneWord);
    const text = joinWordsText(words).trim();
    if (!text) {
      currentWords = [];
      return;
    }

    const start = words[0].start;
    const end = words[words.length - 1].end;

    segments.push({
      id: buildSegmentId(paragraph.id, segments.length),
      start,
      end,
      text,
      words,
    });
    currentWords = [];
  };

  for (const word of sourceWords) {
    currentWords.push(word);
    if (isEndOfSentence(word.text)) {
      flushSegment();
    }
  }

  flushSegment();

  return segments;
};

export const ensureParagraphSegments = (
  paragraphs: TranslatedParagraph[]
): TranslatedParagraph[] => {
  return paragraphs.map((paragraph) => {
    const segments = createSegmentsFromParagraph(paragraph);
    if (!segments.length) {
      return paragraph;
    }
    return {
      ...paragraph,
      segments,
    };
  });
};
