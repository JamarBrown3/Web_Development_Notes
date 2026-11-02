import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { HttpError, readNewPassword } from "./input.js";

// Settings for new password hashes. This is OWASP's minimum recommended
// Argon2id setting. memoryCost is in KiB, so 19456 KiB is 19 MiB.
const ARGON_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
};

// Every cost setting this app has ever used. Verification accepts any of them,
// so raising the costs later does not lock users out. The first entry must
// always match ARGON_OPTIONS. Older entries upgrade at the next sign-in.
const SUPPORTED_ARGON_PARAMETERS = [{ m: 19456, t: 2, p: 1 }];

function readArgonParameters(encoded) {
  if (typeof encoded !== "string" || encoded.length > 200) {
    return null;
  }

  // The three cost parameters may appear in different orders.
  const match =
    /^\$argon2id\$v=19\$((?:[mtp]=[0-9]{1,6},){2}[mtp]=[0-9]{1,6})\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/.exec(
      encoded,
    );

  if (!match) {
    return null;
  }

  // Check that the parameters are exactly m, t, and p, with no duplicates.
  const parameters = Object.fromEntries(
    match[1].split(",").map((pair) => {
      const [name, value] = pair.split("=");
      return [name, Number(value)];
    }),
  );
  return Object.keys(parameters).length === 3 ? parameters : null;
}

// Do not let a malformed stored hash request unlimited memory or work.
function isSupportedArgonHash(encoded) {
  const parameters = readArgonParameters(encoded);
  return Boolean(
    parameters &&
      SUPPORTED_ARGON_PARAMETERS.some(
        ({ m, t, p }) => parameters.m === m && parameters.t === t && parameters.p === p,
      ),
  );
}

// A waiting line for password work. Up to 4 hashes run at once (Node runs
// Argon2 on 4 background threads by default), up to 32 more requests wait, and
// a request waiting over 10 seconds gets a 503. Memory stays bounded at about
// 4 x 19 MiB = 76 MiB, and a burst of sign-ins waits instead of failing.
const MAX_CONCURRENT_HASHES = 4;
const MAX_WAITING_HASHES = 32;
const HASH_WAIT_TIMEOUT_MS = 10_000;

let active = 0;
const waiting = [];
let dummyHashPromise;

function busy() {
  return new HttpError(503, "Authentication is temporarily busy. Please try again.");
}

// Wait for a free hashing slot, or fail if the line is too long or too slow.
function acquireSlot() {
  if (active < MAX_CONCURRENT_HASHES) {
    active += 1;
    return Promise.resolve();
  }
  if (waiting.length >= MAX_WAITING_HASHES) {
    return Promise.reject(busy());
  }
  return new Promise((resolve, reject) => {
    const entry = { resolve, timer: null };
    entry.timer = setTimeout(() => {
      const index = waiting.indexOf(entry);
      if (index !== -1) waiting.splice(index, 1);
      reject(busy());
    }, HASH_WAIT_TIMEOUT_MS);
    entry.timer.unref?.();
    waiting.push(entry);
  });
}

// Hand the slot straight to the next waiting request, or free it.
function releaseSlot() {
  const next = waiting.shift();
  if (next) {
    clearTimeout(next.timer);
    next.resolve(); // the slot passes along, so "active" is unchanged
  } else {
    active -= 1;
  }
}

async function withPasswordSlot(work) {
  await acquireSlot();

  try {
    return await work();
  } finally {
    // Release the slot even if hashing throws an error.
    releaseSlot();
  }
}

// An unknown account still does the same password work as a real one.
// Otherwise a bot could find registered emails by timing the login response.
function getDummyHash() {
  if (!dummyHashPromise) {
    dummyHashPromise = argon2
      .hash(randomBytes(32).toString("hex"), ARGON_OPTIONS)
      .catch((error) => {
        // Allow a later attempt to retry after a library failure.
        dummyHashPromise = undefined;
        throw error;
      });
  }
  return dummyHashPromise;
}

// Used when registering or choosing a new password.
export async function hashNewPassword(password) {
  readNewPassword(password);

  // Argon2 generates the random salt for us.
  return withPasswordSlot(() => argon2.hash(password, ARGON_OPTIONS));
}

// Used when checking an existing password.
export async function verifyPassword(password, encoded) {
  if (typeof password !== "string" || password.length < 1 || password.length > 128) {
    return false;
  }

  return withPasswordSlot(async () => {
    if (isSupportedArgonHash(encoded)) {
      return argon2.verify(encoded, password);
    }

    // Missing account or unsupported stored format: do the same work, but
    // never accept the password.
    const dummyHash = await getDummyHash();
    await argon2.verify(dummyHash, password);
    return false;
  });
}

// True when a stored hash uses older cost settings. After a successful sign-in
// the login service re-hashes the password with the current settings.
export function needsRehash(encoded) {
  const parameters = readArgonParameters(encoded);
  if (!parameters) return true;
  return !(
    parameters.m === ARGON_OPTIONS.memoryCost &&
    parameters.t === ARGON_OPTIONS.timeCost &&
    parameters.p === ARGON_OPTIONS.parallelism
  );
}

// Exposed only so tests can confirm the waiting-line limits.
export const PASSWORD_WORK_LIMITS = Object.freeze({
  MAX_CONCURRENT_HASHES,
  MAX_WAITING_HASHES,
  HASH_WAIT_TIMEOUT_MS,
});
