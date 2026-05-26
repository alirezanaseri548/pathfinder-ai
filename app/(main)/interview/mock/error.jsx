"use client";

import ErrorFallback from "@/components/error-fallback";

export default function MockInterviewError({ error, reset }) {
  return (
    <ErrorFallback
      error={error}
      reset={reset}
      heading="Failed to load mock interview"
      backHref="/interview"
      backLabel="Back to interview prep"
    />
  );
}
