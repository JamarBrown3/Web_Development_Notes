// Runs the login system against a real MongoDB. Skipped unless you opt in:
//
//   TEST_MONGODB_URI="..." TEST_MONGODB_DB="my_project_test" npm run test:database
//
// It refuses any database whose name does not end in _test, and it deletes
// everything in that database when it starts and when it ends. Never point this
// at a database you care about. It sends no email: "emails" go to a list.
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { createApp } from "../app.js";
import { createAuth } from "../security/auth.js";
import { createAccountLoginLimiter } from "../security/accountLoginLimit.js";
import { assertApplicationRoles } from "../security/databaseAccess.js";
import { createAuthService, tokenDigest } from "../services/authService.js";
import User from "../models/User.js";
import Reset from "../models/PasswordResetToken.js";
import Item from "../models/Item.js";
import itemRoutes from "../routes/items.js";
import { browser, listen, secret } from "./helpers.js";

const uri = process.env.TEST_MONGODB_URI;
const dbName = process.env.TEST_MONGODB_DB;
const tokenFrom = (resetUrl) => new URLSearchParams(new URL(resetUrl).hash.slice(1)).get("token");
const post = (body) => ({ method: "POST", body });

async function emptyDatabase() {
  for (const { name } of await mongoose.connection.db.listCollections().toArray()) {
    await mongoose.connection.db.collection(name).deleteMany({});
  }
}

test("real MongoDB: sessions, login, reset transaction, and record ownership", {
  skip: uri ? false : "Set TEST_MONGODB_URI and TEST_MONGODB_DB to run this.",
  timeout: 90000,
}, async (t) => {
  assert.match(dbName ?? "", /_test$/, "TEST_MONGODB_DB must end in _test.");

  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000 });
  let server;
  try {
    await emptyDatabase();
    await Promise.all([User.init(), Reset.init(), Item.init()]);

    const status = await mongoose.connection.db.admin().command({ connectionStatus: 1 });
    await t.test("the test login has only readWrite on this database", () => {
      assertApplicationRoles(status.authInfo, dbName);
    });

    const deliveries = [];
    let onDelivery;
    const service = createAuthService({
      resetOrigin: "https://app.example",
      deliverResetEmail: async (message) => {
        deliveries.push(message);
        onDelivery?.();
      },
      resetEmailMinGapMs: 0,
    });
    const auth = createAuth({ connection: mongoose.connection, service, secret, production: false, rateLimitMax: 100 });
    await auth.ready();
    server = await listen(createApp({
      auth,
      checkDatabase: async () => true,
      mountRoutes: (app, { auth }) => app.use("/api/items", itemRoutes(auth)),
    }));

    const request = browser(server.base);
    const email = "fixture@example.invalid";
    const password = "original fixture password only";
    const newPassword = "new fixture password only please";

    await t.test("the CSRF request saves a session in MongoDB with an expiry index", async () => {
      assert.equal((await request("/api/auth/csrf")).status, 200);
      const sessions = mongoose.connection.db.collection("sessions");
      assert.ok(await sessions.countDocuments({}));
      assert.ok((await sessions.indexes()).some((index) => index.key.expires === 1 && index.expireAfterSeconds === 0));
    });

    await t.test("registration makes a normal user and enforces unique usernames", async () => {
      assert.equal((await request("/api/auth/register", post({ username: "fixture", email, password, role: "admin" }))).status, 400);
      assert.equal(await User.countDocuments({}), 0);
      assert.equal((await request("/api/auth/register", post({ username: "fixture", email, password }))).status, 202);
      assert.equal((await User.findOne({ email })).role, "user");
      assert.equal((await request("/api/auth/register", post({ username: "FIXTURE", email: "other@example.invalid", password }))).status, 409);
      assert.equal((await request("/api/auth/register", post({ username: "someone", email: email.toUpperCase(), password }))).status, 202);
      assert.equal(await User.countDocuments({}), 1);
    });

    await t.test("login rotates the session and hides password data", async () => {
      const before = (await request("/api/auth/csrf")).cookie;
      const result = await request("/api/auth/login", post({ email, password }));
      assert.equal(result.status, 200);
      assert.notEqual(result.cookie, before);
      assert.equal(result.data.user.passwordHash, undefined);
      assert.match((await User.findOne({ email }).select("+passwordHash")).passwordHash, /^\$argon2id\$/);
    });

    await t.test("a normal account cannot reach admin routes", async () => {
      assert.equal((await request("/api/admin")).status, 403);
    });

    await t.test("one account can never read or change another account's item", async () => {
      const created = await request("/api/items", post({ title: "Mine", description: "private", ownerId: "x" }));
      assert.equal(created.status, 400); // ownerId can never come from the client
      const mine = await request("/api/items", post({ title: "Mine", description: "private" }));
      assert.equal(mine.status, 201);

      const other = browser(server.base);
      await other("/api/auth/csrf");
      await other("/api/auth/register", post({ username: "second", email: "second@example.invalid", password }));
      await other("/api/auth/login", post({ email: "second@example.invalid", password }));
      assert.deepEqual((await other("/api/items")).data, []);
      assert.equal((await other(`/api/items/${mine.data.id}`)).status, 404);
      assert.equal((await other(`/api/items/${mine.data.id}`, { method: "PATCH", body: { title: "Stolen" } })).status, 404);
      assert.equal((await other(`/api/items/${mine.data.id}`, { method: "DELETE" })).status, 404);

      const still = await request(`/api/items/${mine.data.id}`);
      assert.equal(still.status, 200);
      assert.equal(still.data.title, "Mine");

      // PATCH keeps the fields it was not sent.
      const patched = await request(`/api/items/${mine.data.id}`, { method: "PATCH", body: { title: "Renamed" } });
      assert.equal(patched.data.title, "Renamed");
      assert.equal(patched.data.description, "private");

      const anonymous = browser(server.base);
      assert.equal((await anonymous("/api/items")).status, 401);
    });

    const oldCookie = (await request("/api/auth/me")).cookie;

    await t.test("recovery delivers a link but never returns the secret", async () => {
      const delivered = new Promise((resolve) => { onDelivery = resolve; });
      const result = await request("/api/auth/forgot-password", post({ email }));
      assert.equal(result.status, 202);
      assert.deepEqual(Object.keys(result.data), ["message"]);
      await delivered;
      onDelivery = undefined;
      assert.equal(new URL(deliveries[0].resetUrl).search, "");
      const token = tokenFrom(deliveries[0].resetUrl);
      assert.equal(token.length, 64);
      const record = await Reset.findOne({}).select("+tokenHash");
      assert.equal(record.tokenHash, tokenDigest(token));
    });

    await t.test("a second request gets a different secret", async () => {
      await service.requestReset({ email });
      assert.equal(deliveries.length, 2);
      assert.notEqual(deliveries[0].resetUrl, deliveries[1].resetUrl);
    });

    const token = tokenFrom(deliveries[0].resetUrl);

    await t.test("the reset transaction changes the password and cancels all links", async () => {
      assert.equal((await request("/api/auth/reset-password", post({ token, newPassword }))).status, 200);
      assert.equal(await Reset.countDocuments({}), 0);
      assert.equal((await User.findOne({ email })).sessionVersion, 1);
    });

    await t.test("the reset signs out old sessions", async () => {
      const copied = browser(server.base);
      assert.equal((await copied("/api/auth/me", { headers: { Cookie: oldCookie } })).status, 401);
    });

    await request("/api/auth/csrf");

    await t.test("the same link cannot be used twice, and neither can the other one", async () => {
      assert.equal((await request("/api/auth/reset-password", post({ token, newPassword }))).status, 400);
      await request("/api/auth/csrf");
      assert.equal((await request("/api/auth/reset-password", post({ token: tokenFrom(deliveries[1].resetUrl), newPassword }))).status, 400);
    });

    await t.test("only the new password signs in", async () => {
      await request("/api/auth/csrf");
      assert.equal((await request("/api/auth/login", post({ email, password }))).status, 401);
      assert.equal((await request("/api/auth/login", post({ email, password: newPassword }))).status, 200);
    });

    await t.test("expired links are refused without waiting for cleanup", async () => {
      await service.requestReset({ email });
      const expired = tokenFrom(deliveries[2].resetUrl);
      await Reset.updateOne({ tokenHash: tokenDigest(expired) }, { $set: { expiresAt: new Date(0) } });
      assert.equal((await request("/api/auth/reset-password", post({ token: expired, newPassword }))).status, 400);
      assert.equal((await User.findOne({ email })).sessionVersion, 1);
    });

    await t.test("logout ends the session in MongoDB", async () => {
      const signedIn = (await request("/api/auth/me")).cookie;
      assert.equal((await request("/api/auth/logout", post({}))).status, 200);
      const copied = browser(server.base);
      assert.equal((await copied("/api/auth/me", { headers: { Cookie: signedIn } })).status, 401);
    });

    await t.test("the login counter is atomic across workers and expires", async () => {
      const collection = mongoose.connection.db.collection("loginAccountLimits");
      const clock = Date.now();
      const options = { collection, secret, limit: 5, now: () => clock };
      const workers = [createAccountLoginLimiter(options), createAccountLoginLimiter(options)];
      const results = await Promise.all(Array.from({ length: 40 }, (_, i) => workers[i % 2].consume("counter@example.invalid")));
      assert.equal(results.filter((result) => result.allowed).length, 5);
      assert.ok((await collection.indexes()).some((index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0));
    });
  } finally {
    if (server) await server.close();
    await emptyDatabase();
    await mongoose.disconnect();
  }
});
