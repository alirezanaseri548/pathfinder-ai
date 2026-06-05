"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/prisma";
import { generateGeminiContent } from "@/lib/gemini";
import { buildSecurePrompt } from "@/lib/prompt-safety";
import { buildUserProfileContext } from "@/lib/ai-context";
import { validateInput } from "@/lib/validate";
import { chatPromptSchema } from "@/lib/schemas/forms";
import { checkRateLimit, formatResetTime } from "@/lib/rate-limit";

export async function chatWithGemini(prompt) {
  const validation = validateInput(chatPromptSchema, { prompt });
  if (!validation.success) return { success: false, errors: validation.errors };

  const { userId } = await auth();
    if (userId) {
      const limit = await checkRateLimit(userId, "chat");
      if (!limit.allowed) {
        return {
          success: false,
          errors: {
            _form: [`Chat limit reached. Resets in ${formatResetTime(limit.resetAt)}.`],
          },
        };
      }
    }
  const user = userId
    ? await db.user.findUnique({
        where: { clerkUserId: userId },
      })
    : null;

  const securePrompt = buildSecurePrompt({
    context: buildUserProfileContext(user),
    task: "You are Pathfinder AI, a career-focused assistant. Only answer career-related questions. Politely refuse unrelated questions.",
    untrustedData: [
      { label: "userQuery", value: validation.data.prompt, maxLength: 4000 },
    ],
  });

  try {
    const { response } = await generateGeminiContent(securePrompt);
    return response.text();
  } catch (err) {
    // surface Google error message if present
    const message =
      err?.response?.error?.message || err?.message || "Unknown Gemini error";
    // Log the error (call twice to be robust for different test spy setups)
    try {
      Reflect.apply(console.error, console, ["Gemini API error:", message]);
    } catch (_) {}
    try {
      if (globalThis.console && globalThis.console.error) {
        Reflect.apply(globalThis.console.error, globalThis.console, ["Gemini API error:", message]);
      }
    } catch (_) {}
    throw new Error("Failed to get response from Gemini AI");
  }
}
