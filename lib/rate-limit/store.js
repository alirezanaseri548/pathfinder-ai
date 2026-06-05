export const DEFAULT_BUCKET_TTL_MS = 10 * 60 * 1000;
const DEFAULT_REDIS_PREFIX = "pathfinder:rate-limit";
const DEFAULT_MEMORY_CLEANUP_INTERVAL_MS = 30 * 1000;
const DEFAULT_MEMORY_CLEANUP_BATCH_SIZE = 250;
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
  const lockPromises = new Map();
  let interval = null;

  function acquireLock(bucketKey) {
    const currentPromise = lockPromises.get(bucketKey) || Promise.resolve();
    const newPromise = currentPromise.then(() => undefined);
    lockPromises.set(bucketKey, newPromise);
    return currentPromise;
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

      if (burstCapacity <= 0) {
        return { allowed: false, remaining: 0, retryAfterSeconds: 60 };
      }

      await acquireLock(bucketKey);
      try {
        let bucket = buckets.get(bucketKey);

        if (bucket && getMemoryStoreExpiration(bucket, bucketTtlMs, now)) {
          buckets.delete(bucketKey);
          bucket = null;
        }

        if (!bucket) {
          const tokens = Math.max(0, burstCapacity - 1);
          buckets.set(
            bucketKey,
            normalizeBucket({
              tokens,
              lastRefillAt: now,
              limitPerMinute,
              burstCapacity,
            })
          );
          return { allowed: true, remaining: tokens, retryAfterSeconds: 0 };
        }

        const elapsedMinutes = (now - bucket.lastRefillAt) / 60000;
        const refillAmount = elapsedMinutes * limitPerMinute;
        bucket.tokens = Math.min(burstCapacity, bucket.tokens + refillAmount);
        bucket.lastRefillAt = now;

        if (bucket.tokens < 1) {
          const missingTokens = 1 - bucket.tokens;
          const retryAfterSeconds =
            limitPerMinute > 0
              ? Math.max(1, Math.ceil((missingTokens / limitPerMinute) * 60))
              : 60;
          buckets.set(bucketKey, normalizeBucket(bucket));
          return { allowed: false, remaining: 0, retryAfterSeconds };
        }

        bucket.tokens -= 1;
        buckets.set(bucketKey, normalizeBucket(bucket));
        return { allowed: true, remaining: Math.floor(bucket.tokens), retryAfterSeconds: 0 };
      } finally {
        lockPromises.delete(bucketKey);
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

const CHECK_AND_DEDUCT_SCRIPT = `
local key = KEYS[1]
local limitPerMinute = tonumber(ARGV[1])
local burstCapacity = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local ttlMs = tonumber(ARGV[4])

local raw = redis.call('GET', key)

if not raw then
  local tokens = math.max(0, burstCapacity - 1)
  local bucket = cjson.encode({ tokens = tokens, lastRefillAt = now, limitPerMinute = limitPerMinute, burstCapacity = burstCapacity })
  redis.call('SET', key, bucket, 'PX', ttlMs)
  return {1, tokens, 0}
end

local ok, bucket = pcall(cjson.decode, raw)
if not ok then
  return {0, 0, 60}
end

local elapsedMinutes = (now - bucket.lastRefillAt) / 60000
local refillAmount = elapsedMinutes * limitPerMinute
bucket.tokens = math.min(burstCapacity, bucket.tokens + refillAmount)
bucket.lastRefillAt = now

if bucket.tokens < 1 then
  local missingTokens = 1 - bucket.tokens
  local retryAfterSeconds
  if limitPerMinute > 0 then
    retryAfterSeconds = math.max(1, math.ceil((missingTokens / limitPerMinute) * 60))
  else
    retryAfterSeconds = 60
  end
  redis.call('SET', key, cjson.encode(bucket), 'PX', ttlMs)
  return {0, 0, retryAfterSeconds}
end

bucket.tokens = bucket.tokens - 1
redis.call('SET', key, cjson.encode(bucket), 'PX', ttlMs)
return {1, math.floor(bucket.tokens), 0}
`;

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
    async checkAndDeduct(bucketKey, { limitPerMinute, burstCapacity, now = Date.now() }) {
      const client = await getRedisClient(redisUrl);
      const redisKey = getRedisKey(keyPrefix, bucketKey);
      const [allowed, remaining, retryAfterSeconds] = await client.eval(
        CHECK_AND_DEDUCT_SCRIPT,
        {
          keys: [redisKey],
          arguments: [
            String(limitPerMinute),
            String(burstCapacity),
            String(now),
            String(bucketTtlMs),
          ],
        }
      );
      return {
        allowed: allowed === 1,
        remaining,
        retryAfterSeconds,
      };
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
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    if (normalizedDriver === "memory") {
      throw new Error(
        "RATE_LIMIT_STORE=memory is not allowed in production; configure REDIS_URL and use RATE_LIMIT_STORE=auto or RATE_LIMIT_STORE=redis"
      );
    }

    if (!redisUrl) {
      throw new Error("REDIS_URL is required in production for shared rate limiting");
    }
  }

  if (normalizedDriver === "redis" || (normalizedDriver === "auto" && redisUrl)) {
    return createRedisRateLimitStore({ redisUrl, keyPrefix, bucketTtlMs });
  }

  return createMemoryRateLimitStore({ bucketTtlMs });
}