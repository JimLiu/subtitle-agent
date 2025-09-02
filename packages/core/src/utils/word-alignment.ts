import { Word } from "../types/subtitle";
import { generateTextMaterialWordsText, areWordsSame } from "./words";
import { diffWords } from "./diff-words";
import { generateId } from "./ids";

/**
 * Realigns word timestamps after text correction
 * @param originalWords Original words with timestamps
 * @param correctedText Corrected text from LLM
 * @returns New words array with realigned timestamps
 */
export function realignWordTimestamps(
  originalWords: Word[],
  correctedText: string
): Word[] {
  // Split corrected text into word tokens
  const correctedWordTexts = generateTextMaterialWordsText(correctedText);

  // Compute differences between original and corrected
  const diffs = diffWords(originalWords, correctedWordTexts, areWordsSame);

  const result: Word[] = [];
  let originalIndex = 0;

  for (const diff of diffs) {
    switch (diff.type) {
      case "unchanged":
        // Keep original word with same timestamps
        result.push({
          ...diff.word,
        });
        originalIndex++;
        break;

      case "modified":
        // Keep original timestamps but update text
        result.push({
          ...diff.word,
          text: diff.text,
        });
        originalIndex++;
        break;

      case "removed":
        // Skip removed words (don't add to result)
        originalIndex++;
        break;

      case "added": {
        // Insert new word with calculated timestamps
        const insertedWord = createInsertedWord(
          diff.text,
          originalWords,
          result,
          originalIndex
        );
        result.push(insertedWord);
        break;
      }
    }
  }

  return result;
}

/**
 * Creates a new word with calculated timestamps for inserted words
 */
function createInsertedWord(
  text: string,
  originalWords: Word[],
  processedWords: Word[],
  originalIndex: number
): Word {
  let start: number;
  let end: number;

  // Get the previous processed word for reference
  const previousWord =
    processedWords.length > 0
      ? processedWords[processedWords.length - 1]
      : null;

  // Get the next original word for reference
  const nextOriginalWord =
    originalIndex < originalWords.length ? originalWords[originalIndex] : null;

  if (previousWord && nextOriginalWord) {
    // Insert between previous and next words
    const gap = nextOriginalWord.start - previousWord.end;
    const textRatio = calculateTextRatio(
      text,
      previousWord.text,
      nextOriginalWord.text
    );

    start = previousWord.end;
    end = previousWord.end + gap * textRatio;
  } else if (previousWord) {
    // Insert after the last word
    const avgDuration = calculateAverageDuration(originalWords);
    const textRatio = calculateTextRatioSingle(text, previousWord.text);
    const duration = avgDuration * textRatio;

    start = previousWord.end;
    end = start + duration;
  } else if (nextOriginalWord) {
    // Insert before the first word
    const avgDuration = calculateAverageDuration(originalWords);
    const textRatio = calculateTextRatioSingle(text, nextOriginalWord.text);
    const duration = avgDuration * textRatio;

    end = nextOriginalWord.start;
    start = Math.max(0, end - duration);
  } else {
    // Fallback: no reference words available
    start = 0;
    end = 1;
  }

  return {
    id: generateId(),
    text,
    start,
    end,
  };
}

/**
 * Calculates text ratio for timing between two reference words
 */
function calculateTextRatio(
  insertedText: string,
  prevText: string,
  nextText: string
): number {
  const insertedLength = insertedText.length;
  const totalLength = prevText.length + insertedLength + nextText.length;

  if (totalLength === 0) return 0.5;
  return insertedLength / totalLength;
}

/**
 * Calculates text ratio for timing based on single reference word
 */
function calculateTextRatioSingle(
  insertedText: string,
  refText: string
): number {
  const insertedLength = insertedText.length;
  const refLength = refText.length;

  if (refLength === 0) return 1;
  return insertedLength / refLength;
}

/**
 * Calculates average word duration from original words
 */
function calculateAverageDuration(words: Word[]): number {
  if (words.length === 0) return 1;

  const totalDuration = words.reduce(
    (sum, word) => sum + (word.end - word.start),
    0
  );
  return totalDuration / words.length;
}
