import { TranscriptionOutput, Word, Segment } from "@subtitle-agent/core";
import {
  transcribe as transcribeByWhisperKit,
  TranscribeOptions,
} from "../lib/whisper-kit";
import { readJSON, writeJSON } from "../utils/file";
import { importSegmentsFromWhisper } from "../utils/import-whisper";

const wordsToSingleSegment = (words: Word[], text?: string): Segment[] => {
  if (!words || words.length === 0) return [];
  const start = words[0].start ?? 0;
  const end = words[words.length - 1].end ?? 0;
  const mergedText =
    text ?? words.map((w) => (w?.text ?? "")).join("");
  return [
    {
      id: `${words[0].id}-seg`,
      start,
      end,
      text: mergedText,
      words,
    },
  ];
};

const normalizeTranscriptionOutput = (
  existing: any
): TranscriptionOutput => {
  if (!existing) return existing;
  if (Array.isArray(existing.segments)) return existing as TranscriptionOutput;
  if (Array.isArray(existing.words)) {
    return {
      filename: existing.filename,
      language: existing.language,
      text: existing.text ?? (existing.words as Word[]).map((w) => w.text).join(""),
      speakers: existing.speakers,
      segments: wordsToSingleSegment(existing.words as Word[], existing.text),
    };
  }
  // Fallback to empty segments but preserve basic fields
  return {
    filename: existing.filename,
    language: existing.language,
    text: existing.text ?? "",
    speakers: existing.speakers,
    segments: [],
  };
};

export const transcribe = async (
  inputFile: string,
  whisperOutputFile: string,
  options?: TranscribeOptions
) => {

  let existingTranscription: TranscriptionOutput | null = null;

  if (!options?.force) {
    const raw = await readJSON<TranscriptionOutput>(whisperOutputFile);
    if (raw) {
      existingTranscription = normalizeTranscriptionOutput(raw);
    }
  }

  if (existingTranscription) {
    console.log(
      `Using existing transcription from ${whisperOutputFile}`
    );
    return existingTranscription;
  }


  const transcriptionOutput = await transcribeByWhisperKit(inputFile, options);

  if (!transcriptionOutput) {
    throw new Error(`Failed to transcribe input file: ${inputFile}`);
  }

  const transcription: TranscriptionOutput = {
    filename: inputFile,
    language: transcriptionOutput.language,
    text: transcriptionOutput.text,
    segments: importSegmentsFromWhisper(transcriptionOutput),
    speakers: transcriptionOutput.speakers,
  };

  await writeJSON(whisperOutputFile, transcription);

  return transcription;
};
