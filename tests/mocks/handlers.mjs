import { http } from "msw";

const encoder = new TextEncoder();

export function createSseResponse(chunks) {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
}

export const handlers = [
  http.post("http://localhost/api/generate", () => {
    return createSseResponse([
      "event: delta\ndata: {\"text\":\"Hello \"}\n\n",
      "event: delta\ndata: {\"text\":\"world\"}\n\n",
      "event: done\ndata: {\"finalText\":\"Hello world\",\"hasContent\":true}\n\n",
    ]);
  }),
];