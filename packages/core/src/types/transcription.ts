import { Word, Speaker, Segment } from "./subtitle";

export interface TranscriptionOutput {
  filename: string;
  language?: string;
  speakers?: Speaker[];
  segments: Segment[];
  text: string;
}
