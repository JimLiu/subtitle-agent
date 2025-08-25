import { TranscriptionOutput } from "@subtitle-agent/core";
import {
  transcribe as transcribeByWhisperKit,
  TranscribeOptions,
  WhisperKitOutputType,
} from "../lib/whisper-kit";
import { readJSON, writeJSON } from "../utils/file";
import { importWordsFromWhisper } from "../utils/import-whisper";

export const transcribe = async (
  inputFile: string,
  whisperOutputFile: string,
  options?: TranscribeOptions
) => {
  const transcriptionOutput = await transcribeByWhisperKit(inputFile, options);

  if (!transcriptionOutput) {
    throw new Error(`Failed to transcribe input file: ${inputFile}`);
  }

  await writeJSON(whisperOutputFile, transcriptionOutput);

  const whisperJson = await readJSON<WhisperKitOutputType>(whisperOutputFile);
  const transcription: TranscriptionOutput = {
    filename: inputFile,
    text: whisperJson.text,
    words: importWordsFromWhisper(whisperJson),
  };

  return transcription;
};
