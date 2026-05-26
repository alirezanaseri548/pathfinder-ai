"use client";

import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Reusable error fallback UI for error.js boundary files.
 *
 * @param {object}   props
 * @param {Error}    props.error    - The error object from Next.js
 * @param {Function} props.reset    - Reset function to retry the boundary
 * @param {string}   props.heading  - Title shown above the message
 * @param {string}   [props.backHref]      - Optional "Go back" link href
 * @param {string}   [props.backLabel]     - Label for the back link button
 */
export default function ErrorFallback({
  error,
  reset,
  heading = "Something went wrong",
  backHref = "/dashboard",
  backLabel = "Back to dashboard",
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-7 w-7" />
      </div>

      <h2 className="mb-2 text-xl font-semibold">{heading}</h2>
      <p className="mb-6 max-w-md text-muted-foreground">
        {error?.message || "An unexpected error occurred. Please try again."}
      </p>

      <div className="flex gap-3">
        <Button onClick={() => reset()} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href={backHref}>
            <Home className="h-4 w-4 mr-2" />
            {backLabel}
          </Link>
        </Button>
      </div>
    </div>
  );
}
