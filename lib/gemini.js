import { GoogleGenerativeAI } from "@google/generative-ai";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const FALLBACK_GEMINI_MODELS = ["gemini-2.0-flash", "gemini-2.0-flash-lite"];

function getGeminiModelNames() {
  const configuredModel = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  return Array.from(new Set([configuredModel, DEFAULT_GEMINI_MODEL, ...FALLBACK_GEMINI_MODELS]));
}

function isModelUnavailableError(error) {
  const message = [
    error?.message,
    error?.response?.error?.message,
    error?.status,
    error?.response?.status,
  ]
    .filter(Boolean)
    .join(" ");

  return /404|not found|not supported|not available|unsupported.*generateContent/i.test(
    message
  );
}

export async function generateGeminiContent(prompt) {
  return runWithGeminiFallback((model) => model.generateContent(prompt));
}

export async function generateGeminiContentStream(prompt) {
  return runWithGeminiFallback((model) => model.generateContentStream(prompt));
}

async function runWithGeminiFallback(generate) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelNames = getGeminiModelNames();
  let lastError;

  for (const modelName of modelNames) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      return await generate(model);
    } catch (error) {
      lastError = error;

      if (!isModelUnavailableError(error)) {
        throw error;
      }

      console.warn(
        `[Gemini] Model "${modelName}" is unavailable for generateContent. Trying fallback model.`
      );
    }
  }

  throw lastError;
}
