import { Word } from "./subtitle";

export interface TranscriptionOutput {
  filename: string;
  language?: string;
  words: Word[];
  text: string;
}
