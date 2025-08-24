import { describe, it, expect } from "vitest";
import { diffWords } from "./diff-words";
import { Word } from "@/types/subtitle";

describe("diffWords", () => {
  // Test case 1: Identical sequences
  it("should return unchanged words when sequences are identical", () => {
    const oldWords: Word[] = [
      {
        text: "hello",
        start: 0,
        end: 5,
        id: ""
      },
      {
        text: "world",
        start: 6,
        end: 11,
        id: ""
      }
    ];
    const newWordTexts = ["hello", "world"];

    const result = diffWords(oldWords, newWordTexts);

    expect(result).toEqual([
      { word: oldWords[0], type: "unchanged" },
      { word: oldWords[1], type: "unchanged" }
    ]);
  });

  // Test case 2: Addition at the end
  it("should detect words added at the end", () => {
    const oldWords: Word[] = [
      {
        text: "hello",
        start: 0,
        end: 5,
        id: ""
      }
    ];
    const newWordTexts = ["hello", "world"];

    const result = diffWords(oldWords, newWordTexts);

    expect(result).toEqual([
      { word: oldWords[0], type: "unchanged" },
      { text: "world", type: "added" }
    ]);
  });

  // Test case 3: Addition at the beginning
  it("should detect words added at the beginning", () => {
    const oldWords: Word[] = [
      {
        text: "world",
        start: 0,
        end: 5,
        id: ""
      }
    ];
    const newWordTexts = ["hello", "world"];

    const result = diffWords(oldWords, newWordTexts);

    expect(result).toEqual([
      { text: "hello", type: "added" },
      { word: oldWords[0], type: "unchanged" }
    ]);
  });

  // Test case 4: Addition in the middle
  it("should detect words added in the middle", () => {
    const oldWords: Word[] = [
      {
        text: "hello",
        start: 0,
        end: 5,
        id: ""
      },
      {
        text: "world",
        start: 6,
        end: 11,
        id: ""
      }
    ];
    const newWordTexts = ["hello", "beautiful", "world"];

    const result = diffWords(oldWords, newWordTexts);

    expect(result).toEqual([
      { word: oldWords[0], type: "unchanged" },
      { text: "beautiful", type: "added" },
      { word: oldWords[1], type: "unchanged" }
    ]);
  });

  // Test case 5: Removal at the end
  it("should detect words removed from the end", () => {
    const oldWords: Word[] = [
      {
        text: "hello",
        start: 0,
        end: 5,
        id: ""
      },
      {
        text: "world",
        start: 6,
        end: 11,
        id: ""
      }
    ];
    const newWordTexts = ["hello"];

    const result = diffWords(oldWords, newWordTexts);

    expect(result).toEqual([
      { word: oldWords[0], type: "unchanged" },
      { word: oldWords[1], type: "removed" }
    ]);
  });

  // Test case 6: Removal at the beginning
  it("should detect words removed from the beginning", () => {
    const oldWords: Word[] = [
      {
        text: "hello",
        start: 0,
        end: 5,
        id: ""
      },
      {
        text: "world",
        start: 6,
        end: 11,
        id: ""
      }
    ];
    const newWordTexts = ["world"];

    const result = diffWords(oldWords, newWordTexts);

    expect(result).toEqual([
      { word: oldWords[0], type: "removed" },
      { word: oldWords[1], type: "unchanged" }
    ]);
  });

  // Test case 7: Removal in the middle
  it("should detect words removed from the middle", () => {
    const oldWords: Word[] = [
      {
        text: "hello",
        start: 0,
        end: 5,
        id: ""
      },
      {
        text: "beautiful",
        start: 6,
        end: 15,
        id: ""
      },
      {
        text: "world",
        start: 16,
        end: 21,
        id: ""
      }
    ];
    const newWordTexts = ["hello", "world"];

    const result = diffWords(oldWords, newWordTexts);

    expect(result).toEqual([
      { word: oldWords[0], type: "unchanged" },
      { word: oldWords[1], type: "removed" },
      { word: oldWords[2], type: "unchanged" }
    ]);
  });

  // Test case 8: Modification of a word
  it("should detect modified words", () => {
    const oldWords: Word[] = [
      {
        text: "hello",
        start: 0,
        end: 5,
        id: ""
      },
      {
        text: "world",
        start: 6,
        end: 11,
        id: ""
      }
    ];
    const newWordTexts = ["hello", "universe"];

    const result = diffWords(oldWords, newWordTexts);

    expect(result).toEqual([
      { word: oldWords[0], type: "unchanged" },
      { word: oldWords[1], text: "universe", type: "modified" }
    ]);
  });

  // Test case 9: Multiple modifications
  it("should detect multiple modifications", () => {
    const oldWords: Word[] = [
      {
        text: "hello",
        start: 0,
        end: 5,
        id: ""
      },
      {
        text: "beautiful",
        start: 6,
        end: 15,
        id: ""
      },
      {
        text: "world",
        start: 16,
        end: 21,
        id: ""
      }
    ];
    const newWordTexts = ["hi", "gorgeous", "planet"];

    const result = diffWords(oldWords, newWordTexts);

    expect(result).toEqual([
      { word: oldWords[0], text: "hi", type: "modified" },
      { word: oldWords[1], text: "gorgeous", type: "modified" },
      { word: oldWords[2], text: "planet", type: "modified" }
    ]);
  });

  // Test case 10: Empty old sequence
  it("should handle empty old sequence", () => {
    const oldWords: Word[] = [];
    const newWordTexts = ["hello", "world"];

    const result = diffWords(oldWords, newWordTexts);

    expect(result).toEqual([
      { text: "hello", type: "added" },
      { text: "world", type: "added" }
    ]);
  });

  // Test case 11: Empty new sequence
  it("should handle empty new sequence", () => {
    const oldWords: Word[] = [
      {
        text: "hello",
        start: 0,
        end: 5,
        id: ""
      },
      {
        text: "world",
        start: 6,
        end: 11,
        id: ""
      }
    ];
    const newWordTexts: string[] = [];

    const result = diffWords(oldWords, newWordTexts);

    expect(result).toEqual([
      { word: oldWords[0], type: "removed" },
      { word: oldWords[1], type: "removed" }
    ]);
  });

  // Test case 12: Complex mixed operations
  it("should handle complex mixed operations", () => {
    const oldWords: Word[] = [
      {
        text: "the",
        start: 0,
        end: 3,
        id: ""
      },
      {
        text: "quick",
        start: 4,
        end: 9,
        id: ""
      },
      {
        text: "brown",
        start: 10,
        end: 15,
        id: ""
      },
      {
        text: "fox",
        start: 16,
        end: 19,
        id: ""
      },
      {
        text: "jumps",
        start: 20,
        end: 25,
        id: ""
      }
    ];
    const newWordTexts = ["a", "quick", "red", "fox", "leaps", "high"];

    const result = diffWords(oldWords, newWordTexts);

    expect(result).toEqual([
      { word: oldWords[0], text: "a", type: "modified" },
      { word: oldWords[1], type: "unchanged" },
      { word: oldWords[2], text: "red", type: "modified" },
      { word: oldWords[3], type: "unchanged" },
      { word: oldWords[4], text: "leaps", type: "modified" },
      { text: "high", type: "added" }
    ]);
  });

  // Test case 13: a real world case
  // diffWords.test.ts

  it("should handle a real world case", () => {
    const oldWords: Word[] = [
      {
        text: "a",
        start: 6.8,
        end: 7.36,
        id: ""
      },
      {
        text: "well",
        start: 7.36,
        end: 7.88,
        id: ""
      },
      {
        text: "-respected",
        start: 7.88,
        end: 8.44,
        id: ""
      },
      {
        text: "research",
        start: 8.44,
        end: 8.96,
        id: ""
      },
      {
        text: "and",
        start: 8.96,
        end: 9.22,
        id: ""
      },
      {
        text: "analysis",
        start: 9.22,
        end: 9.5,
        id: ""
      },
      {
        text: "company",
        start: 9.5,
        end: 9.94,
        id: ""
      },
      {
        text: "that",
        start: 9.94,
        end: 10.52,
        id: ""
      },
      {
        text: "specializes",
        start: 10.52,
        end: 11.2,
        id: ""
      },
      {
        text: "in",
        start: 11.4,
        end: 11.74,
        id: ""
      },
      {
        text: "semiconductors,",
        start: 11.74,
        end: 12.42,
        id: ""
      }
    ];
    const newWordTexts = ["a", "well", "-", "respected", "research"];

    const result = diffWords(oldWords, newWordTexts);

    expect(result).toEqual([
      { word: oldWords[0], type: "unchanged" },
      { word: oldWords[1], type: "unchanged" },
      { word: oldWords[2], text: "-", type: "modified" },
      { text: "respected", type: "added" },
      { word: oldWords[3], type: "unchanged" },
      { word: oldWords[4], type: "removed" },
      { word: oldWords[5], type: "removed" },
      { word: oldWords[6], type: "removed" },
      { word: oldWords[7], type: "removed" },
      { word: oldWords[8], type: "removed" },
      { word: oldWords[9], type: "removed" },
      { word: oldWords[10], type: "removed" }
    ]);
  });

  // Test case 14: real whisper.json data case
  it("should handle whisper.json transcription data with text corrections", () => {
    // Based on real whisper.json data from Andrew Ng video
    const oldWords: Word[] = [
      {
        text: " And",
        start: 16.38,
        end: 16.54,
        id: ""
      },
      {
        text: " because",
        start: 16.54,
        end: 16.84,
        id: ""
      },
      {
        text: " we",
        start: 16.84,
        end: 16.96,
        id: ""
      },
      {
        text: " co",
        start: 16.96,
        end: 17.2,
        id: ""
      },
      {
        text: "-founded",
        start: 17.2,
        end: 17.46,
        id: ""
      },
      {
        text: " startups,",
        start: 17.46,
        end: 17.86,
        id: ""
      },
      {
        text: " we're",
        start: 18.2,
        end: 18.28,
        id: ""
      },
      {
        text: " in",
        start: 18.28,
        end: 18.48,
        id: ""
      },
      {
        text: " there,",
        start: 18.48,
        end: 18.76,
        id: ""
      },
      {
        text: " writing",
        start: 18.8,
        end: 19.06,
        id: ""
      },
      {
        text: " code,",
        start: 19.06,
        end: 19.26,
        id: ""
      }
    ];

    // Simulate editing the transcription for better readability
    const newWordTexts = [
      " And",
      " because",
      " we",
      " co-founded",
      " startups,",
      " we're",
      " in",
      " there,",
      " writing",
      " code,"
    ];

    const result = diffWords(oldWords, newWordTexts);

    expect(result).toEqual([
      { word: oldWords[0], type: "unchanged" },
      { word: oldWords[1], type: "unchanged" },
      { word: oldWords[2], type: "unchanged" },
      { word: oldWords[3], text: " co-founded", type: "modified" },
      { word: oldWords[4], type: "removed" },
      { word: oldWords[5], type: "unchanged" },
      { word: oldWords[6], type: "unchanged" },
      { word: oldWords[7], type: "unchanged" },
      { word: oldWords[8], type: "unchanged" },
      { word: oldWords[9], type: "unchanged" },
      { word: oldWords[10], type: "unchanged" }
    ]);
  });

  // Test cases for custom comparison function
  describe("custom comparison function", () => {
    it("should use custom comparison for case-insensitive matching", () => {
      const oldWords: Word[] = [
        { text: "Hello", start: 0, end: 1, id: "" },
        { text: "WORLD", start: 1, end: 2, id: "" }
      ];
      const caseInsensitiveCompare = (left: string, right: string) =>
        left.toLowerCase() === right.toLowerCase();

      const result = diffWords(
        oldWords,
        ["hello", "world"],
        caseInsensitiveCompare
      );
      expect(result).toEqual([
        { type: "unchanged", word: oldWords[0] },
        { type: "unchanged", word: oldWords[1] }
      ]);
    });

    it("should use custom comparison for punctuation-insensitive matching", () => {
      const oldWords: Word[] = [
        { text: "Hello!", start: 0, end: 1, id: "" },
        { text: "world?", start: 1, end: 2, id: "" }
      ];
      const punctuationInsensitiveCompare = (left: string, right: string) =>
        left.replace(/[^\w\s]/g, "") === right.replace(/[^\w\s]/g, "");

      const result = diffWords(
        oldWords,
        ["Hello", "world"],
        punctuationInsensitiveCompare
      );
      expect(result).toEqual([
        { type: "unchanged", word: oldWords[0] },
        { type: "unchanged", word: oldWords[1] }
      ]);
    });

    it("should use custom comparison for trimmed matching", () => {
      const oldWords: Word[] = [
        { text: " hello ", start: 0, end: 1, id: "" },
        { text: "world  ", start: 1, end: 2, id: "" }
      ];
      const trimmedCompare = (left: string, right: string) =>
        left.trim() === right.trim();

      const result = diffWords(oldWords, ["hello", "world"], trimmedCompare);
      expect(result).toEqual([
        { type: "unchanged", word: oldWords[0] },
        { type: "unchanged", word: oldWords[1] }
      ]);
    });

    it("should detect modifications when custom comparison doesn't match", () => {
      const oldWords: Word[] = [
        { text: "Hello", start: 0, end: 1, id: "" },
        { text: "world", start: 1, end: 2, id: "" }
      ];
      const exactCompare = (left: string, right: string) => left === right;

      const result = diffWords(oldWords, ["hello", "world"], exactCompare);
      expect(result).toEqual([
        { type: "modified", word: oldWords[0], text: "hello" },
        { type: "unchanged", word: oldWords[1] }
      ]);
    });

    it("should handle complex custom comparison logic", () => {
      const oldWords: Word[] = [
        { text: "1st", start: 0, end: 1, id: "" },
        { text: "2nd", start: 1, end: 2, id: "" },
        { text: "3rd", start: 2, end: 3, id: "" }
      ];
      // Custom comparison that treats ordinal numbers as equal to their numeric form
      const ordinalCompare = (left: string, right: string) => {
        const ordinalMap: Record<string, string> = {
          "1st": "first",
          "2nd": "second",
          "3rd": "third"
        };
        return left === right || ordinalMap[left] === right;
      };

      const result = diffWords(
        oldWords,
        ["first", "2nd", "third"],
        ordinalCompare
      );
      expect(result).toEqual([
        { type: "unchanged", word: oldWords[0] },
        { type: "unchanged", word: oldWords[1] },
        { type: "unchanged", word: oldWords[2] }
      ]);
    });

    it("should handle accent-insensitive comparison", () => {
      const oldWords: Word[] = [
        { text: "café", start: 0, end: 1, id: "" },
        { text: "naïve", start: 1, end: 2, id: "" }
      ];
      const accentInsensitiveCompare = (left: string, right: string) =>
        left.normalize("NFD").replace(/[\u0300-\u036f]/g, "") ===
        right.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

      const result = diffWords(
        oldWords,
        ["cafe", "naive"],
        accentInsensitiveCompare
      );
      expect(result).toEqual([
        { type: "unchanged", word: oldWords[0] },
        { type: "unchanged", word: oldWords[1] }
      ]);
    });
  });
});
