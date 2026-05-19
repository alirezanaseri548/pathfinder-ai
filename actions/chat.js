"use server";

import { generateGeminiContent } from "@/lib/gemini";

export async function chatWithGemini(prompt) {
  if (!prompt) throw new Error("Prompt is required");

  try {
    const { response } = await generateGeminiContent(prompt);
    return response.text();
  } catch (err) {
    // surface Google error message if present
    const message =
      err?.response?.error?.message || err?.message || "Unknown Gemini error";
    console.error("Gemini API error:", message);
    throw new Error("Failed to get response from Gemini AI");
  }
}
