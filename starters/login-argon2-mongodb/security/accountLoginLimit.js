// One login budget per email, across IP addresses and server processes.
// The MongoDB counter is separate from sessions and password-reset tokens.
import { createHmac } from "node:crypto";
import { HttpError } from "./input.js";

export function createAccountLoginLimiter({
  collection,
  secret,
  limit = 20,
  windowMs = 15 * 60 * 1000,
  now = () => Date.now(),
} = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000 ||
      !Number.isSafeInteger(windowMs) || windowMs < 1000 ||
      typeof secret !== "string" || Buffer.byteLength(secret) < 32) {
    throw new Error("Invalid per-account login-limit configuration.");
  }

  let indexReady;
  function ready() {
    // Missing/unavailable shared storage must never silently disable the limit.
    if (!collection) {
      return Promise.reject(new HttpError(503, "Login protection is temporarily unavailable."));
    }
    indexReady ||= Promise.resolve().then(() => collection.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "login_limit_expiry", maxTimeMS: 5000 },
    )).catch(() => {
      indexReady = undefined;
      throw new HttpError(503, "Login protection is temporarily unavailable.");
    });
    return indexReady;
  }

  async function consume(email) {
    await ready();
    const time = now();
    const start = Math.floor(time / windowMs) * windowMs;
    const resetAt = start + windowMs;
    // A keyed digest, not a raw email or an easily guessed unkeyed hash.
    // Every server instance must use the same stable SESSION_SECRET.
    const digest = createHmac("sha256", secret).update("login:").update(email).digest("hex");
    const id = `${start}:${digest}`;
    let record;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        // One atomic increment: simultaneous requests receive different counts.
        // Expiration only cleans up; the bucket ID enforces the time window.
        record = await collection.findOneAndUpdate(
          { _id: id },
          { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(resetAt) } },
          { upsert: true, returnDocument: "after", includeResultMetadata: false, maxTimeMS: 5000 },
        );
        break;
      } catch (error) {
        // A first-insert race can hit the unique _id index. Retry that case only.
        if (error.code === 11000 && attempt === 0) continue;
        throw new HttpError(503, "Login protection is temporarily unavailable.");
      }
    }
    if (!Number.isSafeInteger(record?.count) || record.count < 1) {
      throw new HttpError(503, "Login protection is temporarily unavailable.");
    }
    return {
      allowed: record.count <= limit,
      retryAfter: Math.max(1, Math.ceil((resetAt - time) / 1000)),
    };
  }

  return { consume, ready };
}
