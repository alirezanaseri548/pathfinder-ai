"use client";

import ErrorFallback from "@/components/error-fallback";

export default function CoverLetterError({ error, reset }) {
  return (
    <ErrorFallback
      error={error}
      reset={reset}
      heading="Failed to load cover letters"
      backHref="/dashboard"
      backLabel="Back to dashboard"
    />
  );
}
