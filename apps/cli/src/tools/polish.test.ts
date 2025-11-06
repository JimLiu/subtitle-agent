import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// Mock the AI correction module used by polish.ts
vi.mock("@subtitle-agent/ai", () => ({
  correctTextWithLLM: vi.fn(),
}));

import { polishWords } from "./polish";

describe("polishWords", () => {
  let mockAi: typeof import("@subtitle-agent/ai");

  beforeAll(async () => {
    mockAi = await import("@subtitle-agent/ai");
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("groups words into paragraphs based on inserted newlines and returns correctedWords", async () => {
    // Original words (space as its own token so it can be replaced by a newline)
    const words = [
      { id: "1", text: "hello", start: 0, end: 0.5 },
      { id: "2", text: " ", start: 0.5, end: 0.6 },
      { id: "3", text: "world", start: 0.6, end: 1.0 },
      { id: "4", text: " ", start: 1.0, end: 1.1 },
      { id: "5", text: "test", start: 1.1, end: 1.5 },
    ];

    // LLM returns a newline between `world` and `test`
    mockAi.correctTextWithLLM.mockResolvedValue({
      originalText: "hello world test",
      correctedText: "hello world\ntest",
      success: true,
    });

    const result = await polishWords(words);

    // Ensure a newline token exists in corrected words
    expect(result.correctedWords.some((w) => w.text.includes("\n"))).toBe(true);

    // Two paragraphs expected: ["hello world"], ["test"]
    expect(result.paragraphs.length).toBe(2);

    const p1Text = result.paragraphs[0].words.map((w) => w.text).join("");
    const p2Text = result.paragraphs[1].words.map((w) => w.text).join("");
    expect(p1Text).toBe("hello world");
    expect(p2Text).toBe("test");

    // The newline token should not be included in paragraph words
    expect(
      result.paragraphs.flatMap((p) => p.words).some((w) => w.text.includes("\n"))
    ).toBe(false);
  });

  it("throws when LLM correction fails", async () => {
    mockAi.correctTextWithLLM.mockResolvedValue({
      originalText: "foo",
      correctedText: "foo",
      success: false,
      error: "llm error",
    });

    await expect(polishWords([])).rejects.toThrow(
      "Failed to correct text with LLM"
    );
  });

  it("handles empty input words", async () => {
    mockAi.correctTextWithLLM.mockResolvedValue({
      originalText: "",
      correctedText: "",
      success: true,
    });

    const result = await polishWords([]);
    // One empty paragraph
    expect(result.paragraphs.length).toBe(1);
    expect(result.paragraphs[0].words.length).toBe(0);
    expect(result.correctedWords.length).toBe(0);
  });
});
