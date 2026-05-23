"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { generateGeminiContent } from "@/lib/gemini";
import { buildSecurePrompt } from "@/lib/prompt-safety";

/**
 * Generates industry insights using Gemini AI.
 * If AI generation fails, provides high-quality default fallback insights.
 */
export async function generateAIInsights(industry) {
  const prompt = buildSecurePrompt({
    task: "Analyze the current state of the industry and provide real-world, comprehensive insights.",
    untrustedData: [
      { label: "industry", value: industry, maxLength: 200 },
    ],
    outputRules: `Provide your analysis in ONLY the following JSON format. Do not output any markdown code fences, warnings, or extra text:

{
  "salaryRanges": [
    {
      "role": "string",
      "min": number,
      "max": number,
      "median": number,
      "location": "string"
    }
  ],
  "growthRate": number,
  "demandLevel": "Low" | "Medium" | "High",
  "topSkills": ["string"],
  "marketOutlook": "Positive" | "Neutral" | "Negative",
  "keyTrends": ["string"],
  "recommendedSkills": ["string"]
}

Requirements:
- Include at least 4 common roles for salary ranges with realistic figures.
- Growth rate must be a float/number (representing percentage growth).
- Provide at least 5 top skills and 5 key trends.`,
  });

  try {
    const result = await generateGeminiContent(prompt);
    const text = result.response.text();
    const cleaned = text.replace(/```(?:json)?[\r\n]?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed || !Array.isArray(parsed.salaryRanges) || parsed.salaryRanges.length === 0) {
      throw new Error("Invalid structure returned from AI.");
    }

    return parsed;
  } catch (error) {
    console.error(`Gemini API Error for industry ${industry}, using fallback:`, error);

    // High-quality fallback industry insights
    return {
      salaryRanges: [
        {
          role: "Software Engineer",
          min: 60000,
          max: 140000,
          median: 95000,
          location: "Remote/Global",
        },
        {
          role: "Data Scientist",
          min: 70000,
          max: 160000,
          median: 110000,
          location: "Remote/Global",
        },
        {
          role: "Product Manager",
          min: 80000,
          max: 170000,
          median: 120000,
          location: "Remote/Global",
        },
      ],
      growthRate: 12.5,
      demandLevel: "High",
      topSkills: ["JavaScript", "Python", "React", "Node.js", "SQL"],
      marketOutlook: "Positive",
      keyTrends: ["AI integration in software workflows", "Cloud Native Architectures", "Security compliance focus"],
      recommendedSkills: ["TypeScript", "Next.js", "Docker", "Machine Learning basics"],
    };
  }
}

/**
 * Fetches or creates industry insights for the signed-in user.
 */
export async function getIndustryInsights() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
    include: { industryInsight: true },
  });
  if (!user) throw new Error("User not found");

  if (!user.industry) {
    throw new Error("User industry is not set. Please complete onboarding first.");
  }

  try {
    if (!user.industryInsight) {
      const insights = await generateAIInsights(user.industry);

      const industryInsight = await db.industryInsight.create({
        data: {
          industry: user.industry,
          salaryRanges: insights.salaryRanges,
          growthRate: parseFloat(insights.growthRate) || 0,
          demandLevel: insights.demandLevel,
          topSkills: insights.topSkills,
          marketOutlook: insights.marketOutlook,
          keyTrends: insights.keyTrends,
          recommendedSkills: insights.recommendedSkills,
          nextUpdate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Update in 7 days
        },
      });

      return industryInsight;
    }

    return user.industryInsight;
  } catch (error) {
    console.error("Failed to fetch or save industry insights:", error);
    throw new Error("Failed to load industry insights.");
  }
}