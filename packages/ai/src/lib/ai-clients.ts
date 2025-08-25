import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";

// Validate required environment variables
// const requiredEnvVars = [
//   'OPENAI_API_KEY',
//   'OPENAI_BASE_URL',
//   'GOOGLE_API_KEY'
// ] as const;

// for (const varName of requiredEnvVars) {
//   if (!process.env[varName]) {
//     throw new Error(`Missing required environment variable: ${varName}`);
//   }
// }

// Create OpenAI client
export const createOpenAIClient = () =>
  createOpenAI({
    baseURL: process.env.OPENAI_BASE_URL,
    apiKey: process.env.OPENAI_API_KEY,
  });

// Create Google AI client
export const createGeminiClient = () =>
  createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });
