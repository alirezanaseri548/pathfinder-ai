import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useStreamFetch from "../hooks/use-stream-fetch.js";
import { createSseResponse, handlers } from "./mocks/handlers.mjs";
import { server } from "./mocks/server.mjs";
import { http } from "msw";

describe("useStreamFetch", () => {
  it("streams SSE deltas and resolves with the final text", async () => {
    server.use(
      http.post("http://localhost/api/generate", () => {
        return createSseResponse([
          "event: delta\ndata: {\"text\":\"Hello \"}\n\n",
          "event: delta\ndata: {\"text\":\"career world\"}\n\n",
          "event: done\ndata: {\"finalText\":\"Hello career world\",\"hasContent\":true}\n\n",
        ]);
      })
    );

    const { result } = renderHook(() => useStreamFetch());

    let outcome;
    await act(async () => {
      outcome = await result.current.startStream("Write a resume summary");
    });

    expect(outcome).toEqual({
      status: "done",
      finalText: "Hello career world",
      meta: { finalText: "Hello career world", hasContent: true },
    });
    expect(result.current.streamedText).toBe("Hello career world");
    expect(result.current.finalText).toBe("Hello career world");
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});