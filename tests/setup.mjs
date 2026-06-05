// Set required environment variables before any module evaluation
process.env.NODE_ENV = "test";
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
}

import { afterAll, afterEach, beforeAll } from "vitest";

import { server } from "./mocks/server.mjs";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());