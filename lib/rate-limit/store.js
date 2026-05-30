export const DEFAULT_BUCKET_TTL_MS = 10 * 60 * 1000;
const DEFAULT_REDIS_PREFIX = "pathfinder:rate-limit";
const redisClientCache = new Map();

function normalizeBucket(bucket) {
  const tokens = Number(bucket.tokens);
  const lastRefillAt = Number(bucket.lastRefillAt);
  const limitPerMinute = Number(bucket.limitPerMinute);
  const burstCapacity = Number(bucket.burstCapacity);

  return {
    tokens: Number.isFinite(tokens) ? tokens : 0,
    lastRefillAt: Number.isFinite(lastRefillAt) ? lastRefillAt : Date.now(),
    limitPerMinute: Number.isFinite(limitPerMinute) ? limitPerMinute : 0,
    burstCapacity: Number.isFinite(burstCapacity) ? burstCapacity : 0,
  };
}

function getRedisKey(prefix, bucketKey) {
  return `${prefix}:${bucketKey}`;
}

function getMemoryStoreExpiration(bucket, bucketTtlMs, now) {
  return now - bucket.lastRefillAt > bucketTtlMs;
}

/**
 * Refill a token bucket in place based on the time elapsed since the last
 * refill. Shared by the memory and Redis store implementations so both apply
 * identical token-bucket semantics.
 */
function refillBucket(bucket, limitPerMinute, burstCapacity, now) {
  const elapsedMinutes = (now - bucket.lastRefillAt) / 60000;
  const refillAmount = elapsedMinutes * limitPerMinute;

  bucket.tokens = Math.min(burstCapacity, bucket.tokens + refillAmount);
  bucket.lastRefillAt = now;
}

/**
 * Atomic token-bucket check-and-deduct executed entirely inside Redis.
 *
 * Redis runs each script single-threaded, so the load -> refill -> check ->
 * deduct -> persist sequence cannot interleave with another request, which is
 * exactly the guarantee the non-atomic JS read/modify/write was missing.
 *
 * KEYS[1] = bucket key
 * ARGV[1] = now (ms epoch)        ARGV[2] = limitPerMinute
 * ARGV[3] = burstCapacity         ARGV[4] = bucket TTL (ms)
 *
 * Returns { allowed (0|1), remaining (floored int), tokens (string float) }.
 * `tokens` is returned as a bulk string because Redis truncates Lua numbers to
 * integers on the wire, and the caller needs the fractional remainder to
 * compute Retry-After.
 */
const CHECK_AND_DEDUCT_LUA = `
local raw = redis.call('GET', KEYS[1])
local now = tonumber(ARGV[1])
local limitPerMinute = tonumber(ARGV[2])
local burstCapacity = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])

local tokens = nil
local lastRefillAt = now

if raw then
  local ok, bucket = pcall(cjson.decode, raw)
  if ok and type(bucket) == 'table' and bucket.tokens ~= nil then
    tokens = tonumber(bucket.tokens)
    lastRefillAt = tonumber(bucket.lastRefillAt) or now
  end
end

if tokens == nil then
  tokens = burstCapacity
  lastRefillAt = now
end

local elapsedMinutes = (now - lastRefillAt) / 60000
tokens = math.min(burstCapacity, tokens + elapsedMinutes * limitPerMinute)
lastRefillAt = now

local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end

local payload = cjson.encode({
  tokens = tokens,
  lastRefillAt = lastRefillAt,
  limitPerMinute = limitPerMinute,
  burstCapacity = burstCapacity,
})
redis.call('SET', KEYS[1], payload, 'PX', ttl)

return { allowed, math.floor(tokens), tostring(tokens) }
`;

async function getRedisClient(redisUrl) {
  let clientPromise = redisClientCache.get(redisUrl);

  if (!clientPromise) {
    const { createClient } = await import("redis");
    const client = createClient({ url: redisUrl });

    client.on("error", (error) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[rate-limit] Redis client error", error);
      }
    });

    clientPromise = client.connect().then(() => client);
    redisClientCache.set(redisUrl, clientPromise);
  }

  try {
    return await clientPromise;
  } catch (error) {
    redisClientCache.delete(redisUrl);
    throw error;
  }
}

export function createMemoryRateLimitStore({
  bucketTtlMs = DEFAULT_BUCKET_TTL_MS,
  cleanupIntervalMs = 5 * 60 * 1000,
} = {}) {
  const buckets = new Map();
  // Per-bucket mutex. Maps a bucket key to `true` while a checkAndDeduct call
  // owns it, so concurrent calls for the same key are serialized rather than
  // racing on a shared read/modify/write.
  const locks = new Map();
  let interval = null;

  async function acquireLock(bucketKey) {
    // Spin until the lock is free. The check-and-set below runs in a single
    // synchronous tick (no await between read and set), so two callers can
    // never both observe a free lock and acquire it simultaneously.
    while (locks.get(bucketKey)) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    locks.set(bucketKey, true);
  }

  function releaseLock(bucketKey) {
    locks.delete(bucketKey);
  }

  if (cleanupIntervalMs > 0) {
    interval = setInterval(() => {
      const now = Date.now();
      for (const [bucketKey, bucket] of buckets.entries()) {
        if (getMemoryStoreExpiration(bucket, bucketTtlMs, now)) {
          buckets.delete(bucketKey);
        }
      }
    }, cleanupIntervalMs);

    if (typeof interval.unref === "function") {
      interval.unref();
    }
  }

  return {
    kind: "memory",
    bucketTtlMs,
    async getBucket(bucketKey, now = Date.now()) {
      const bucket = buckets.get(bucketKey);
      if (bucket) {
        if (getMemoryStoreExpiration(bucket, bucketTtlMs, now)) {
          buckets.delete(bucketKey);
          return null;
        }
        return { ...bucket };
      }
      return null;
    },
    async setBucket(bucketKey, bucket) {
      buckets.set(bucketKey, normalizeBucket(bucket));
    },
    async checkAndDeduct(bucketKey, config = {}) {
      const {
        limitPerMinute = 0,
        burstCapacity = limitPerMinute,
        now = Date.now(),
      } = config;

      await acquireLock(bucketKey);
      try {
        const existing = buckets.get(bucketKey);

        let bucket;
        if (existing && !getMemoryStoreExpiration(existing, bucketTtlMs, now)) {
          bucket = { ...existing };
        } else {
          // No bucket yet (or it expired): start full so the first request is
          // always allowed, matching the previous create-then-deduct behavior.
          bucket = {
            tokens: burstCapacity,
            lastRefillAt: now,
            limitPerMinute,
            burstCapacity,
          };
        }

        refillBucket(bucket, limitPerMinute, burstCapacity, now);

        if (bucket.tokens < 1) {
          buckets.set(bucketKey, normalizeBucket(bucket));
          return { allowed: false, remaining: 0, tokens: bucket.tokens };
        }

        bucket.tokens -= 1;
        buckets.set(bucketKey, normalizeBucket(bucket));

        return {
          allowed: true,
          remaining: Math.floor(bucket.tokens),
          tokens: bucket.tokens,
        };
      } finally {
        releaseLock(bucketKey);
      }
    },
    async deleteBucket(bucketKey) {
      buckets.delete(bucketKey);
    },
    async cleanupExpiredBuckets(now = Date.now()) {
      for (const [bucketKey, bucket] of buckets.entries()) {
        if (getMemoryStoreExpiration(bucket, bucketTtlMs, now)) {
          buckets.delete(bucketKey);
        }
      }
    },
    async close() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    },
  };
}

export function createRedisRateLimitStore({
  redisUrl = process.env.REDIS_URL,
  keyPrefix = DEFAULT_REDIS_PREFIX,
  bucketTtlMs = DEFAULT_BUCKET_TTL_MS,
  // Optional pre-connected client. Lets callers (and tests) inject a client
  // instead of lazily connecting to `redisUrl`.
  client = null,
} = {}) {
  if (!redisUrl && !client) {
    throw new Error("REDIS_URL is required to enable Redis rate limiting");
  }

  const resolveClient = () => (client ? Promise.resolve(client) : getRedisClient(redisUrl));

  return {
    kind: "redis",
    bucketTtlMs,
    async getBucket(bucketKey) {
      const client = await resolveClient();
      const value = await client.get(getRedisKey(keyPrefix, bucketKey));

      if (!value) {
        return null;
      }

      try {
        return normalizeBucket(JSON.parse(value));
      } catch {
        return null;
      }
    },
    async setBucket(bucketKey, bucket) {
      const client = await resolveClient();
      await client.set(
        getRedisKey(keyPrefix, bucketKey),
        JSON.stringify(normalizeBucket(bucket)),
        { PX: bucketTtlMs }
      );
    },
    async checkAndDeduct(bucketKey, config = {}) {
      const {
        limitPerMinute = 0,
        burstCapacity = limitPerMinute,
        now = Date.now(),
      } = config;

      const client = await resolveClient();
      const result = await client.eval(CHECK_AND_DEDUCT_LUA, {
        keys: [getRedisKey(keyPrefix, bucketKey)],
        arguments: [
          String(now),
          String(limitPerMinute),
          String(burstCapacity),
          String(bucketTtlMs),
        ],
      });

      const allowed = Number(result?.[0]) === 1;
      const tokens = Number(result?.[2] ?? 0);

      return {
        allowed,
        remaining: allowed ? Math.max(0, Math.floor(tokens)) : 0,
        tokens: Number.isFinite(tokens) ? tokens : 0,
      };
    },
    async deleteBucket(bucketKey) {
      const client = await resolveClient();
      await client.del(getRedisKey(keyPrefix, bucketKey));
    },
    async cleanupExpiredBuckets() {
      return undefined;
    },
  };
}

export function createRateLimitStore({
  driver = process.env.RATE_LIMIT_STORE ?? "auto",
  redisUrl = process.env.REDIS_URL,
  keyPrefix = DEFAULT_REDIS_PREFIX,
  bucketTtlMs = DEFAULT_BUCKET_TTL_MS,
} = {}) {
  const normalizedDriver = String(driver).toLowerCase();

  if (normalizedDriver === "redis" || (normalizedDriver === "auto" && redisUrl)) {
    return createRedisRateLimitStore({ redisUrl, keyPrefix, bucketTtlMs });
  }

  return createMemoryRateLimitStore({ bucketTtlMs });
}