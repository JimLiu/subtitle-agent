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
 * Corrects transcription text using LLM
 * - Fixes spelling errors
 * - Removes filler words and speech disfluencies
 * - Adds proper punctuation
 * - Adds paragraph breaks (single newline between paragraphs)
 * - Does not add non-existent content
 */
export async function correctTextWithLLM(
  text: string
): Promise<CorrectionResult> {
  const client = createGeminiClient();

  const prompt = `You are a professional text editor focused on readable transcripts. Edit the following speech transcription text.

Formatting and editing rules
1. Fix spelling and grammar mistakes.
2. Remove filler words and speech disfluencies.
3. Add correct punctuation and casing.
4. Paragraphing: split the text into short paragraphs of 1–4 sentences each. Start a new paragraph when the topic shifts or a sentence becomes long. Do not produce paragraphs longer than 5 sentences.
5. Do NOT add or infer content that is not in the original.
6. Preserve the original meaning and tone.
7. Use a single newline character (\\n) between paragraphs. Do not use blank lines or HTML tags (no <p>, </p>, <br>, etc.).

Output
- Return plain text only: just the corrected text with newline-separated short paragraphs, no explanations.`;

  try {
    console.log("[LLM Request]", {
      model: LLM_MODEL,
      originalText: text,
      timestamp: new Date().toISOString(),
    });

    const response = await generateText({
      model: client(LLM_MODEL),
      prompt: [
        { role: "system", content: prompt },
        { role: "user", content: text },
      ],
      maxRetries: 3,
    });

    // Clean up LLM text: strip leading/trailing HTML tags that
    // sometimes appear (<p>, </p>, <br>, <br />) and normalize breaks.
    const stripEdgeHtml = (input: string): string => {
      let s = input.trim();
      // Remove any leading paragraph or break tags repeatedly
      const leadingRe = /^\s*(?:<p\b[^>]*>\s*|<\/p>\s*|<br\s*\/?>(?:\s*)*)/i;
      while (leadingRe.test(s)) {
        s = s.replace(leadingRe, "");
      }
      // Remove any trailing paragraph closing or break tags repeatedly
      const trailingRe = /(?:\s*<\/p>|\s*<br\s*\/?>(?:\s*)*)\s*$/i;
      while (trailingRe.test(s)) {
        s = s.replace(trailingRe, "");
      }
      return s.trim();
    };

    // Normalize breaks to single newline between paragraphs
    const correctedText = stripEdgeHtml(response.text)
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n{2,}/g, "\n");

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
