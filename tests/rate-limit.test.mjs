import assert from "node:assert/strict";
import test from "node:test";

import { enforceRateLimit } from "../lib/rate-limit.js";
import {
  createMemoryRateLimitStore,
  createRateLimitStore,
} from "../lib/rate-limit/store.js";

test("memory store evicts stale buckets", async () => {
  const store = createMemoryRateLimitStore({ bucketTtlMs: 1000 });

  await store.setBucket("/api/generate:user:1", {
    tokens: 2,
    lastRefillAt: 0,
    limitPerMinute: 10,
    burstCapacity: 2,
  });

  await store.cleanupExpiredBuckets(2000);

  assert.equal(await store.getBucket("/api/generate:user:1"), null);
});

test("factory defaults to memory storage when redis is not configured", () => {
  const store = createRateLimitStore({ driver: "memory" });

  assert.equal(store.kind, "memory");
});

test("factory can create a redis store lazily", () => {
  const store = createRateLimitStore({
    driver: "redis",
    redisUrl: "redis://localhost:6379",
  });

  assert.equal(store.kind, "redis");
});

test("rate limiter consumes burst capacity and then rejects", async () => {
  const store = createMemoryRateLimitStore({ bucketTtlMs: 60_000 });
  const subject = { kind: "user", value: "abc" };

  const first = await enforceRateLimit({
    endpoint: "/api/generate",
    subject,
    limitPerMinute: 60,
    burstCapacity: 2,
    store,
    now: 1000,
  });

  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 1);

  const second = await enforceRateLimit({
    endpoint: "/api/generate",
    subject,
    limitPerMinute: 60,
    burstCapacity: 2,
    store,
    now: 1000,
  });

  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 0);

  const third = await enforceRateLimit({
    endpoint: "/api/generate",
    subject,
    limitPerMinute: 60,
    burstCapacity: 2,
    store,
    now: 1000,
  });

  assert.equal(third.allowed, false);
  assert.equal(third.remaining, 0);
  assert.equal(third.retryAfterSeconds, 1);
});

test("rate limiter refills after elapsed time", async () => {
  const store = createMemoryRateLimitStore({ bucketTtlMs: 60_000 });
  const subject = { kind: "ip", value: "127.0.0.1" };

  await enforceRateLimit({
    endpoint: "/api/generate",
    subject,
    limitPerMinute: 60,
    burstCapacity: 2,
    store,
    now: 1000,
  });

  const refill = await enforceRateLimit({
    endpoint: "/api/generate",
    subject,
    limitPerMinute: 60,
    burstCapacity: 2,
    store,
    now: 61_000,
  });

  assert.equal(refill.allowed, true);
  assert.equal(refill.remaining, 1);
});