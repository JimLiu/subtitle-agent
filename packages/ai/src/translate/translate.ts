import { TranslatedParagraph } from "@subtitle-agent/core";
import { generateObject } from "ai";
import { z } from "zod";
import { createGeminiClient, createOpenAIClient } from "../lib";

const TRANSLATION_MODEL =
  process.env.OPENAI_TRANSLATION_MODEL ?? "gemini-2.5-flash";
const TARGET_LANGUAGE =
  process.env.TRANSLATION_TARGET_LANGUAGE ?? "简体中文";

const translationSchema = z.object({
  id: z.string().describe("Paragraph id"),
  translation: z
    .string()
    .min(1)
    .describe(`Translation text in ${TARGET_LANGUAGE}`),
});

const formatParagraphsForPrompt = (
  paragraphs: TranslatedParagraph[]
): Array<Pick<TranslatedParagraph, "id" | "text" | "translation">> => {
  return paragraphs.map(({ id, text, translation }) => ({
    id,
    text: text?.trim() ?? "",
    ...(translation ? { translation: translation.trim() } : {}),
  }));
};

export async function translateParagraphs(
  paragraphs: TranslatedParagraph[],
  prevParagraphs: TranslatedParagraph[] = []
): Promise<TranslatedParagraph[]> {
  if (!paragraphs.length) {
    return [];
  }

  const client = createGeminiClient();

  const systemPrompt = `You are a professional subtitle translator. Detect the source language automatically and translate every paragraph into ${TARGET_LANGUAGE}.

Guidelines:
- Preserve timing references, numbers, and proper nouns.
- Keep translations concise and natural for spoken dialogue.
- Honor terminology that already appeared in previous translations.
- Output only the translation text (no brackets or speaker names unless present in the original unless they explicitly exist).

Format:
- Respond strictly as a JSON array.
- Each entry must be {"id": string, "translation": string}.
- Cover every provided id and do not emit additional fields.`;

  const translationPayload: Record<string, unknown> = {
    targetLanguage: TARGET_LANGUAGE,
    paragraphs: formatParagraphsForPrompt(paragraphs),
  };

  if (prevParagraphs.length) {
    translationPayload.previousTranslations =
      formatParagraphsForPrompt(prevParagraphs);
  }

  const userMessage = `Translate the following paragraphs using the provided context:\n${JSON.stringify(
    translationPayload,
    null,
    2
  )}`;

  console.log("[Translate Request]", {
    model: TRANSLATION_MODEL,
    targetLanguage: TARGET_LANGUAGE,
    paragraphCount: paragraphs.length,
    timestamp: new Date().toISOString(),
  });

  try {
    const { object: translatedObjects } = await generateObject({
      model: client(TRANSLATION_MODEL),
      schema: translationSchema,
      output: "array",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.2,
      maxRetries: 2,
    });

    const translationsMap = new Map(
      translatedObjects.map(({ id, translation }) => [
        id,
        translation.trim(),
      ])
    );

    const updatedParagraphs = paragraphs.map((paragraph) => {
      const translated = translationsMap.get(paragraph.id);
      return translated
        ? { ...paragraph, translation: translated }
        : paragraph;
    });

    console.log("[Translate Response]", {
      success: true,
      translatedCount: translationsMap.size,
      timestamp: new Date().toISOString(),
    });

    return updatedParagraphs;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown translation error";

    console.error("[Translate Error]", {
      error: errorMessage,
      model: TRANSLATION_MODEL,
      timestamp: new Date().toISOString(),
    });

    throw error;
  }
}
