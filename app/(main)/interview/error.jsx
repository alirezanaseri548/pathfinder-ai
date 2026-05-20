"use client";

import ErrorFallback from "@/components/error-fallback";

export default function InterviewError({ error, reset }) {
  return (
    <ErrorFallback
      error={error}
      reset={reset}
      heading="Failed to load interview prep"
      backHref="/dashboard"
      backLabel="Back to dashboard"
    />
  );
}
