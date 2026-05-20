"use client";

import ErrorFallback from "@/components/error-fallback";

export default function OnboardingError({ error, reset }) {
  return (
    <ErrorFallback
      error={error}
      reset={reset}
      heading="Failed to load onboarding"
      backHref="/"
      backLabel="Go home"
    />
  );
}