import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// Mock internal dependencies used by transcribe.ts
vi.mock("../lib/whisper-kit", () => ({
  transcribe: vi.fn(),
}));

vi.mock("../utils/file", () => ({
  readJSON: vi.fn(),
  writeJSON: vi.fn(),
}));

vi.mock("../utils/import-whisper", () => ({
  importWordsFromWhisper: vi.fn(),
}));

import { transcribe } from "./transcribe";

describe("transcribe tool", () => {
  let mockWhisper: typeof import("../lib/whisper-kit");
  let mockFile: typeof import("../utils/file");
  let mockImportWhisper: typeof import("../utils/import-whisper");

  beforeAll(async () => {
    mockWhisper = await import("../lib/whisper-kit");
    mockFile = await import("../utils/file");
    mockImportWhisper = await import("../utils/import-whisper");
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing transcription when not forced", async () => {
    const existing = {
      filename: "input.wav",
      text: "hello",
      words: [],
    };
    mockFile.readJSON.mockResolvedValue(existing);

    const res = await transcribe("input.wav", "out/whisper.json", { force: false });

    expect(res).toEqual(existing);
    expect(mockWhisper.transcribe).not.toHaveBeenCalled();
    expect(mockFile.writeJSON).not.toHaveBeenCalled();
  });

  it("transcribes, converts words and writes output when no existing file", async () => {
    mockFile.readJSON.mockResolvedValue(null);

    const whisperOutput = {
      text: "hello world",
      language: "en",
      segments: [
        {
          text: "hello world",
          start: 0,
          end: 1.5,
          words: [
            { word: "hello", start: 0, end: 0.5 },
            { word: "world", start: 1.0, end: 1.5 },
          ],
        },
      ],
    };
    mockWhisper.transcribe.mockResolvedValue(whisperOutput as any);

    const convertedWords = [
      { id: "1", text: "hello", start: 0, end: 0.5 },
      { id: "2", text: "world", start: 1.0, end: 1.5 },
    ];
    mockImportWhisper.importWordsFromWhisper.mockReturnValue(convertedWords as any);

    const res = await transcribe("input.wav", "out/whisper.json", { force: true });

    expect(mockWhisper.transcribe).toHaveBeenCalledWith("input.wav", { force: true });
    expect(mockImportWhisper.importWordsFromWhisper).toHaveBeenCalledWith(
      whisperOutput
    );
    expect(mockFile.writeJSON).toHaveBeenCalledTimes(1);
    expect(mockFile.writeJSON).toHaveBeenCalledWith("out/whisper.json", {
      filename: "input.wav",
      text: "hello world",
      words: convertedWords,
    });

    expect(res).toEqual({
      filename: "input.wav",
      text: "hello world",
      words: convertedWords,
    });
  });

  it("throws when whisper transcription fails", async () => {
    mockFile.readJSON.mockResolvedValue(null);
    mockWhisper.transcribe.mockResolvedValue(undefined as any);

    await expect(
      transcribe("input.wav", "out/whisper.json", { force: true })
    ).rejects.toThrow("Failed to transcribe input file: input.wav");
  });
});
