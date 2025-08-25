import { generateId } from "@subtitle-agent/core/utils/ids";
import { WhisperKitOutputType } from "@subtitle-agent/core/types/whisper";
import { updateWordsFromText } from "@subtitle-agent/core/utils/update-words-from-text";
import { Word } from "@subtitle-agent/core/types/subtitle";

export const importWordsFromWhisper = (
  whisperJson: WhisperKitOutputType
): Word[] => {
  const segments = whisperJson.segments.map(
    (segment: {
      id?: string;
      text: string;
      start: number;
      end: number;
      words: Array<{
        id?: string;
        text?: string;
        word: string;
        start: number;
        end: number;
      }>;
    }) => {
      const words = segment.words.map(
        (word: {
          id?: string;
          text?: string;
          word: string;
          start: number;
          end: number;
        }) => ({
          id: word.id ?? generateId(),
          start: word.start,
          end: word.end,
          text: word.text ?? word.word,
        })
      );
      return {
        id: segment.id ?? generateId(),
        start: segment.start,
        end: segment.end,
        text: segment.text,
        words: updateWordsFromText(words, segment.text),
      };
    }
  );

  return segments.flatMap((segment) => segment.words);
};
