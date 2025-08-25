import { generateText } from "ai";
import { Word } from "@subtitle-agent/core";
import { createGeminiClient } from "../lib/ai-clients";

const LLM_MODEL = "gemini-2.5-flash";

interface CorrectionResult {
  originalText: string;
  correctedText: string;
  success: boolean;
  error?: string;
}

/**
 * Joins word texts into a single string for LLM processing
 */
export function joinWordsText(words: Word[]): string {
  return words.map((word) => word.text).join("");
}

/**
 * Corrects Chinese transcription text using LLM
 * - Fixes spelling errors
 * - Removes filler words (口癖)
 * - Adds proper punctuation
 * - Adds paragraph breaks (double newlines)
 * - Does not add non-existent content
 */
export async function correctTextWithLLM(
  text: string
): Promise<CorrectionResult> {
  const client = createGeminiClient();

  const prompt = `You are a professional Chinese text editor. Please correct the following Chinese speech transcription text:

1. Fix spelling errors and typos
2. Remove filler words and speech disfluencies (口癖)
3. Add proper punctuation marks
4. Add paragraph breaks using double newlines where appropriate for logical sections
5. Do NOT add any content that doesn't exist in the original text
6. Maintain the original meaning and context

## Original text
${text}

## Output format
Please provide only the corrected text without any explanations or additional comments:`;

  try {
    console.log("[LLM Request]", {
      model: LLM_MODEL,
      originalText: text,
      timestamp: new Date().toISOString(),
    });

    const response = await generateText({
      model: client(LLM_MODEL),
      prompt: prompt,
      maxRetries: 3,
    });

    const correctedText = response.text.replace(/\n\n/g, "\n");

    console.log("[LLM Response]", {
      success: true,
      correctedText,
      timestamp: new Date().toISOString(),
    });

    return {
      originalText: text,
      correctedText,
      success: true,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    console.error("[LLM Error]", {
      error: errorMessage,
      originalText: text,
      timestamp: new Date().toISOString(),
    });

    return {
      originalText: text,
      correctedText: text, // Return original text as fallback
      success: false,
      error: errorMessage,
    };
  }
}
