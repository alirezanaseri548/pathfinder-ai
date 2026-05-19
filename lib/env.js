import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
  CLERK_SECRET_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().default("/sign-in"),
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().default("/sign-up"),
  NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: z.string().default("/onboarding"),
  NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: z.string().default("/onboarding"),
});

let cachedEnv = null;

/**
 * Validates environment variables at runtime.
 * In production, Clerk keys are required for secure auth.
 */
export function getEnv() {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const formatted = parsed.error.flatten().fieldErrors;
    console.error("[env] Invalid environment variables:", formatted);

    if (process.env.NODE_ENV === "production") {
      throw new Error("Invalid server environment configuration");
    }
  }

  const env = parsed.success ? parsed.data : envSchema.parse({ ...process.env });

  if (env.NODE_ENV === "production") {
    if (!env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !env.CLERK_SECRET_KEY) {
      throw new Error(
        "CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY are required in production"
      );
    }
    if (!env.GEMINI_API_KEY) {
      console.warn("[env] GEMINI_API_KEY is not set — AI features will fail");
    }
  }

  cachedEnv = env;
  return env;
}

/** Whether Clerk is configured with real keys (not keyless dev mode). */
export function isClerkConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
      process.env.CLERK_SECRET_KEY
  );
}
