"use server";

import { generateGeminiContent } from "@/lib/gemini";
import { buildSecurePrompt } from "@/lib/prompt-safety";

export async function chatWithGemini(prompt) {
  if (!prompt) throw new Error("Prompt is required");

  const securePrompt = buildSecurePrompt({
    task: "You are Pathfinder AI, a career-focused assistant. Only answer career-related questions. Politely refuse unrelated questions.",
    untrustedData: [
      { label: "userQuery", value: prompt, maxLength: 4000 },
    ],
  });

  try {
    const { response } = await generateGeminiContent(securePrompt);
    return response.text();
  } catch (err) {
    // surface Google error message if present
    const message =
      err?.response?.error?.message || err?.message || "Unknown Gemini error";
    console.error("Gemini API error:", message);
    throw new Error("Failed to get response from Gemini AI");
  }
}
