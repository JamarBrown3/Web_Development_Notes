import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import mongoose from "mongoose";
import session from "express-session";
import { createApp } from "../app.js";
import { createAuth } from "../security/auth.js";
import { createAuthService } from "../services/authService.js";
import { assertOwner, findOwned, readObjectId } from "../security/access.js";
import User from "../models/User.js";
import Item from "../models/Item.js";
import Reset from "../models/PasswordResetToken.js";
import { listen, secret } from "./helpers.js";

async function withApp(run, options = {}) {
  const { base, close } = await listen(createApp({
    checkDatabase: async () => true,
    clientOrigin: "http://localhost:5173",
    ...options,
  }));
  try {
    await run(base);
  } finally {
    await close();
  }
}

const authForTests = () => createAuth({
  service: createAuthService({ UserModel: User }),
  store: new session.MemoryStore(),
  secret,
  production: false,
});

test("health returns JSON and does not expose Express", async () => withApp(async (base) => {
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-powered-by"), null);
  assert.deepEqual(await response.json(), { status: "ok" });
}));

test("database health hides diagnostics during an outage", async () => {
  await withApp(async (base) => {
    const response = await fetch(`${base}/api/health/database`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "error", database: "unavailable" });
  }, { checkDatabase: async () => { throw new Error("private-diagnostic-marker"); } });
});

test("unknown routes return a JSON 404", async () => withApp(async (base) => {
  const response = await fetch(`${base}/api/not-a-route`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Route not found." });
}));

test("malformed JSON returns a 400", async () => withApp(async (base) => {
  const response = await fetch(`${base}/api/health`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{broken",
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid JSON request body." });
}));

test("a body over 100 KiB returns a 413", async () => withApp(async (base) => {
  const response = await fetch(`${base}/api/health`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ x: "y".repeat(110 * 1024) }),
  });
  assert.equal(response.status, 413);
}));

test("only the configured frontend gets CORS permission", async () => withApp(async (base) => {
  const allowed = await fetch(`${base}/api/health`, { headers: { Origin: "http://localhost:5173" } });
  assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:5173");
  assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");
  const other = await fetch(`${base}/api/health`, { headers: { Origin: "https://untrusted.example" } });
  assert.equal(other.headers.get("access-control-allow-origin"), null);
}));

test("a trailing slash in CLIENT_ORIGIN still matches, and look-alikes do not", async () => {
  await withApp(async (base) => {
    const response = await fetch(`${base}/api/health`, { headers: { Origin: "http://localhost:5173" } });
    assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:5173");
    const other = await fetch(`${base}/api/health`, { headers: { Origin: "http://localhost:5173.attacker.example" } });
    assert.equal(other.headers.get("access-control-allow-origin"), null);
  }, { clientOrigin: "http://localhost:5173/" });
});

test("one IP flooding the API gets a 429, but health checks are never blocked", async () => {
  await withApp(async (base) => {
    const statuses = [];
    for (let index = 0; index < 8; index += 1) statuses.push((await fetch(`${base}/api/anything-${index}`)).status);
    assert.deepEqual(statuses, [404, 404, 404, 404, 404, 429, 429, 429]);
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
  }, { globalRateLimitMax: 5 });
});

test("operator-like or oversized query strings are refused", async () => withApp(async (base) => {
  for (const query of [
    "email[$ne]=x", "%24where=1", "user.role=admin", "__proto__=1", `q=${"x".repeat(2001)}`,
    Array.from({ length: 31 }, (_, i) => `k${i}=1`).join("&"),
    Array.from({ length: 21 }, () => "tag=a").join("&"),
  ]) {
    const response = await fetch(`${base}/api/health/database?${query}`);
    assert.equal(response.status, 400, query.slice(0, 40));
  }
  assert.equal((await fetch(`${base}/api/health/database?page=2&sort=new&tag=a&tag=b`)).status, 200);
}));

test("every API answer, even a 404, is marked no-store", async () => withApp(async (base) => {
  for (const path of ["/api/not-a-route", "/api/health", "/api/health/database"]) {
    assert.equal((await fetch(`${base}${path}`)).headers.get("cache-control"), "no-store", path);
  }
}));

test("every response gets a fresh request ID, and a client's ID is ignored", async () => withApp(async (base) => {
  const first = await fetch(`${base}/api/health`, { headers: { "X-Request-Id": "forged-log-entry" } });
  const second = await fetch(`${base}/api/health`);
  assert.match(first.headers.get("x-request-id"), /^[0-9a-f-]{36}$/);
  assert.notEqual(first.headers.get("x-request-id"), second.headers.get("x-request-id"));
}));

test("bad request encodings are 415 client errors, not 500", async () => withApp(async (base) => {
  const charset = await fetch(`${base}/api/health`, { method: "POST", headers: { "Content-Type": "application/json; charset=iso-8859-1" }, body: "{}" });
  assert.equal(charset.status, 415);
  assert.deepEqual(await charset.json(), { error: "The request could not be processed." });
  const encoding = await fetch(`${base}/api/health`, { method: "POST", headers: { "Content-Type": "application/json", "Content-Encoding": "x-unknown" }, body: "{}" });
  assert.equal(encoding.status, 415);
}));

test("unexpected errors return a generic 500 that never echoes the error text", async () => {
  const hidden = "duplicate key error dup key: { email: \"victim@example.invalid\" }";
  const originalError = console.error;
  const logged = [];
  console.error = (line) => logged.push(String(line));
  try {
    await withApp(async (base) => {
      const response = await fetch(`${base}/api/explode`);
      const body = await response.json();
      assert.equal(response.status, 500);
      assert.equal(body.error, "An unexpected server error occurred.");
      assert.equal(body.requestId, response.headers.get("x-request-id"));
      assert.ok(!JSON.stringify(body).includes("victim@example.invalid"));
      assert.ok(logged.some((line) => line.includes(body.requestId)));
    }, {
      auth: authForTests(),
      mountRoutes: (app) => app.get("/api/explode", () => { throw new Error(hidden); }),
    });
  } finally {
    console.error = originalError;
  }
});

test("Mongoose validation errors become a 400 with no field details", async () => {
  await withApp(async (base) => {
    const response = await fetch(`${base}/api/validate`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "The request contains invalid data." });
  }, {
    auth: authForTests(),
    mountRoutes: (app) => app.get("/api/validate", async () => { await new Item({ title: "x".repeat(500) }).validate(); }),
  });
});

test("routes under the guarded prefixes are protected automatically", async () => {
  const reached = [];
  await withApp(async (base) => {
    for (const path of ["/api/admin/stats", "/API/ADMIN/stats", "/api/admin/stats/", "/api/account/me"]) {
      const response = await fetch(`${base}${path}`, { headers: { "X-User-Role": "admin", Cookie: "role=admin" } });
      assert.equal(response.status, 401, path);
    }
    assert.equal((await fetch(`${base}/api/public`)).status, 200);
    assert.deepEqual(reached, ["/api/public"]);
  }, {
    auth: authForTests(),
    mountRoutes: (app) => {
      const open = express.Router();
      open.get("/", (req, res) => {
        reached.push(req.originalUrl);
        res.json({ ok: true });
      });
      for (const prefix of ["/api/admin/stats", "/api/account/me", "/api/public"]) app.use(prefix, open);
    },
  });
});

test("routes cannot be mounted without the authentication middleware", () => {
  assert.throws(() => createApp({ mountRoutes: () => {} }), /requires authentication/);
});

test("only real 24-character IDs are accepted from URLs", () => {
  const id = new mongoose.Types.ObjectId().toString();
  assert.equal(readObjectId(id.toUpperCase()), id);
  for (const bad of ["", "123", `${id}0`, { $ne: null }, [id], null, undefined, "zzzzzzzzzzzzzzzzzzzzzzzz"]) {
    assert.throws(() => readObjectId(bad), { status: 404 });
  }
});

test("findOwned always puts the owner in the database query", async () => {
  const filters = [];
  const FakeModel = { findOne(filter) { filters.push(filter); return { select() {}, then: (resolve) => resolve(null) }; } };
  const id = new mongoose.Types.ObjectId().toString();
  const ownerId = new mongoose.Types.ObjectId();
  await findOwned(FakeModel, { id, ownerId });
  assert.deepEqual(filters[0], { _id: id, ownerId });
  await assert.rejects(findOwned(FakeModel, { id }), /owner/);
  assert.throws(() => assertOwner({ ownerId: new mongoose.Types.ObjectId() }, ownerId), { status: 404 });
  assert.throws(() => assertOwner(null, ownerId), { status: 404 });
});

test("private user fields are hidden from queries and JSON", () => {
  for (const field of ["email", "passwordHash"]) assert.equal(User.schema.path(field).options.select, false, field);
  const json = new User({ username: "fixture", email: "fixture@example.invalid", passwordHash: "x" }).toJSON();
  for (const field of ["email", "passwordHash", "sessionVersion", "__v"]) assert.equal(json[field], undefined, field);
  assert.equal(json.username, "fixture");
});

test("usernames are unique ignoring capital letters", () => {
  const index = User.schema.indexes().find(([keys]) => keys.username === 1);
  assert.equal(index[1].unique, true);
  assert.deepEqual(index[1].collation, { locale: "en", strength: 2 });
});

test("the database safety settings are on", () => {
  assert.equal(mongoose.get("sanitizeFilter"), true);
});

test("reset tokens store only a hidden hash and expire", () => {
  assert.equal(Reset.schema.path("tokenHash").options.select, false);
  assert.ok(Reset.schema.indexes().some(([keys, options]) => keys.expiresAt === 1 && options.expireAfterSeconds === 0));
  const record = new Reset({ userId: new mongoose.Types.ObjectId(), sessionVersion: 0, tokenHash: "a".repeat(64), expiresAt: new Date() });
  assert.equal(record.toJSON().tokenHash, undefined);
  assert.ok(new Reset({ tokenHash: "too-short" }).validateSync().errors.tokenHash);
});
