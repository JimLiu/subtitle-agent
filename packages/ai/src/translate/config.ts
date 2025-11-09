import { createGeminiClient } from "../lib";

export const TRANSLATION_MODEL =
  process.env.OPENAI_TRANSLATION_MODEL ?? "gemini-2.5-flash";
export const TARGET_LANGUAGE =
  process.env.TRANSLATION_TARGET_LANGUAGE ?? "简体中文";

export const createTranslationClient = () => createGeminiClient();
