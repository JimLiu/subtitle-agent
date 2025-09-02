import { describe, it, expect } from "vitest";
import { realignWordTimestamps } from "./word-alignment";
import { Word } from "../types/subtitle";

describe("realignWordTimestamps", () => {
  const createWord = (
    id: string,
    text: string,
    start: number,
    end: number
  ): Word => ({
    id,
    text,
    start,
    end,
  });

  describe("unchanged words", () => {
    it("should preserve timestamps for unchanged words", () => {
      const originalWords: Word[] = [
        createWord("1", "hello", 0, 1),
        createWord("2", " world", 1, 2),
      ];
      const correctedText = "hello world";

      const result = realignWordTimestamps(originalWords, correctedText);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: "1", text: "hello", start: 0, end: 1 });
      expect(result[1]).toEqual({ id: "2", text: " world", start: 1, end: 2 });
    });
  });

  describe("modified words", () => {
    it("should update text while preserving timestamps", () => {
      const originalWords: Word[] = [
        createWord("1", "helo", 0, 1),
        createWord("2", " wrold", 1, 2),
      ];
      const correctedText = "hello world";

      const result = realignWordTimestamps(originalWords, correctedText);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: "1", text: "hello", start: 0, end: 1 });
      expect(result[1]).toEqual({ id: "2", text: " world", start: 1, end: 2 });
    });
  });

  describe("removed words", () => {
    it("should remove words that are not in corrected text", () => {
      const originalWords: Word[] = [
        createWord("1", "hello", 0, 1),
        createWord("2", " extra", 1, 1.5),
        createWord("3", " world", 1.5, 2),
      ];
      const correctedText = "hello world";

      const result = realignWordTimestamps(originalWords, correctedText);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: "1", text: "hello", start: 0, end: 1 });
      expect(result[1]).toEqual({ id: "3", text: " world", start: 1.5, end: 2 });
    });
  });

  describe("added words", () => {
    it("should insert new words between existing words", () => {
      const originalWords: Word[] = [
        createWord("1", "hello", 0, 1),
        createWord("2", " world", 2, 3),
      ];
      const correctedText = "hello beautiful world";

      const result = realignWordTimestamps(originalWords, correctedText);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ id: "1", text: "hello", start: 0, end: 1 });

      // New word should be inserted with calculated timestamps
      const insertedWord = result[1];
      expect(insertedWord.text).toBe(" beautiful");
      expect(insertedWord.start).toBe(1); // End of previous word
      expect(insertedWord.end).toBeGreaterThan(1);
      expect(insertedWord.end).toBeLessThan(2); // Before next word start
      expect(insertedWord.id).toBeDefined();

      expect(result[2]).toEqual({ id: "2", text: " world", start: 2, end: 3 });
    });

    it("should insert word at the beginning", () => {
      const originalWords: Word[] = [createWord("1", " world", 1, 2)];
      const correctedText = "hello world";

      const result = realignWordTimestamps(originalWords, correctedText);

      expect(result).toHaveLength(2);

      const insertedWord = result[0];
      expect(insertedWord.text).toBe("hello");
      expect(insertedWord.start).toBeGreaterThanOrEqual(0);
      expect(insertedWord.end).toBeLessThanOrEqual(1); // Before original word start
      expect(insertedWord.id).toBeDefined();

      expect(result[1]).toEqual({ id: "1", text: " world", start: 1, end: 2 });
    });

    it("should insert word at the end", () => {
      const originalWords: Word[] = [createWord("1", "hello", 0, 1)];
      const correctedText = "hello world";

      const result = realignWordTimestamps(originalWords, correctedText);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: "1", text: "hello", start: 0, end: 1 });

      const insertedWord = result[1];
      expect(insertedWord.text).toBe(" world");
      expect(insertedWord.start).toBe(1); // After previous word end
      expect(insertedWord.end).toBeGreaterThan(1);
      expect(insertedWord.id).toBeDefined();
    });

    it("should handle multiple added words", () => {
      const originalWords: Word[] = [
        createWord("1", "hello", 0, 1),
        createWord("2", " world", 3, 4),
      ];
      const correctedText = "hello beautiful amazing world";

      const result = realignWordTimestamps(originalWords, correctedText);

      expect(result).toHaveLength(4);
      expect(result[0]).toEqual({ id: "1", text: "hello", start: 0, end: 1 });

      // First inserted word
      expect(result[1].text).toBe(" beautiful");
      expect(result[1].start).toBe(1);

      // Second inserted word
      expect(result[2].text).toBe(" amazing");
      expect(result[2].start).toBeGreaterThanOrEqual(result[1].end);
      expect(result[2].end).toBeLessThanOrEqual(3);

      expect(result[3]).toEqual({ id: "2", text: " world", start: 3, end: 4 });
    });
  });

  describe("complex scenarios", () => {
    it("should handle mixed operations: modify, remove, add", () => {
      const originalWords: Word[] = [
        createWord("1", "helo", 0, 1), // modified: hello
        createWord("2", "there", 1, 2), // removed
        createWord("3", "wrold", 2, 3), // modified: world
      ];
      const correctedText = "hello beautiful world";

      const result = realignWordTimestamps(originalWords, correctedText);

      expect(result).toHaveLength(3);

      // Modified word
      expect(result[0]).toEqual({ id: "1", text: "hello", start: 0, end: 1 });

      // Added word (replaces removed word position)
      expect(result[1].text).toBe(" beautiful");
      expect(result[1].start).toBe(1);
      expect(result[1].end).toBeLessThanOrEqual(2);

      // Modified word
      expect(result[2]).toEqual({ id: "3", text: " world", start: 2, end: 3 });
    });

    it("should handle empty corrected text", () => {
      const originalWords: Word[] = [
        createWord("1", "hello", 0, 1),
        createWord("2", "world", 1, 2),
      ];
      const correctedText = "";

      const result = realignWordTimestamps(originalWords, correctedText);

      expect(result).toHaveLength(0);
    });

    it("should handle empty original words", () => {
      const originalWords: Word[] = [];
      const correctedText = "hello world";

      const result = realignWordTimestamps(originalWords, correctedText);

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe("hello");
      expect(result[1].text).toBe(" world");
      // With no reference words, should use fallback timestamps
      expect(result[0].start).toBe(0);
      expect(result[0].end).toBe(1);
      expect(result[1].start).toBe(1); // Start after previous word ends
      expect(result[1].end).toBeGreaterThan(1);
    });

    it("should preserve word order correctly", () => {
      const originalWords: Word[] = [
        createWord("1", "one", 0, 1),
        createWord("2", " three", 2, 3),
        createWord("3", " five", 4, 5),
      ];
      const correctedText = "one two three four five six";

      const result = realignWordTimestamps(originalWords, correctedText);

      expect(result).toHaveLength(6);
      expect(result.map((w) => w.text)).toEqual([
        "one",
        " two",
        " three",
        " four",
        " five",
        " six",
      ]);

      // Original words should keep their IDs
      expect(result[0].id).toBe("1");
      expect(result[2].id).toBe("2");
      expect(result[4].id).toBe("3");

      // New words should have generated IDs
      expect(result[1].id).toBeDefined();
      expect(result[3].id).toBeDefined();
      expect(result[5].id).toBeDefined();
    });
  });

  describe("timestamp calculation edge cases", () => {
    it("should handle zero-duration original words", () => {
      const originalWords: Word[] = [
        createWord("1", "hello", 1, 1), // Zero duration
        createWord("2", " world", 1, 2),
      ];
      const correctedText = "hello beautiful world";

      const result = realignWordTimestamps(originalWords, correctedText);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ id: "1", text: "hello", start: 1, end: 1 });
      expect(result[1].text).toBe(" beautiful");
      expect(result[2]).toEqual({ id: "2", text: " world", start: 1, end: 2 });
    });

    it("should handle overlapping original timestamps", () => {
      const originalWords: Word[] = [
        createWord("1", "hello", 0, 1.5),
        createWord("2", " world", 1, 2), // Overlaps with previous
      ];
      const correctedText = "hello new world";

      const result = realignWordTimestamps(originalWords, correctedText);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ id: "1", text: "hello", start: 0, end: 1.5 });
      expect(result[1].text).toBe(" new");
      expect(result[2]).toEqual({ id: "2", text: " world", start: 1, end: 2 });
    });
  });
});
