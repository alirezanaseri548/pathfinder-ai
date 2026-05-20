"use client";

import ErrorFallback from "@/components/error-fallback";

export default function ResumeError({ error, reset }) {
  return (
    <ErrorFallback
      error={error}
      reset={reset}
      heading="Failed to load resume"
      backHref="/dashboard"
      backLabel="Back to dashboard"
    />
  );
}
