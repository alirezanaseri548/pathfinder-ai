"use client";

import { useState, useRef, useCallback } from "react";

/**
 * Custom hook that streams AI responses from the /api/generate SSE endpoint.
 *
 * Incoming SSE chunks can be large (whole sentences). This hook buffers them
 * and releases 2-3 words at a time on a short interval so the UI types
 * smoothly instead of jumping in big chunks.
 *
 * Usage:
 *   const { streamedText, isLoading, error, startStream, reset } = useStreamFetch();
 *   startStream("Write a cover letter for...");
 */
export default function useStreamFetch() {
  const [streamedText, setStreamedText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const abortControllerRef = useRef(null);
  const pendingRef = useRef("");
  const timerRef = useRef(null);
  const receivingRef = useRef(false);

  const WORDS_PER_TICK = 2;
  const TICK_MS = 60;

  const startReleasing = useCallback(() => {
    if (timerRef.current) return; 

    timerRef.current = setInterval(() => {
      const pending = pendingRef.current;
      if (!pending) {
        if (!receivingRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          setIsLoading(false);
        }
        return;
      }

      const words = pending.split(/(\s+)/); 
      const take = [];
      let wordCount = 0;

      for (const token of words) {
        take.push(token);
        if (token.trim()) wordCount++; 
        if (wordCount >= WORDS_PER_TICK) break;
      }

      const release = take.join("");
      pendingRef.current = pending.slice(release.length);

      setStreamedText((prev) => prev + release);
    }, TICK_MS);
  }, []);

  const startStream = useCallback(async (prompt) => {
    // Cancel any existing stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    pendingRef.current = "";
    receivingRef.current = true;
    setStreamedText("");
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;

          const data = line.slice(6);

          if (data === "[DONE]") {
            receivingRef.current = false;
            return;
          }

          try {
            const parsed = JSON.parse(data);

            if (parsed.error) {
              setError(parsed.error);
              receivingRef.current = false;
              setIsLoading(false);
              return;
            }

            if (parsed.text) {
              pendingRef.current += parsed.text;
              startReleasing();
            }
          } catch {
            
          }
        }
      }

      receivingRef.current = false;
    } catch (err) {
      if (err.name === "AbortError") {
        receivingRef.current = false;
        setIsLoading(false);
        return;
      }

      setError(err.message || "Stream failed");
      receivingRef.current = false;
      setIsLoading(false);
    }
  }, [startReleasing]);

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = "";
    receivingRef.current = false;
    setStreamedText("");
    setError(null);
    setIsLoading(false);
  }, []);

  return { streamedText, isLoading, error, startStream, reset };
}
