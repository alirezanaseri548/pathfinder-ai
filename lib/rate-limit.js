import { getEnv } from "./env.js";
import { createRateLimitStore } from "./rate-limit/store.js";

const defaultStore = createRateLimitStore();
const stats = new Map();
const DEFAULT_BUCKET_TTL_MS = 10 * 60 * 1000;

function getStats(endpoint) {
  if (!stats.has(endpoint)) {
    stats.set(endpoint, { attempts: 0, rejected: 0 });
  }

  return stats.get(endpoint);
}

function getBucketKey(endpoint, subjectKey) {
  return `${endpoint}:${subjectKey}`;
}

async function cleanupExpiredBuckets(store, now = Date.now()) {
  if (typeof store?.cleanupExpiredBuckets === "function") {
    await store.cleanupExpiredBuckets(now, DEFAULT_BUCKET_TTL_MS);
  }
}

/**
 * Safely extracts the client IP from the X-Forwarded-For header chain.
 * It identifies the rightmost untrusted IP based on the TRUSTED_PROXY_COUNT.
 * Attackers can only prepend to this header; they cannot inject into or 
 * after the trusted proxy positions.
 */
function extractTrustedClientIp(headers) {
  const { TRUSTED_PROXY_COUNT } = getEnv();
  const forwardedFor = headers.get("x-forwarded-for");

  if (!forwardedFor) {
    return headers.get("x-real-ip") || "unknown";
  }

  const ips = forwardedFor.split(",").map((ip) => ip.trim()).filter(Boolean);

  // If we have X trusted proxies, the client IP is at index:
  // length - TRUSTED_PROXY_COUNT - 1
  const targetIndex = ips.length - TRUSTED_PROXY_COUNT - 1;

  // Fallback to the leftmost IP if the chain is shorter than expected
  // (which might happen in dev or if the proxy configuration is mismatched).
  const clientIp = ips[targetIndex] || ips[0];

  return clientIp || "unknown";
}

export function getRateLimitIdentifier(request, userId) {
  if (userId) {
    return { kind: "user", value: userId };
  }

  const ip = extractTrustedClientIp(request.headers);

  return { kind: "ip", value: ip };
}

export async function enforceRateLimit({
  endpoint,
  subject,
  limitPerMinute,
  burstCapacity = limitPerMinute,
  store = defaultStore,
  now = Date.now(),
}) {
  const subjectKey = `${subject.kind}:${subject.value}`;
  const bucketKey = getBucketKey(endpoint, subjectKey);
  const statsEntry = getStats(endpoint);

  statsEntry.attempts += 1;

  // Single atomic load -> refill -> check -> deduct -> persist. The store
  // serializes concurrent calls for the same bucket (mutex in memory, Lua EVAL
  // in Redis), so concurrent requests can no longer share a stale token count
  // and bypass the limit.
  const result = await store.checkAndDeduct(bucketKey, {
    limitPerMinute,
    burstCapacity,
    now,
  });

  if (!result.allowed) {
    const tokens = Number.isFinite(result.tokens) ? result.tokens : 0;
    const missingTokens = Math.max(0, 1 - tokens);
    const retryAfterSeconds = Math.max(1, Math.ceil((missingTokens / limitPerMinute) * 60));

    statsEntry.rejected += 1;

    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
      rejectionRate: statsEntry.rejected / statsEntry.attempts,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, Math.floor(result.remaining ?? result.tokens ?? 0)),
    retryAfterSeconds: 0,
    rejectionRate: statsEntry.attempts === 0 ? 0 : statsEntry.rejected / statsEntry.attempts,
  };
}

export function buildRateLimitResponse({
  message = "Too Many Requests",
  retryAfterSeconds,
  sse = false,
}) {
  const body = JSON.stringify({
    error: message,
    retryAfterSeconds,
  });

  return new Response(sse ? `event: error\ndata: ${body}\n\n` : body, {
    status: 429,
    headers: {
      "Content-Type": sse ? "text/event-stream" : "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Connection: "keep-alive",
      "Retry-After": String(retryAfterSeconds),
    },
  });
}