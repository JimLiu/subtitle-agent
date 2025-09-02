import {
  generateId,
  joinWordsText,
  Paragraph,
  realignWordTimestamps,
  Word,
} from "@subtitle-agent/core";
import { correctTextWithLLM } from "@subtitle-agent/ai";

const createParagraph = (words: Word[]): Paragraph => {
  if (words.length === 0) {
    return {
      id: generateId(),
      start: 0,
      end: 0,
      text: "",
      words: [],
    };
  }

  return {
    id: generateId(),
    start: words[0].start,
    end: words[words.length - 1].end,
    text: words.map((w) => w.text).join(" "),
    words,
  };
};

export const polish = async (
  words: Word[]
): Promise<{
  paragraphs: Paragraph[];
  correctedWords: Word[];
}> => {
  // Join words text for LLM processing
  const originalText = joinWordsText(words);

  // Correct text with LLM
  const correctionResult = await correctTextWithLLM(originalText);

  if (!correctionResult.success) {
    throw new Error("Failed to correct text with LLM");
  }

  // Realign word timestamps based on corrected text
  const correctedWords = realignWordTimestamps(
    words,
    correctionResult.correctedText
  );

  // Group words into paragraphs based on newlines
  const paragraphs: Paragraph[] = [];
  let currentWords: Word[] = [];

  for (let i = 0; i < correctedWords.length; i++) {
    const word = correctedWords[i];

    // Check if newline starts the word
    if (word.text.startsWith("\n")) {
      // End current paragraph if it has words
      if (currentWords.length > 0) {
        paragraphs.push(createParagraph(currentWords));
        currentWords = [];
      }

      // Add word to new paragraph with newline trimmed
      const cleanedWord = { ...word, text: word.text.replace(/^\n+/, "") };
      if (cleanedWord.text) {
        currentWords.push(cleanedWord);
      }
    }
    // Check if newline ends the word
    else if (word.text.endsWith("\n")) {
      // Add word to current paragraph with newline trimmed
      const cleanedWord = { ...word, text: word.text.replace(/\n+$/, "") };
      if (cleanedWord.text) {
        currentWords.push(cleanedWord);
      }

      // End current paragraph
      if (currentWords.length > 0) {
        paragraphs.push(createParagraph(currentWords));
        currentWords = [];
      }
    }
    // Regular word without newlines
    else {
      currentWords.push(word);
    }
  }

  // Add remaining words as final paragraph
  if (currentWords.length > 0) {
    paragraphs.push(createParagraph(currentWords));
  }

  // Handle empty correctedWords array
  if (paragraphs.length === 0 && correctedWords.length === 0) {
    paragraphs.push(createParagraph([]));
  }

  return {
    paragraphs,
    correctedWords,
  };
};
