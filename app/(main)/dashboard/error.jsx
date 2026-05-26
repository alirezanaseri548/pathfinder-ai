"use client";

import ErrorFallback from "@/components/error-fallback";

export default function DashboardError({ error, reset }) {
  return (
    <ErrorFallback
      error={error}
      reset={reset}
      heading="Failed to load industry insights"
      backHref="/"
      backLabel="Go home"
    />
  );
}
