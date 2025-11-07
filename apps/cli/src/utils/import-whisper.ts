import { generateId } from "@subtitle-agent/core/utils/ids";
import { WhisperKitOutputType } from "@subtitle-agent/core/types/whisper";
import { updateWordsFromText } from "@subtitle-agent/core/utils/update-words-from-text";
import { Segment, Word } from "@subtitle-agent/core/types/subtitle";

export const importSegmentsFromWhisper = (
  whisperJson: WhisperKitOutputType
): Segment[] => {
  const segments = whisperJson.segments.map(
    (segment: {
      id?: string;
      text: string;
      start: number;
      end: number;
      speakerId?: string;
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
        speakerId: segment.speakerId,
        words: updateWordsFromText(words, segment.text),
      };
    }
  );

  return segments;
};
