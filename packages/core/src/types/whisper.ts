export interface WhisperKitOutputType {
  text: string;
  language: string;
  segments: Array<{
    text: string;
    start: number;
    end: number;
    words: Array<{
      word: string;
      start: number;
      end: number;
    }>;
  }>;
}
