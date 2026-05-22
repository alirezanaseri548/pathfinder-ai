"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { generateGeminiContent } from "@/lib/gemini";
import { validateInput } from "@/app/lib/validate";
import { atsAnalysisSchema } from "@/app/lib/schema";

export async function analyzeATS(rawParams) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const validation = validateInput(atsAnalysisSchema, rawParams);
  if (!validation.success) {
    return { success: false, errors: validation.errors };
  }

  const { resumeContent, jobDescription, jobTitle, companyName } = validation.data;

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });
  if (!user) throw new Error("User not found");

  const prompt = `
You are an expert ATS (Applicant Tracking System) analyst and career coach.
Analyze the following resume against the job description and return a detailed ATS compatibility report.

RESUME:
${resumeContent}

JOB DESCRIPTION:
${jobDescription}

Provide your analysis in the following JSON format ONLY — no extra text, no markdown fences:
{
  "atsScore": <number between 0 and 100>,
  "matchedKeywords": [<array of keywords/skills/phrases found in BOTH the resume and job description>],
  "missingKeywords": [<array of important keywords/skills/phrases in the job description that are missing from the resume>],
  "suggestions": [<array of actionable strings to improve compliance and score>],
  "overallFeedback": "string summarizing strengths and clear areas of alignment"
}
`;

  try {
    const result = await generateGeminiContent(prompt);
    let text = result.response.text().trim();
    
    // Sanitize markdown backticks if returned by LLM
    if (text.startsWith("```json")) text = text.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    else if (text.startsWith("```")) text = text.replace(/^```\s*/, "").replace(/\s*```$/, "");

    const analysis = JSON.parse(text);

    const atsScore = parseInt(analysis.atsScore, 10) || 0;
    const matchedKeywords = Array.isArray(analysis.matchedKeywords) ? analysis.matchedKeywords : [];
    const missingKeywords = Array.isArray(analysis.missingKeywords) ? analysis.missingKeywords : [];
    const suggestions = Array.isArray(analysis.suggestions) ? analysis.suggestions : [];
    const overallFeedback = typeof analysis.overallFeedback === 'string' ? analysis.overallFeedback : '';

    const record = await db.aTSAnalysis.create({
      data: {
        userId: user.id,
        jobTitle: jobTitle || "Target Role",
        companyName: companyName || "Target Company",
        jobDescription: jobDescription,
        resumeText: resumeContent,
        atsScore: Math.min(100, Math.max(0, atsScore)),
        matchedKeywords: matchedKeywords.map(String),
        missingKeywords: missingKeywords.map(String),
        suggestions: suggestions,
        overallFeedback: overallFeedback || null,
      },
    });

    revalidatePath("/ats-analyzer");
    return { success: true, data: record };
  } catch (error) {
    console.error("ATS process crash intercepted safely:", error);
    return { success: false, errors: { _form: ["Failed to run safe ATS analysis processing."] } };
  }
}

// Keep getATSAnalyses and deleteATSAnalysis unchanged as they don't accept complex raw forms inputs.
export async function getATSAnalyses() { ... }
export async function deleteATSAnalysis(id) { ... }
