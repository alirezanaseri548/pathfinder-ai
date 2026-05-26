"use client";

import ErrorFallback from "@/components/error-fallback";

export default function NewCoverLetterError({ error, reset }) {
  return (
    <ErrorFallback
      error={error}
      reset={reset}
      heading="Failed to load cover letter generator"
      backHref="/ai-cover-letter"
      backLabel="Back to cover letters"
    />
  );
}
