import { afterAll, afterEach, beforeAll } from "vitest";

import { server } from "./mocks/server.mjs";

// Set required environment variables for tests
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());