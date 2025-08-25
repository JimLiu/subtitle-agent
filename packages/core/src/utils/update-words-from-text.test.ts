import { describe, it, expect } from "vitest";
import { updateWordsFromText } from "./update-words-from-text";
import type { Word } from "../types/subtitle";

describe("updateWordsFromText", () => {
  // Test case 1: Empty inputs
  it("should handle empty inputs correctly", () => {
    // Empty original words
    expect(updateWordsFromText([], "some text")).toEqual([]);

    // Empty new text
    const originalWords: Word[] = [
      { id: "word-1", text: "hello", start: 0, end: 500 },
    ];
    expect(updateWordsFromText(originalWords, "")).toEqual([]);
  });

  // Test case 2: No changes in text
  it("should preserve words when text is unchanged", () => {
    const originalWords: Word[] = [
      { id: "word-1", text: "hello", start: 0, end: 500 },
      { id: "word-2", text: " world", start: 500, end: 1000 },
    ];
    const newText = "hello world";

    const result = updateWordsFromText(originalWords, newText);

    // Expect the result to be the same as original (except possibly id)
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("hello");
    expect(result[0].start).toBe(0);
    expect(result[0].end).toBe(500);
    expect(result[1].text).toBe(" world");
    expect(result[1].start).toBe(500);
    expect(result[1].end).toBe(1000);
  });

  // Test case 3: Add one word in the middle
  it("should handle inserting a word in the middle", () => {
    const originalWords: Word[] = [
      { id: "word-1", text: "hello", start: 0, end: 500 },
      { id: "word-2", text: " world", start: 500, end: 1000 },
    ];
    const newText = "hello beautiful world";

    const result = updateWordsFromText(originalWords, newText);

    // Expect 3 words with the new one in the middle
    expect(result).toHaveLength(3);
    expect(result[0].text).toBe("hello");
    expect(result[0].start).toBe(0);
    expect(result[0].end).toBe(500);
    expect(result[1].text).toBe(" beautiful");
    // The middle word should have start/end between the original words
    expect(result[1].start).toBe(500);
    expect(result[1].end).toBe(500);
    expect(result[2].text).toBe(" world");
    expect(result[2].start).toBe(500);
    expect(result[2].end).toBe(1000);
  });

  // Test case 4: Add multiple words in different positions
  it("should handle inserting multiple words", () => {
    const originalWords: Word[] = [
      { id: "word-1", text: "I", start: 0, end: 100 },
      { id: "word-2", text: " coding", start: 100, end: 500 },
    ];
    const newText = "I really love coding today";

    const result = updateWordsFromText(originalWords, newText);

    // Expect 5 words with new ones inserted
    expect(result).toHaveLength(5);
    expect(result[0].text).toBe("I");
    expect(result[3].text).toBe(" coding");
    expect(result[4].text).toBe(" today");

    // Check the order of words is maintained
    const texts = result.map((word) => word.text);
    expect(texts).toEqual(["I", " really", " love", " coding", " today"]);
  });

  // Test case 5: Remove words
  it("should handle removing words", () => {
    const originalWords: Word[] = [
      { id: "word-1", text: "I", start: 0, end: 100 },
      { id: "word-2", text: " really", start: 100, end: 300 },
      { id: "word-3", text: " love", start: 300, end: 500 },
      { id: "word-4", text: " coding", start: 500, end: 800 },
    ];
    const newText = "I love coding";

    const result = updateWordsFromText(originalWords, newText);

    // Expect 3 words, with "really" removed
    expect(result).toHaveLength(3);
    const texts = result.map((word) => word.text);
    expect(texts).toEqual(["I", " love", " coding"]);

    // Check timings are preserved for remaining words
    expect(result[0].start).toBe(0);
    expect(result[0].end).toBe(100);
    expect(result[1].start).toBe(300);
    expect(result[1].end).toBe(500);
    expect(result[2].start).toBe(500);
    expect(result[2].end).toBe(800);
  });

  // Test case 6: Replace words with similar words (test the similarity threshold)
  it("should handle replacing words with similar words", () => {
    const originalWords: Word[] = [
      { id: "word-1", text: "testing", start: 0, end: 500 },
      { id: "word-2", text: " function", start: 500, end: 1000 },
    ];
    const newText = "tests functions";

    const result = updateWordsFromText(originalWords, newText);

    // Words are similar enough to be considered the same with edits
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("tests");
    expect(result[1].text).toBe(" functions");

    // Timing should be preserved since words are similar enough
    expect(result[0].start).toBe(0);
    expect(result[0].end).toBe(500);
    expect(result[1].start).toBe(500);
    expect(result[1].end).toBe(1000);
  });

  // Test case 7: Complex scenario with mixed operations
  it("should handle complex changes with additions, removals and modifications", () => {
    const originalWords: Word[] = [
      { id: "word-1", text: "The", start: 0, end: 100 },
      { id: "word-2", text: " quick", start: 100, end: 300 },
      { id: "word-3", text: " brown", start: 300, end: 500 },
      { id: "word-4", text: " fox", start: 500, end: 600 },
      { id: "word-5", text: " jumps", start: 600, end: 800 },
    ];
    const newText = "A quick red fox leaps and jumps";

    const result = updateWordsFromText(originalWords, newText);

    // Check the words are in the correct order
    const texts = result.map((word) => word.text);
    expect(texts).toEqual([
      "A",
      " quick",
      " red",
      " fox",
      " leaps",
      " and",
      " jumps",
    ]);

    // "quick", "fox" and "jumps" should be preserved with their original timing
    const quickWord = result.find((word) => word.text === " quick");
    const foxWord = result.find((word) => word.text === " fox");
    const jumpsWord = result.find((word) => word.text === " jumps");

    expect(quickWord?.start).toBe(100);
    expect(quickWord?.end).toBe(300);
    expect(foxWord?.start).toBe(500);
    expect(foxWord?.end).toBe(600);
    expect(jumpsWord?.start).toBe(600);
    expect(jumpsWord?.end).toBe(800);
  });

  // Test case 8: Test with CJK characters
  it("should handle CJK characters correctly", () => {
    const originalWords: Word[] = [
      { id: "word-1", text: "你好", start: 0, end: 500 },
      { id: "word-2", text: "世界", start: 500, end: 1000 },
    ];
    const newText = "你好美丽世界";

    const result = updateWordsFromText(originalWords, newText);

    // Expect original words to be preserved and new word inserted
    expect(result).toHaveLength(6);
    expect(result[0].text).toBe("你");
    expect(result[1].text).toBe("好");
    expect(result[2].text).toBe("美");
    expect(result[3].text).toBe("丽");
    expect(result[4].text).toBe("世");
    expect(result[5].text).toBe("界");

    // Check timing
    expect(result[0].start).toBe(0);
    expect(result[1].end).toBe(500);
    expect(result[2].start).toBe(500);
    expect(result[2].end).toBe(500);
    expect(result[5].end).toBe(1000);
  });

  // Test case 9: Word with punctuation
  it("should handle punctuation correctly", () => {
    const originalWords: Word[] = [
      { id: "word-1", text: "Hello", start: 0, end: 500 },
      { id: "word-2", text: " world!", start: 500, end: 1000 },
    ];
    const newText = "Hello, beautiful world!";

    const result = updateWordsFromText(originalWords, newText);

    // Expect punctuation to be handled correctly
    expect(result).toHaveLength(3);
    expect(result[0].text).toBe("Hello,");
    expect(result[1].text).toBe(" beautiful");
    expect(result[2].text).toBe(" world!");
  });

  // Test case 10: Real whisper.json data case - merging hyphenated words
  it("should handle real whisper.json data with text corrections", () => {
    // Based on real whisper.json data from Andrew Ng video
    const originalWords: Word[] = [
      { id: "word-1", text: " And", start: 16.38, end: 16.54 },
      { id: "word-2", text: " because", start: 16.54, end: 16.84 },
      { id: "word-3", text: " we", start: 16.84, end: 16.96 },
      { id: "word-4", text: " co", start: 16.96, end: 17.2 },
      { id: "word-5", text: "-founded", start: 17.2, end: 17.46 },
      { id: "word-6", text: " startups,", start: 17.46, end: 17.86 },
      { id: "word-7", text: " we're", start: 18.2, end: 18.28 },
      { id: "word-8", text: " in", start: 18.28, end: 18.48 },
      { id: "word-9", text: " there,", start: 18.48, end: 18.76 },
      { id: "word-10", text: " writing", start: 18.8, end: 19.06 },
      { id: "word-11", text: " code,", start: 19.06, end: 19.26 },
    ];

    // Simulate editing the transcription to merge "co" + "-founded" into "co-founded"
    const newText =
      " And because we co-founded startups, we're in there, writing code,";

    const result = updateWordsFromText(originalWords, newText);

    // Expect the hyphenated word to be merged while preserving other words
    expect(result).toHaveLength(10);

    // Check the merged word
    const coFoundedWord = result.find((word) => word.text === " co-founded");
    expect(coFoundedWord).toBeDefined();
    expect(coFoundedWord?.start).toBe(16.96); // Start time of "co"
    expect(coFoundedWord?.end).toBe(17.46); // End time of "-founded"

    // Check other words remain unchanged
    expect(result[0].text).toBe(" And");
    expect(result[0].start).toBe(16.38);
    expect(result[0].end).toBe(16.54);

    expect(result[1].text).toBe(" because");
    expect(result[1].start).toBe(16.54);
    expect(result[1].end).toBe(16.84);

    // Check the order of all words
    const texts = result.map((word) => word.text);
    expect(texts).toEqual([
      " And",
      " because",
      " we",
      " co-founded",
      " startups,",
      " we're",
      " in",
      " there,",
      " writing",
      " code,",
    ]);
  });
});
