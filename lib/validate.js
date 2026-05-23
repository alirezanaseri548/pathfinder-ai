import { sanitizeInput } from "./sanitize";

export function validateInput(schema, data) {
  // 1. Core Fix: Run input text formatting and injection stripping BEFORE Zod constraint assessments
  const preSanitizedData = JSON.parse(JSON.stringify(data || {}), (key, value) => {
    return typeof value === "string" ? sanitizeInput(value).trim() : value;
  });

  // 2. Validate clean parameters against active schema rules
  const result = schema.safeParse(preSanitizedData);
  if (!result.success) {
    return {
      success: false,
      errors: result.error.flatten().fieldErrors,
    };
  }

  return {
    success: true,
    data: result.data,
  };
}
