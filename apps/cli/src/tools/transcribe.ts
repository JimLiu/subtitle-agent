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

  let existingTranscription: TranscriptionOutput | null = null;

  if (!options?.force) {
    existingTranscription = await readJSON<TranscriptionOutput>(
      whisperOutputFile
    );
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
    text: transcriptionOutput.text,
    words: importWordsFromWhisper(transcriptionOutput),
  };

  await writeJSON(whisperOutputFile, transcription);

  return transcription;
};
