"use client";

import { useState, useRef, useCallback, useEffect } from "react";

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
  const [finalText, setFinalText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const isDev = process.env.NODE_ENV !== "production";

  const abortControllerRef = useRef(null);
  const parseSseEventBlock = useCallback((block) => {
    const lines = block.split(/\r?\n/);
    let event = "message";
    const dataLines = [];

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();

      if (!line || line.startsWith(":")) {
        continue;
      }

      if (line.startsWith("event:")) {
        event = line.slice(6).trim() || "message";
        continue;
      }

      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    return {
      event,
      data: dataLines.join("\n"),
    };
  }, []);

  const startStream = useCallback(async (prompt, conversationId = null) => {
    // Cancel any existing stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 60000);

    setStreamedText("");
    setFinalText("");
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
     body: JSON.stringify({
  prompt,
  conversationId,
}),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${response.status})`);
      }

      if (!response.body) {
        throw new Error("Readable stream not supported");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          const fallbackFinal = accumulatedText;
          setFinalText(fallbackFinal);
          setStreamedText(fallbackFinal);
          setIsLoading(false);
          return { status: "done", finalText: fallbackFinal };
        }

        buffer += decoder.decode(value, { stream: true });

        while (true) {
          const separatorIndex = buffer.search(/\r?\n\r?\n/);
          if (separatorIndex === -1) break;

          const separator = buffer.slice(separatorIndex).match(/^\r?\n\r?\n/);
          const separatorLength = separator ? separator[0].length : 2;
          const rawEvent = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + separatorLength);

          if (!rawEvent.trim()) continue;

          const { event, data } = parseSseEventBlock(rawEvent);
          let parsed = {};

          if (data) {
            try {
              parsed = JSON.parse(data);
            } catch (parseError) {
              if (isDev) {
                console.warn(
                  "[useStreamFetch] Ignoring malformed SSE JSON payload",
                  parseError,
                  data
                );
              }
              continue;
            }
          }

          if (event === "delta") {
            const deltaText = typeof parsed.text === "string" ? parsed.text : "";
            if (!deltaText) continue;

            accumulatedText += deltaText;
            setStreamedText(accumulatedText);
            continue;
          }

          if (event === "error") {
            const message =
              (typeof parsed.message === "string" && parsed.message) ||
              "Stream failed";

            setError(message);
            setIsLoading(false);
            await reader.cancel();
            return { status: "error", error: message, finalText: accumulatedText };
          }

          if (event === "done") {
            const completeText =
              typeof parsed.finalText === "string" ? parsed.finalText : accumulatedText;

            accumulatedText = completeText;
            setFinalText(completeText);
            setStreamedText(completeText);
            setIsLoading(false);
            await reader.cancel();
            return { status: "done", finalText: completeText, meta: parsed };
          }
        }
      }
    } catch (err) {
      if (err.name === "AbortError") {
        setIsLoading(false);
        return { status: "aborted", finalText: "" };
      }

      const message = err.message || "Stream failed";
      setError(message);
      setIsLoading(false);
      if (isDev) {
        console.warn("[useStreamFetch] Stream failed", err);
      }
      return { status: "error", error: message, finalText: "" };
    } finally {
      clearTimeout(timeoutId);
      abortControllerRef.current = null;
    }
  }, [isDev, parseSseEventBlock]);

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setStreamedText("");
    setFinalText("");
    setError(null);
    setIsLoading(false);
  }, []);
  
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return { streamedText, finalText, isLoading, error, startStream, reset };
}
