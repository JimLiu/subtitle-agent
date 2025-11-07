import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from "vitest";

// Mock the AI correction module used by polishWords
vi.mock("@subtitle-agent/ai", () => ({
  correctTextWithLLM: vi.fn(),
}));

import type { Word, Paragraph, Segment } from "@subtitle-agent/core";
import type { ParagraphBuilderDraft } from "./polish";

describe("polishWords", () => {
  let mockAi: typeof import("@subtitle-agent/ai");
  let polishWords: typeof import("./polish-words")['polishWords'];

  beforeAll(async () => {
    mockAi = await import("@subtitle-agent/ai");
    ({ polishWords } = await import("./polish-words"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("groups words into paragraphs based on inserted newlines and returns correctedWords", async () => {
    const words: Word[] = [
      { id: "1", text: "hello", start: 0, end: 0.5 },
      { id: "2", text: " ", start: 0.5, end: 0.6 },
      { id: "3", text: "world", start: 0.6, end: 1.0 },
      { id: "4", text: " ", start: 1.0, end: 1.1 },
      { id: "5", text: "test", start: 1.1, end: 1.5 },
    ];

    mockAi.correctTextWithLLM.mockResolvedValue({
      originalText: "hello world test",
      correctedText: "hello world\ntest",
      success: true,
    });

    const result = await polishWords(words);

    expect(result.correctedWords.some((w) => w.text.includes("\n"))).toBe(true);
    expect(result.paragraphs.length).toBe(2);

    const p1Text = result.paragraphs[0].words.map((w) => w.text).join("");
    const p2Text = result.paragraphs[1].words.map((w) => w.text).join("");
    expect(p1Text).toBe("hello world");
    expect(p2Text).toBe("test");

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

    await expect(polishWords([])).rejects.toThrow("Failed to correct text with LLM");
  });

  it("handles empty input words", async () => {
    mockAi.correctTextWithLLM.mockResolvedValue({
      originalText: "",
      correctedText: "",
      success: true,
    });

    const result = await polishWords([]);
    expect(result.paragraphs.length).toBe(1);
    expect(result.paragraphs[0].words.length).toBe(0);
    expect(result.correctedWords.length).toBe(0);
  });
});

describe("polish", () => {
  const createWord = (index: number): Word => ({
    id: `w${index}`,
    text: `w${index}`,
    start: index * 0.5,
    end: index * 0.5 + 0.4,
  });

  const makeParagraph = (id: string, words: Word[]): Paragraph => ({
    id,
    start: words[0]?.start ?? 0,
    end: words[words.length - 1]?.end ?? 0,
    text: words.map((w) => w.text).join(""),
    words,
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("processes chunks sequentially within a single speaker group and defers tail paragraphs until the next chunk", async () => {
    const words: Word[] = Array.from({ length: 10 }, (_, i) => createWord(i));
    const segments: Segment[] = [
      {
        id: "s0",
        start: words[0].start,
        end: words[words.length - 1].end,
        text: words.map((w) => w.text).join(" "),
        words,
        speakerId: "spk0",
      },
    ];
    const chunkProgress: number[] = [];

    vi.resetModules();
    const polishWordsModule = await import("./polish-words");
    const polishWordsStub = vi
      .spyOn(polishWordsModule, "polishWords")
      .mockImplementationOnce(async (chunk) => ({
        paragraphs: [
          makeParagraph("p0", chunk.slice(0, 2)),
          makeParagraph("p1", chunk.slice(2)),
        ],
        correctedWords: chunk,
      }))
      .mockImplementationOnce(async (chunk) => ({
        paragraphs: [
          makeParagraph("p2", chunk.slice(0, 2)),
          makeParagraph("p3", chunk.slice(2)),
        ],
        correctedWords: chunk,
      }))
      .mockImplementationOnce(async (chunk) => ({
        paragraphs: [
          makeParagraph("p4", chunk.slice(0, 2)),
          makeParagraph("p5", chunk.slice(2)),
        ],
        correctedWords: chunk,
      }))
      .mockImplementationOnce(async (chunk) => ({
        paragraphs: [
          makeParagraph("p6", chunk.slice(0, 2)),
          makeParagraph("p7", chunk.slice(2)),
        ],
        correctedWords: chunk,
      }));

    const { polish } = await import("./polish");

    const draft: ParagraphBuilderDraft = {
      segments,
      lastProcessedGroupIndex: 0,
      lastProcessedWordIndex: 0,
      paragraphs: [],
      options: {
        maxWordsPerRequest: 4,
        overlapWords: 1,
      },
    };

    const onChunkResult = vi.fn(async (currentDraft: ParagraphBuilderDraft) => {
      chunkProgress.push(currentDraft.lastProcessedWordIndex ?? 0);
    });

    const result = await polish(draft, onChunkResult);

    expect(polishWordsStub).toHaveBeenCalledTimes(4);
    expect(onChunkResult).toHaveBeenCalledTimes(4);
    expect(chunkProgress).toEqual([2, 4, 6, 10]);
    expect(result.lastProcessedGroupIndex).toBe(1);
    expect(result.lastProcessedWordIndex).toBe(0);
    expect(result.paragraphs?.map((p) => p.id)).toEqual([
      "p0",
      "p2",
      "p4",
      "p6",
      "p7",
    ]);
    // paragraphs should carry speakerId
    expect(result.paragraphs?.every((p) => p.speakerId === "spk0")).toBe(true);
    expect(result.options).toEqual({
      maxWordsPerRequest: 4,
      overlapWords: 1,
    });

    polishWordsStub.mockRestore();
  });

  it("advances cursor when a chunk yields no paragraphs (single group)", async () => {
    const words: Word[] = Array.from({ length: 5 }, (_, i) => createWord(i));
    const segments: Segment[] = [
      {
        id: "s0",
        start: words[0].start,
        end: words[words.length - 1].end,
        text: words.map((w) => w.text).join(" "),
        words,
        speakerId: "spk0",
      },
    ];
    const chunkProgress: number[] = [];

    vi.resetModules();
    const polishWordsModule = await import("./polish-words");
    const polishWordsStub = vi
      .spyOn(polishWordsModule, "polishWords")
      .mockImplementationOnce(async (chunk) => ({
        paragraphs: [],
        correctedWords: chunk,
      }))
      .mockImplementationOnce(async (chunk) => ({
        paragraphs: [makeParagraph("final", chunk)],
        correctedWords: chunk,
      }));

    const { polish } = await import("./polish");

    const draft: ParagraphBuilderDraft = {
      segments,
      paragraphs: [],
      options: {
        maxWordsPerRequest: 3,
        overlapWords: 1,
      },
    };

    const onChunkResult = vi.fn(async (currentDraft: ParagraphBuilderDraft) => {
      chunkProgress.push(currentDraft.lastProcessedWordIndex ?? 0);
    });

    const result = await polish(draft, onChunkResult);

    expect(polishWordsStub).toHaveBeenCalledTimes(2);
    expect(chunkProgress).toEqual([2, 5]);
    expect(result.lastProcessedGroupIndex).toBe(1);
    expect(result.lastProcessedWordIndex).toBe(0);
    expect(result.paragraphs?.map((p) => p.id)).toEqual(["final"]);

    polishWordsStub.mockRestore();
  });

  it("groups segments by contiguous speakerId and preserves speaker on paragraphs", async () => {
    const w = (i: number): Word => ({ id: `wa${i}`, text: `w${i}`, start: i, end: i + 0.4 });
    const aWords = [w(0), w(1)];
    const bWords = [w(2), w(3), w(4)];

    const segments: Segment[] = [
      { id: "s0", start: 0, end: 1, text: "a", words: aWords, speakerId: "spkA" },
      { id: "s1", start: 2, end: 3, text: "b", words: bWords, speakerId: "spkB" },
    ];

    vi.resetModules();
    const polishWordsModule = await import("./polish-words");
    const polishWordsStub = vi
      .spyOn(polishWordsModule, "polishWords")
      .mockImplementation(async (chunk) => ({
        paragraphs: [
          {
            id: `p-${chunk[0]?.id}`,
            start: chunk[0]?.start ?? 0,
            end: chunk[chunk.length - 1]?.end ?? 0,
            text: chunk.map((c) => c.text).join(""),
            words: chunk,
          },
        ],
        correctedWords: chunk,
      }));

    const { polish } = await import("./polish");
    const draft: ParagraphBuilderDraft = { segments, paragraphs: [], options: { maxWordsPerRequest: 9999 } };
    const result = await polish(draft, async () => {});

    expect(polishWordsStub).toHaveBeenCalledTimes(2);
    expect(result.paragraphs?.length).toBe(2);
    expect(result.paragraphs?.[0].speakerId).toBe("spkA");
    expect(result.paragraphs?.[1].speakerId).toBe("spkB");

    polishWordsStub.mockRestore();
  });
});
