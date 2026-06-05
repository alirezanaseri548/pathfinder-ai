"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { generateGeminiContent } from "@/lib/gemini";
import { buildSecurePrompt, generateWithStructuredOutput } from "@/lib/prompt-safety";
import { buildUserProfileContext } from "@/lib/ai-context";
import { validateInput, validateOutput } from "@/lib/validate";
import { coverLetterInputSchema } from "@/lib/schemas/forms";
import { coverLetterOutputSchema, SCHEMA_DESCRIPTIONS } from "@/lib/schemas/outputs";
import { checkRateLimit, formatResetTime } from "@/lib/rate-limit";

/**
 * Generates a professional cover letter using Gemini AI with structured output validation.
 * Falls back to a safe template if AI generation or validation fails.
 */
export async function generateCoverLetter(data) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const limit = await checkRateLimit(userId, "coverLetter");
  if (!limit.allowed) {
    throw new Error(`Cover letter limit reached. Resets in ${formatResetTime(limit.resetAt)}.`);
  }

  const validation = validateInput(coverLetterInputSchema, data);
  if (!validation.success) return { success: false, errors: validation.errors };

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });
  if (!user) throw new Error("User not found");

  const { jobTitle, companyName, jobDescription } = validation.data;

  const prompt = buildSecurePrompt({
    context: buildUserProfileContext(user),
    task: `Write a professional cover letter for the position described below.

Use only the candidate facts provided in the input. Do not invent projects, achievements,
titles, certifications, metrics, or years of experience that are not explicitly provided.
If a detail is missing, keep the wording general instead of guessing.

Respond ONLY with a valid JSON object in this exact format (no markdown, no code fences):
{
  "greeting": "Dear Hiring Manager,",
  "body": "<2-3 paragraphs, professional tone, max 300 words>",
  "closing": "Sincerely,\\n<candidate name>"
}`,
    context: "You are a professional career coach and cover letter writer.",
    untrustedData: [
      { label: "jobTitle", value: jobTitle, maxLength: 200 },
      { label: "companyName", value: companyName, maxLength: 200 },
      { label: "candidateName", value: user.name || "Candidate", maxLength: 200 },
      { label: "industry", value: user.industry || "Technology", maxLength: 200 },
      { label: "experience", value: String(user.experience || "0") + " years", maxLength: 100 },
      { label: "skills", value: user.skills?.join(", ") || "Not specified", maxLength: 1000 },
      { label: "bio", value: user.bio || "Not specified", maxLength: 2000 },
      { label: "jobDescription", value: jobDescription, maxLength: 8000 },
    ],
  });

  const schemaDescription = SCHEMA_DESCRIPTIONS.coverLetter;

  try {
    const result = await generateWithStructuredOutput({
      prompt,
      schemaDescription,
      schema: coverLetterOutputSchema,
      generateFn: async (p) => {
        const raw = await generateGeminiContent(p);
        return raw.response.text().trim();
      },
      validateFn: validateOutput,
    });

    if (!result.success) {
      console.error("Cover letter output validation failed:", result.errors);
      throw new Error("AI returned an unexpected format.");
    }

    // Reassemble sections into a single markdown string for backward compatibility
    const { greeting, body, closing } = result.data;
    const content = `${greeting}\n\n${body}\n\n${closing}`;

    const coverLetter = await db.coverLetter.create({
      data: {
        content,
        companyName,
        jobTitle,
        jobDescription,
        status: "completed",
        userId: user.id,
      },
    });

    return coverLetter;
  } catch (error) {
    console.error("Error generating cover letter, using fallback:", error);
    const errorCode = error?.code || "UNKNOWN";

    const fallbackContent = `
# Cover Letter

Dear Hiring Manager,

I am writing to express my interest in the ${data.jobTitle} position at ${data.companyName}. 

Based on my background in the ${user.industry || "relevant"} industry and my experience, I believe I can bring valuable skills to your team. I would love the opportunity to discuss how my qualifications align with your needs.

Thank you for your time and consideration.

Sincerely,
${user.name || "Candidate"}
`;

    const coverLetter = await db.coverLetter.create({
      data: {
        content: fallbackContent.trim(),
        companyName,
        jobTitle,
        jobDescription,
        status: "fallback",
        userId: user.id,
      },
    });

    return { ...coverLetter, _errorCode: errorCode };
  }
}

/**
 * Fetches all cover letters for the signed-in user, newest first.
 */
export async function getCoverLetters() {
  const { userId } = await auth();
  if (!userId) return [];

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });
  if (!user) return [];

  return db.coverLetter.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Fetches a single cover letter by ID (ownership-checked).
 */
export async function getCoverLetter(id) {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });
  if (!user) return null;

  return db.coverLetter.findFirst({
    where: {
      id,
      userId: user.id,
    },
  });
}

/**
 *Deletes a specific cover letter record with strict ownership validation.
 */
export async function deleteCoverLetter(id) {
  const { userId } = await auth();
  if (!userId) return { success: false, errors: { _form: ["Unauthorized"] } };

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });
  if (!user) return { success: false, errors: { _form: ["User not found"] } };

  await db.coverLetter.deleteMany({
    where: {
      id,
      userId: user.id,
    },
  });

  return { success: true };
}
