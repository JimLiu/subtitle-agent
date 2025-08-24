import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateTextMaterialWordsText, importWords } from "./words";

vi.mock("./ids", () => ({
  generateId: vi.fn(() => "test-id-" + Math.random().toString(36).substring(7)),
}));

/**
 * Test suite for words.ts utility functions
 *
 * Tests cover:
 * 1. generateTextMaterialWordsText:
 *    - Basic text splitting (English, spaces, punctuation)
 *    - Contractions and hyphenated words
 *    - Abbreviations with periods (Dr., St., etc.)
 *    - Unicode support (Chinese, Japanese, Korean)
 *    - Special cases (URLs, emails, emojis, currency)
 *    - Edge cases (empty strings, only spaces, only punctuation)
 *
 * 2. importWords:
 *    - Basic word object conversion
 *    - Time distribution based on character count
 *    - Handling both 'word' and 'text' properties
 *    - Text splitting and flattening
 *    - Chinese text handling
 *    - Edge cases (zero duration, long text, special chars)
 *    - ID generation uniqueness
 */
describe("words utils", () => {
  describe("generateTextMaterialWordsText", () => {
    it("should return empty array for empty string", () => {
      expect(generateTextMaterialWordsText("")).toEqual([]);
    });

    it("should split simple English words", () => {
      const result = generateTextMaterialWordsText("Hello world");
      expect(result).toEqual(["Hello", " world"]);
    });

    it("should handle punctuation correctly", () => {
      const result = generateTextMaterialWordsText("Hello, world!");
      expect(result).toEqual(["Hello,", " world!"]);
    });

    it("should handle contractions", () => {
      const result = generateTextMaterialWordsText("don't can't won't");
      expect(result).toEqual(["don't", " can't", " won't"]);
    });

    it("should handle hyphenated words", () => {
      const result = generateTextMaterialWordsText("state-of-the-art");
      expect(result).toEqual(["state-of-the-art"]);
    });

    it("should handle abbreviations with periods", () => {
      const result = generateTextMaterialWordsText(
        "Dr. Smith lives on St. Mary Rd."
      );
      expect(result).toEqual([
        "Dr.",
        " Smith",
        " lives",
        " on",
        " St.",
        " Mary",
        " Rd.",
      ]);
    });

    it("should handle Chinese characters individually", () => {
      const result = generateTextMaterialWordsText("你好世界");
      expect(result).toEqual(["你", "好", "世", "界"]);
    });

    it("should handle mixed Chinese and English", () => {
      const result = generateTextMaterialWordsText("Hello你好world世界");
      expect(result).toEqual(["Hello", "你", "好", "world", "世", "界"]);
    });

    it("should handle Japanese characters (Hiragana, Katakana)", () => {
      const result = generateTextMaterialWordsText("こんにちはワールド");
      expect(result).toEqual(["こ", "ん", "に", "ち", "は", "ワ", "ル", "ド"]);
    });

    it("should handle Korean characters", () => {
      const result = generateTextMaterialWordsText("안녕하세요");
      expect(result).toEqual(["안", "녕", "하", "세", "요"]);
    });

    it("should handle multiple spaces", () => {
      const result = generateTextMaterialWordsText("Hello    world");
      expect(result).toEqual(["Hello", "    world"]);
    });

    it("should handle multiple punctuation marks together", () => {
      const result = generateTextMaterialWordsText("What?! Really...");
      expect(result).toEqual(["What?!", " Really..."]);
    });

    it("should merge adjacent punctuation into buffer", () => {
      const result = generateTextMaterialWordsText("Hello... World!!!");
      expect(result).toEqual(["Hello...", " World!!!"]);
    });

    it("should handle newlines and tabs", () => {
      const result = generateTextMaterialWordsText("Hello\nworld\tthere");
      expect(result).toEqual(["Hello", "\nworld", "\tthere"]);
    });

    it("should handle edge case with only punctuation", () => {
      const result = generateTextMaterialWordsText("...");
      expect(result).toEqual(["..."]);
    });

    it("should handle edge case with only spaces", () => {
      const result = generateTextMaterialWordsText("   ");
      expect(result).toEqual(["   "]);
    });

    it("should handle trailing spaces", () => {
      const result = generateTextMaterialWordsText("Hello ");
      expect(result).toEqual(["Hello", " "]);
    });

    it("should handle 1 word with hyphen", () => {
      const result = generateTextMaterialWordsText(" co-founded");
      expect(result).toEqual([" co-founded"]);
    });

    it("should handle a word starts with hyphen", () => {
      const result = generateTextMaterialWordsText("-founded");
      expect(result).toEqual(["-founded"]);
    });

    it("should handle a word ends with hyphen", () => {
      const result = generateTextMaterialWordsText("founded-");
      expect(result).toEqual(["founded-"]);
    });

    it("should handle mixed scripts and punctuation", () => {
      const result = generateTextMaterialWordsText(
        "English中文, 日本語! 한국어?"
      );
      expect(result).toEqual([
        "English",
        "中",
        "文,",
        " 日",
        "本",
        "語!",
        " 한",
        "국",
        "어?",
      ]);
    });

    it("should handle URLs", () => {
      const result = generateTextMaterialWordsText(
        "Visit https://example.com/path"
      );
      expect(result).toEqual([
        "Visit",
        " https://",
        "example.",
        "com/",
        "path",
      ]);
    });

    it("should handle email addresses", () => {
      const result = generateTextMaterialWordsText("Email: test@example.com");
      expect(result).toEqual(["Email:", " test@", "example.", "com"]);
    });

    it("should handle special Unicode characters", () => {
      const result = generateTextMaterialWordsText("Hello 👋 World 🌍");
      // Emojis are not matched by the regex, so they become part of whitespace
      expect(result).toEqual(["Hello", "  World", " "]);
    });

    it("should handle currency symbols", () => {
      const result = generateTextMaterialWordsText("Price: $100.00 or €50.00");
      // Currency symbols are treated as punctuation and merged with following text
      expect(result).toEqual(["Price:", " 100.", "00", " or", " 50.", "00"]);
    });
  });

  describe("importWords", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should convert simple word objects", () => {
      const originalWords = [
        {
          start: 0,
          end: 1000,
          word: "Hello",
        },
      ];

      const result = importWords(originalWords);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        start: 0,
        end: 1000,
        text: "Hello",
      });
      expect(result[0].id).toBeDefined();
    });

    it("should handle text property instead of word property", () => {
      const originalWords = [
        {
          start: 0,
          end: 1000,
          text: "Hello",
        },
      ];

      const result = importWords(originalWords);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        start: 0,
        end: 1000,
        text: "Hello",
      });
    });

    it("should split words with multiple tokens", () => {
      const originalWords = [
        {
          start: 0,
          end: 2000,
          word: "Hello world",
        },
      ];

      const result = importWords(originalWords);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        start: 0,
        text: "Hello",
      });
      expect(result[1]).toMatchObject({
        end: 2000,
        text: " world",
      });
    });

    it("should distribute time proportionally by character count", () => {
      const originalWords = [
        {
          start: 0,
          end: 1000,
          word: "Hi world", // 8 characters total: Hi(2) ' world'(6)
        },
      ];

      const result = importWords(originalWords);

      expect(result).toHaveLength(2);

      // Hi: 2/8 * 1000 = 250
      expect(result[0].start).toBe(0);
      expect(result[0].end).toBeCloseTo(250);

      // ' world': 6/8 * 1000 = 750, starting at 250
      expect(result[1].start).toBeCloseTo(250);
      expect(result[1].end).toBe(1000);
    });

    it("should handle Chinese text splitting", () => {
      const originalWords = [
        {
          start: 0,
          end: 4000,
          word: "你好世界",
        },
      ];

      const result = importWords(originalWords);

      expect(result).toHaveLength(4);
      expect(result[0].text).toBe("你");
      expect(result[1].text).toBe("好");
      expect(result[2].text).toBe("世");
      expect(result[3].text).toBe("界");

      // Each character should get 1/4 of the time
      expect(result[0]).toMatchObject({ start: 0, end: 1000 });
      expect(result[1]).toMatchObject({ start: 1000, end: 2000 });
      expect(result[2]).toMatchObject({ start: 2000, end: 3000 });
      expect(result[3]).toMatchObject({ start: 3000, end: 4000 });
    });

    it("should handle multiple words in input array", () => {
      const originalWords = [
        { start: 0, end: 1000, word: "Hello" },
        { start: 1000, end: 2000, word: "world" },
      ];

      const result = importWords(originalWords);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ start: 0, end: 1000, text: "Hello" });
      expect(result[1]).toMatchObject({
        start: 1000,
        end: 2000,
        text: "world",
      });
    });

    it("should flatten nested arrays from multiple split words", () => {
      const originalWords = [
        { start: 0, end: 1000, word: "Hello world" },
        { start: 1000, end: 2000, word: "foo bar" },
      ];

      const result = importWords(originalWords);

      expect(result).toHaveLength(4); // 2 from first word, 2 from second
      expect(result.map((w) => w.text)).toEqual([
        "Hello",
        " world",
        "foo",
        " bar",
      ]);
    });

    it("should handle empty word text", () => {
      const originalWords = [
        {
          start: 0,
          end: 1000,
          word: "",
        },
      ];

      const result = importWords(originalWords);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        start: 0,
        end: 1000,
        text: "",
      });
    });

    it("should handle punctuation in words", () => {
      const originalWords = [
        {
          start: 0,
          end: 1500,
          word: "Hello, world!",
        },
      ];

      const result = importWords(originalWords);

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe("Hello,");
      expect(result[1].text).toBe(" world!");
    });

    it("should ensure last word ends at exact end time", () => {
      const originalWords = [
        {
          start: 100,
          end: 2500,
          word: "Testing precision",
        },
      ];

      const result = importWords(originalWords);

      const lastWord = result[result.length - 1];
      expect(lastWord.end).toBe(2500);
    });

    it("should generate unique IDs for each word", () => {
      const originalWords = [
        {
          start: 0,
          end: 1000,
          word: "Hello world",
        },
      ];

      const result = importWords(originalWords);
      const ids = result.map((w) => w.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });

    it("should handle words with zero duration", () => {
      const originalWords = [
        {
          start: 1000,
          end: 1000,
          word: "instant",
        },
      ];

      const result = importWords(originalWords);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        start: 1000,
        end: 1000,
        text: "instant",
      });
    });

    it("should handle very long text", () => {
      const longText =
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit.";
      const originalWords = [
        {
          start: 0,
          end: 10000,
          word: longText,
        },
      ];

      const result = importWords(originalWords);

      expect(result.length).toBeGreaterThan(1);
      expect(result[0].start).toBe(0);
      expect(result[result.length - 1].end).toBe(10000);

      // Check that all text is preserved
      const combinedText = result.map((w) => w.text).join("");
      expect(combinedText).toBe(longText);
    });

    it("should handle special characters in text", () => {
      const originalWords = [
        {
          start: 0,
          end: 1000,
          word: "Test & <example>",
        },
      ];

      const result = importWords(originalWords);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      // The angle brackets are treated as punctuation and removed
      const combinedText = result.map((w) => w.text).join("");
      expect(combinedText).toContain("Test");
      expect(combinedText).toContain("&");
      expect(combinedText).toContain("example");
    });

    it("should preserve exact timing for single-token words", () => {
      const originalWords = [
        { start: 100, end: 200, word: "Hello" },
        { start: 200, end: 300, word: "世界" },
        { start: 300, end: 400, word: "!" },
      ];

      const result = importWords(originalWords);

      // Chinese text is split into individual characters
      expect(result).toHaveLength(4); // Hello + 世 + 界 + !
      expect(result[0]).toMatchObject({ start: 100, end: 200, text: "Hello" });
      expect(result[1].text).toBe("世");
      expect(result[2].text).toBe("界");
      expect(result[3]).toMatchObject({ start: 300, end: 400, text: "!" });
    });

    it("should handle mixed input with both word and text properties", () => {
      const originalWords = [
        { start: 0, end: 100, word: "Hello" },
        { start: 100, end: 200, text: "World" },
      ];

      const result = importWords(originalWords);

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe("Hello");
      expect(result[1].text).toBe("World");
    });
  });
});
