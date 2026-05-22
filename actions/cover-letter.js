"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

import { GoogleGenerativeAI } from "@google/generative-ai";


const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-001" });

import { generateGeminiContent } from "@/lib/gemini";


export async function generateCoverLetter(data) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

/* ---------------- MODEL ---------------- */

import { generateGeminiContent } from "@/lib/gemini";



function getModel() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  return genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
  });
}

/* ---------------- GENERATE COVER LETTER ---------------- */

export async function generateCoverLetter(data) {
  let user;

  try {

    const { userId } = await auth();

    if (!userId) {
      throw new Error("Unauthorized");
    }

    user = await db.user.findUnique({
      where: {
        clerkUserId: userId,
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (
      !data?.jobTitle ||
      !data?.companyName ||
      !data?.jobDescription
    ) {
      throw new Error("Missing required fields");
    }

    const prompt = `
Write a professional cover letter for a ${data.jobTitle} position at ${data.companyName}.

Candidate Details:
- Industry: ${user.industry || "Not provided"}
- Experience: ${user.experience || "Not provided"}
- Skills: ${user.skills?.join(", ") || "Not provided"}
- Background: ${user.bio || "Not provided"}

Job Description:
${data.jobDescription}

Requirements:
- Professional tone
- Max 400 words
- Highlight relevant skills
- Mention achievements
- Use markdown formatting
`;

    const result = await getModel().generateContent(prompt);

    const response = await result.response;

    const content = response.text()?.trim();

    if (!content) {
      throw new Error("Empty AI response");
    }
=======
    const result = await generateGeminiContent(prompt);
    const content = result.response.text().trim();


    const coverLetter = await db.coverLetter.create({
      data: {
        content,
        companyName: data.companyName,
        jobTitle: data.jobTitle,
        jobDescription: data.jobDescription,
        status: "completed",
        userId: user.id,
      },
    });

    return coverLetter;

  } catch (error) {

    console.error("Cover Letter Error:", error);
    if (!user) {
  throw new Error("Failed to generate cover letter");
}

    const fallbackContent = `
=======
  console.error("Error generating cover letter:", error);

  const fallbackContent = `

# Cover Letter

Dear Hiring Manager,


I am excited to apply for the ${data?.jobTitle || "this"} position at ${data?.companyName || "your company"}.

My background in ${user?.industry || "technology"} along with my skills and experience make me a strong candidate for this role.

Thank you for considering my application.

Sincerely,
${user?.name || "Candidate"}
`;

    const coverLetter = await db.coverLetter.create({
      data: {
        content: fallbackContent,
        jobDescription: data?.jobDescription || "",
        companyName: data?.companyName || "Unknown Company",
        jobTitle: data?.jobTitle || "Unknown Role",
        status: "fallback",
        userId: user.id,
      },
    });

    return coverLetter;
  }
=======
I am excited to apply for the ${data.jobTitle} position at ${data.companyName}.

My background in ${user.industry} and my experience make me a strong candidate.

Thank you for your time.

Sincerely,
${user.name || "Candidate"}
`;

  const coverLetter = await db.coverLetter.create({
    data: {
      content: fallbackContent,
      jobDescription: data.jobDescription,
      companyName: data.companyName,
      jobTitle: data.jobTitle,
      status: "fallback",
      userId: user.id,
    },
  });

  return coverLetter;
}

}


/* ---------------- GET ALL COVER LETTERS ---------------- */

export async function getCoverLetters() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  const user = await db.user.findUnique({
    where: {
      clerkUserId: userId,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  return await db.coverLetter.findMany({
    where: {
      userId: user.id,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

/* ---------------- GET SINGLE COVER LETTER ---------------- */

export async function getCoverLetter(id) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  const user = await db.user.findUnique({
    where: {
      clerkUserId: userId,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  return await db.coverLetter.findFirst({
    where: {
      id,
      userId: user.id,
    },
  });
}

/* ---------------- DELETE COVER LETTER ---------------- */

export async function deleteCoverLetter(id) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  const user = await db.user.findUnique({
    where: {
      clerkUserId: userId,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  return await db.coverLetter.delete({
    where: {
      id,
    },
  });
}