"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

import { GoogleGenerativeAI } from "@google/generative-ai";

/* ---------------- MODEL ---------------- */

function getModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const genAI = new GoogleGenerativeAI(apiKey);

  return genAI.getGenerativeModel({
    model: "gemini-1.5-flash-latest",
  });
}

/* ---------------- QUIZ GENERATION ---------------- */

import { generateGeminiContent } from "@/lib/gemini";


export async function generateQuiz() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
    select: { industry: true, skills: true },
  });

  if (!user) throw new Error("User not found");

  const normalizedSkills = Array.from(
    new Set((user.skills || []).map((s) => String(s).trim()).filter(Boolean))
  );

  const prompt = `
You are a strict quiz generator.

Generate EXACTLY 10 UNIQUE MCQ questions for a ${user.industry} professional
${normalizedSkills.length ? `with skills in ${normalizedSkills.join(", ")}` : ""}.

RULES:
- Exactly 10 questions only
- No repetition
- Each question must be real-world and clear
- Each question must have 4 FULL descriptive options (NOT A, B, C, D)
- Only ONE correct answer
- correctAnswer MUST exactly match one option text

Return ONLY valid JSON:

{
  "questions": [
    {
      "question": "string",
      "options": [
        "full option 1",
        "full option 2",
        "full option 3",
        "full option 4"
      ],
      "correctAnswer": "exact matching option text",
      "explanation": "string"
    }
  ]
}
`;

  try {

  const result = await getModel().generateContent(prompt);
  const text = result.response.text();

  console.log("RAW GEMINI OUTPUT:", text);

  const cleaned = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  console.log("CLEANED OUTPUT:", cleaned);

  const quiz = JSON.parse(cleaned);

  console.log("PARSED QUIZ:", quiz);

  if (!quiz?.questions) {
    throw new Error("No questions field in response");

    const result = await generateGeminiContent(prompt);
    const response = result.response;
    const text = response.text();
    const cleanedText = text.replace(/```(?:json)?\n?/g, "").trim();
    const quiz = JSON.parse(cleanedText);

    return quiz.questions;
  } catch (error) {
    console.error("Error generating quiz:", error);
    throw new Error("Failed to generate quiz questions");

  }

  return quiz.questions.slice(0, 10);
} catch (error) {
  console.error("Quiz generation error FULL:", error);

  return [
    {
      question: "What does HTML stand for?",
      options: [
        "Hyper Text Markup Language",
        "High Transfer Machine Language",
        "Hyperlink Text Management Language",
        "Home Tool Markup Language",
      ],
      correctAnswer: "Hyper Text Markup Language",
      explanation: "HTML is used to structure web pages.",
    },
    {
      question: "Which language runs inside the browser?",
      options: [
        "Java",
        "Python",
        "C++",
        "JavaScript",
      ],
      correctAnswer: "JavaScript",
      explanation: "JavaScript runs in browsers.",
    },
    {
      question: "What is React mainly used for?",
      options: [
        "Database management",
        "Frontend UI development",
        "Operating systems",
        "Networking",
      ],
      correctAnswer: "Frontend UI development",
      explanation: "React is a frontend library for building UI.",
    },
    {
      question: "Which database is NoSQL?",
      options: [
        "PostgreSQL",
        "MongoDB",
        "MySQL",
        "Oracle",
      ],
      correctAnswer: "MongoDB",
      explanation: "MongoDB is a NoSQL document database.",
    },
    {
      question: "What does CSS handle in web development?",
      options: [
        "Server logic",
        "Database storage",
        "Styling webpages",
        "Authentication",
      ],
      correctAnswer: "Styling webpages",
      explanation: "CSS is used for styling web pages.",
    },
    {
      question: "Which hook is used for state in React?",
      options: [
        "useEffect",
        "useFetch",
        "useState",
        "useRouter",
      ],
      correctAnswer: "useState",
      explanation: "useState manages component state.",
    },
    {
      question: "What is Node.js?",
      options: [
        "Frontend framework",
        "Runtime environment",
        "Database",
        "CSS library",
      ],
      correctAnswer: "Runtime environment",
      explanation: "Node.js runs JavaScript outside the browser.",
    },
    {
      question: "Which company created Java?",
      options: [
        "Google",
        "Sun Microsystems",
        "Microsoft",
        "Apple",
      ],
      correctAnswer: "Sun Microsystems",
      explanation: "Java was originally developed by Sun Microsystems.",
    },
    {
      question: "What does API stand for?",
      options: [
        "Application Programming Interface",
        "Advanced Program Interaction",
        "Applied Programming Internet",
        "Application Process Integration",
      ],
      correctAnswer: "Application Programming Interface",
      explanation: "API allows communication between software systems.",
    },
    {
      question: "Which keyword declares variables in JavaScript?",
      options: [
        "define",
        "string",
        "var",
        "integer",
      ],
      correctAnswer: "var",
      explanation: "var is used to declare variables in JavaScript.",
    },
  ];
}
}
/* ---------------- SAVE QUIZ RESULT ---------------- */

export async function saveQuizResult(questions, answers, score) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) throw new Error("User not found");

  const sanitizedAnswers = Array.isArray(answers)
    ? answers.slice(0, questions.length)
    : [];

  while (sanitizedAnswers.length < questions.length) {
    sanitizedAnswers.push(null);
  }

  const questionMap = new Map();

  questions.forEach((q, index) => {
    if (!q?.question) return;

    const key = String(q.question).trim();

    if (!questionMap.has(key)) {
      questionMap.set(key, {
        question: key,
        answer: q.correctAnswer,
        userAnswer: sanitizedAnswers[index],
        isCorrect: q.correctAnswer === sanitizedAnswers[index],
        explanation: q.explanation,
      });
    }
  });

  const questionResults = Array.from(questionMap.values());

  const wrongAnswers = questionResults.filter((q) => !q.isCorrect);

  let improvementTip = null;

  if (wrongAnswers.length > 0) {
    const wrongText = wrongAnswers
      .map(
        (q) =>
          `Q: ${q.question}\nCorrect: ${q.answer}\nUser: ${q.userAnswer}`
      )
      .join("\n\n");

    const prompt = `
User (${user.industry}) needs improvement based on mistakes:

${wrongText}

Give a short, encouraging improvement tip (max 2 sentences).
Focus on learning direction, not criticism.
`;

    try {

      const result = await getModel().generateContent(prompt);
      improvementTip = result.response.text().trim();
    } catch (e) {
      console.error("Tip generation failed:", e);

      const tipResult = await generateGeminiContent(improvementPrompt);

      improvementTip = tipResult.response.text().trim();
      console.log(improvementTip);
    } catch (error) {
      console.error("Error generating improvement tip:", error);
      // Continue without improvement tip if generation fails

    }
  }

  return await db.assessment.create({
    data: {
      userId: user.id,
      quizScore: score,
      questions: questionResults,
      category: "Technical",
      improvementTip,
    },
  });
}

/* ---------------- GET RESULTS ---------------- */

export async function getAssessments() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) throw new Error("User not found");

  return await db.assessment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
}