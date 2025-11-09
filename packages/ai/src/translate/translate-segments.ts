import {
  TranslatedParagraph,
  TranslatedSegment,
} from "@subtitle-agent/core";
import { generateObject } from "ai";
import type { CoreMessage } from "ai";
import { z } from "zod";
import {
  createTranslationClient,
  TARGET_LANGUAGE,
  TRANSLATION_MODEL,
} from "./config";

type PromptSegment = Pick<TranslatedSegment, "id" | "text" | "translation">;

type PromptParagraph = {
  id: string;
  translation?: string;
  segments: PromptSegment[];
};

const translationSchema = z.object({
  id: z.string().describe("Paragraph id"),
  segments: z
    .array(
      z.object({
        id: z.string().describe("Segment id"),
        text: z
          .string()
          .describe("Original segment text. Copy exactly from the input."),
        translation: z
          .string()
          .min(1)
          .describe(`Translation text in ${TARGET_LANGUAGE}`),
      })
    )
    .min(1)
    .describe("Translated segments for the paragraph"),
});

export type SegmentTranslationResult = z.infer<typeof translationSchema>;

const getSegmentPromptId = (
  paragraphId: string,
  segment: TranslatedSegment,
  index: number
): string => segment.id ?? `${paragraphId}-segment-${index}`;

const createPromptParagraphs = (
  paragraphs: TranslatedParagraph[]
): {
  promptParagraphs: PromptParagraph[];
  segmentCount: number;
} => {
  const promptParagraphs: PromptParagraph[] = [];
  let segmentCount = 0;

  for (const paragraph of paragraphs) {
    const segments = (paragraph.segments ?? []).flatMap(
      (segment, index): PromptSegment[] => {
        const text = segment.text?.trim();
        if (!text) {
          return [];
        }

        const promptSegment: PromptSegment = {
          id: getSegmentPromptId(paragraph.id, segment, index),
          text,
          ...(segment.translation
            ? { translation: segment.translation.trim() }
            : {}),
        };
        return [promptSegment];
      }
    );

    if (!segments.length) {
      continue;
    }

    segmentCount += segments.length;
    promptParagraphs.push({
      id: paragraph.id,
      translation: paragraph.translation?.trim() || undefined,
      segments,
    });
  }

  return { promptParagraphs, segmentCount };
};

const createTranslationPayload = (
  paragraphs: PromptParagraph[],
  previousParagraphs: PromptParagraph[]
) => {
  const payload: Record<string, unknown> = {
    targetLanguage: TARGET_LANGUAGE,
    paragraphs,
  };

  if (previousParagraphs.length) {
    payload.previousSegments = previousParagraphs;
  }

  return payload;
};

export async function translateSegments(
  paragraphs: TranslatedParagraph[],
  prevParagraphs: TranslatedParagraph[] = []
): Promise<SegmentTranslationResult[]> {
  if (!paragraphs.length) {
    return [];
  }

  const client = createTranslationClient();

  const {
    promptParagraphs,
    segmentCount,
  } = createPromptParagraphs(paragraphs);

  if (!segmentCount) {
    return [];
  }

  const { promptParagraphs: previousPromptParagraphs } =
    createPromptParagraphs(prevParagraphs);

  const systemPrompt = `You are a professional subtitle translator. Translate each segment faithfully into ${TARGET_LANGUAGE}.

Guidelines:
- Preserve speaker cues, timing references, numbers, and proper nouns.
- Keep translations concise and natural for spoken dialogue.
- Honor terminology that already appeared in the provided paragraph-level translation.
- Maintain consistency with terminology that appeared in previous segments.
- When responding, include the original text for every segment exactly as provided.

Format:
- Respond strictly as a JSON array.
- Each entry must be {"id": string, "segments": Array<{ "id": string, "text": string, "translation": string }> }.
- Ensure segment ids match the provided ids and the text value exactly matches the original segment text.
- Cover every provided segment id and do not emit additional fields.`;

  const translationPayload = createTranslationPayload(
    promptParagraphs,
    previousPromptParagraphs
  );

  const userMessage = `Translate the following segments using the provided context:\n${JSON.stringify(
    translationPayload,
    null,
    2
  )}`;

  const llmMessages: CoreMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  console.log("[TranslateSegments Request]", {
    model: TRANSLATION_MODEL,
    targetLanguage: TARGET_LANGUAGE,
    paragraphCount: paragraphs.length,
    segmentCount,
    timestamp: new Date().toISOString(),
  });

  console.log("[TranslateSegments LLM Request]", {
    model: TRANSLATION_MODEL,
    systemPrompt,
    userMessage,
    timestamp: new Date().toISOString(),
  });

  try {
    const { object } = await generateObject({
      model: client(TRANSLATION_MODEL),
      schema: translationSchema,
      output: "array",
      messages: llmMessages,
      temperature: 0.2,
      maxRetries: 2,
    });

    const translatedParagraphs = object as SegmentTranslationResult[];

    console.log("[TranslateSegments LLM Response]", new Date().toISOString(), translatedParagraphs);

    const sanitizedParagraphs: SegmentTranslationResult[] = translatedParagraphs.map(
      (paragraph) => ({
        id: paragraph.id,
        segments: paragraph.segments.map((segment) => ({
          id: segment.id,
          text: segment.text,
          translation: segment.translation.trim(),
        })),
      })
    );

    const translatedSegmentCount = sanitizedParagraphs.reduce(
      (count, paragraph) => count + paragraph.segments.length,
      0
    );

    console.log("[TranslateSegments Response]", {
      success: true,
      translatedParagraphCount: sanitizedParagraphs.length,
      translatedSegmentCount,
      timestamp: new Date().toISOString(),
    });

    return sanitizedParagraphs;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown segment translation error";

    console.error("[TranslateSegments Error]", {
      error: errorMessage,
      model: TRANSLATION_MODEL,
      timestamp: new Date().toISOString(),
    });

    throw error;
  }
}
