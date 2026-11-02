import test from "node:test";
import assert from "node:assert/strict";
import session from "express-session";
import { createApp } from "../app.js";
import { createAuth } from "../security/auth.js";
import { createAccountLoginLimiter } from "../security/accountLoginLimit.js";
import { hashNewPassword } from "../security/passwords.js";
import { counterCollection, fixture, listen, password, secret } from "./helpers.js";

const account = { username: "fixture", email: "fixture@example.invalid", password };
const post = (body, extra = {}) => ({ method: "POST", body, ...extra });

async function seed(repository, role = "user") {
  return repository.create({
    username: account.username,
    email: account.email,
    passwordHash: await hashNewPassword(password),
    role,
    status: "active",
    sessionVersion: 0,
  });
}

const adminRoute = (app) => app.get("/api/admin/test", (req, res) => res.json({ ok: true }));

test("injection and role attempts never reach user storage", async () => fixture(async ({ request, repository }) => {
  await request("/api/auth/csrf");
  for (const body of [
    { email: { $ne: null }, password: { $ne: null } },
    { email: { $gt: "" }, password: "password" },
    { email: ["fixture@example.invalid"], password },
    { email: "fixture@example.invalid", password: [password] },
  ]) {
    assert.equal((await request("/api/auth/login", post(body))).status, 400);
  }
  assert.equal((await request("/api/auth/register", post({ ...account, role: "admin" }))).status, 400);
  assert.equal(repository.reads(), 0);
  assert.equal(repository.users.size, 0);
}));

test("register, login, session rotation, admin denial, and sign-out everywhere", async () => fixture(async ({ request, repository }) => {
  assert.equal((await request("/api/auth/me")).status, 401);
  assert.equal((await request("/api/admin")).status, 401);

  const initial = await request("/api/auth/csrf");
  assert.match(initial.setCookie, /HttpOnly/i);
  assert.match(initial.setCookie, /SameSite=Strict/i);
  assert.doesNotMatch(initial.setCookie, /; Secure/i); // HTTP development only

  const registration = await request("/api/auth/register", post(account));
  assert.equal(registration.status, 202);
  assert.equal(repository.users.size, 1);
  const user = [...repository.users.values()][0];
  assert.equal(user.role, "user");
  assert.notEqual(user.passwordHash, password);
  assert.equal(user.toJSON().passwordHash, undefined);
  assert.equal(user.toJSON().sessionVersion, undefined);

  // A taken username is public, so it gets a clear answer, ignoring capitals.
  const duplicate = await request("/api/auth/register", post({ ...account, username: "FIXTURE" }));
  assert.equal(duplicate.status, 409);
  // A taken email is private, so it gets the same answer as a new account.
  const duplicateEmail = await request("/api/auth/register", post({ ...account, username: "someone-else" }));
  assert.equal(duplicateEmail.status, 202);
  assert.deepEqual(duplicateEmail.data, registration.data);
  assert.equal(repository.users.size, 1);

  const wrong = await request("/api/auth/login", post({ email: account.email, password: "wrong password" }));
  const missing = await request("/api/auth/login", post({ email: "missing@example.invalid", password: "wrong password" }));
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.data, missing.data);

  const login = await request("/api/auth/login", post({ email: account.email, password }));
  assert.equal(login.status, 200);
  assert.notEqual(login.cookie, initial.cookie);
  assert.notEqual(login.data.csrfToken, initial.data.csrfToken);
  assert.deepEqual(Object.keys(login.data.user).sort(), ["id", "role", "username"]);

  assert.equal((await request("/api/auth/me")).status, 200);
  assert.equal((await request("/api/admin", { headers: { "X-User-Role": "admin" } })).status, 403);

  user.sessionVersion += 1;
  assert.equal((await request("/api/auth/me")).status, 401);
}));

test("logout ends the session on the server", async () => fixture(async ({ request, repository, browser }) => {
  await seed(repository);
  await request("/api/auth/csrf");
  const login = await request("/api/auth/login", post({ email: account.email, password }));
  assert.equal((await request("/api/auth/logout", post({}))).status, 200);

  // Sending the old cookie again must not work.
  const copied = browser();
  const stale = await copied("/api/auth/me", { headers: { Cookie: login.cookie } });
  assert.equal(stale.status, 401);
}));

test("missing or stale CSRF tokens and foreign origins are rejected", async () => fixture(async ({ request, repository }) => {
  assert.equal((await request("/api/auth/register", post(account))).status, 403);
  await request("/api/auth/csrf");
  assert.equal((await request("/api/auth/register", post(account, { token: "a".repeat(64) }))).status, 403);
  assert.equal((await request("/api/auth/register", post(account, { headers: { Origin: "https://attacker.example" } }))).status, 403);
  assert.equal(repository.users.size, 0);
}));

test("password recovery stays off until an email sender is added", async () => fixture(async ({ request }) => {
  await request("/api/auth/csrf");
  for (const email of ["owner@example.invalid", "missing@example.invalid"]) {
    const result = await request("/api/auth/forgot-password", post({ email }));
    assert.equal(result.status, 503);
    assert.deepEqual(result.data, { error: "Password recovery is not configured yet." });
  }
  const result = await request("/api/auth/reset-password", post({ token: "a".repeat(64), newPassword: password }));
  assert.equal(result.status, 503);
  assert.equal(result.data.token, undefined);
}));

test("repeated login attempts from one IP are rate limited", async () => fixture(async ({ request }) => {
  await request("/api/auth/csrf");
  const body = post({ email: ["fixture@example.invalid"], password });
  assert.equal((await request("/api/auth/login", body)).status, 400);
  assert.equal((await request("/api/auth/login", body)).status, 400);
  const last = await request("/api/auth/login", body);
  assert.equal(last.status, 429);
  assert.ok(last.headers.get("retry-after"));
}, { max: 2 }));

test("simultaneous requests and fresh workers share one login budget", async () => {
  const collection = counterCollection();
  const options = { collection, secret, limit: 5 };
  const workers = [createAccountLoginLimiter(options), createAccountLoginLimiter(options)];
  const results = await Promise.all(Array.from({ length: 40 }, (_, i) => workers[i % 2].consume("fixture@example.invalid")));
  assert.equal(results.filter((result) => result.allowed).length, 5);
  assert.equal((await createAccountLoginLimiter(options).consume("fixture@example.invalid")).allowed, false);
  assert.equal((await workers[0].consume("another@example.invalid")).allowed, true);
  assert.ok([...collection.records.keys()].every((key) => !key.includes("@")));
});

test("the next login window opens without waiting for cleanup", async () => {
  let clock = 100000;
  const collection = counterCollection();
  const limiter = createAccountLoginLimiter({ collection, secret, limit: 1, windowMs: 1000, now: () => clock });
  assert.equal((await limiter.consume("fixture@example.invalid")).allowed, true);
  const blocked = await limiter.consume("fixture@example.invalid");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfter, 1);
  clock += 1000;
  assert.equal((await limiter.consume("fixture@example.invalid")).allowed, true);
});

test("missing or failed login counter storage fails closed", async () => {
  for (const collection of [
    undefined,
    { async createIndex() { throw new Error("fixture failure"); } },
    { async createIndex() {}, async findOneAndUpdate() { throw new Error("fixture failure"); } },
  ]) {
    await assert.rejects(createAccountLoginLimiter({ collection, secret }).consume("fixture@example.invalid"), { status: 503 });
  }
});

test("changing IP or email capitals cannot bypass the login budget", async () => fixture(async ({ request, repository }) => {
  await seed(repository);
  await request("/api/auth/csrf");
  for (let i = 0; i < 3; i += 1) {
    const email = i % 2 ? " FIXTURE@EXAMPLE.INVALID " : "fixture@example.invalid";
    const result = await request("/api/auth/login", post({ email, password: "wrong" }, { headers: { "X-Forwarded-For": `192.0.2.${i + 1}` } }));
    assert.equal(result.status, 401);
  }
  const blocked = await request("/api/auth/login", post({ email: account.email, password }, { headers: { "X-Forwarded-For": "198.51.100.20" } }));
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  // Other accounts keep working.
  assert.equal((await request("/api/auth/login", post({ email: "unknown@example.invalid", password: "wrong" }))).status, 401);
}, { limit: 3, trustProxy: 1 }));

test("unavailable counter storage blocks login before the password is checked", async () => fixture(async ({ request, service }) => {
  let checked = false;
  service.authenticate = async () => {
    checked = true;
    throw new Error("must not run");
  };
  await request("/api/auth/csrf");
  assert.equal((await request("/api/auth/login", post({ email: account.email, password }))).status, 503);
  assert.equal(checked, false);
}, { collection: { async createIndex() { throw new Error("fixture outage"); } } }));

test("a stored role change cannot upgrade a session that is already open", async () => fixture(async ({ request, repository }) => {
  const user = await seed(repository);
  await request("/api/auth/csrf");
  assert.equal((await request("/api/auth/login", post({ email: user.email, password }))).status, 200);
  user.role = "admin";
  assert.equal((await request("/api/admin/test")).status, 403);
}, { mountRoutes: adminRoute }));

test("an admin session reaches admin routes until the account is demoted or banned", async () => fixture(async ({ request, repository }) => {
  const user = await seed(repository, "admin");
  await request("/api/auth/csrf");
  assert.equal((await request("/api/auth/login", post({ email: user.email, password }))).status, 200);
  assert.equal((await request("/api/admin/test")).status, 200);
  user.role = "user";
  assert.equal((await request("/api/admin/test")).status, 403);
  user.role = "admin";
  user.status = "banned";
  assert.equal((await request("/api/admin/test")).status, 401);
}, { mountRoutes: adminRoute }));

test("banned accounts cannot sign in", async () => fixture(async ({ request, repository }) => {
  const user = await seed(repository);
  user.status = "banned";
  await request("/api/auth/csrf");
  assert.equal((await request("/api/auth/login", post({ email: user.email, password }))).status, 401);
}));

const hits = [];
const openRoute = (app) => app.all("/api/new-posts", (req, res) => {
  hits.push(req.method);
  res.json({ ok: true });
});

test("new POST, PUT, PATCH, and DELETE routes get CSRF protection automatically", async () => fixture(async ({ request, browser }) => {
  hits.length = 0;
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal((await request("/api/new-posts", { method, body: {} })).status, 403);
  }
  assert.equal(hits.length, 0);
  const bootstrap = await request("/api/auth/csrf");
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal((await request("/api/new-posts", { method, body: {} })).status, 200);
  }
  assert.equal((await request("/API/NEW-POSTS", post({}, { token: "a".repeat(64) }))).status, 403);
  assert.equal((await request("/api/new-posts", post({}, { headers: { Origin: "https://attacker.example" } }))).status, 403);
  const other = browser();
  await other("/api/auth/csrf");
  assert.equal((await other("/api/new-posts", post({}, { token: bootstrap.data.csrfToken }))).status, 403);
  assert.equal(hits.length, 4);
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    assert.ok([200, 204].includes((await request("/api/new-posts", { method, token: false })).status));
  }
}, { mountRoutes: openRoute }));

test("logging in replaces the CSRF token for every API route", async () => fixture(async ({ request, repository }) => {
  await seed(repository);
  const before = await request("/api/auth/csrf");
  const login = await request("/api/auth/login", post({ email: account.email, password }));
  assert.equal(login.status, 200);
  assert.notEqual(before.data.csrfToken, login.data.csrfToken);
  assert.equal((await request("/api/new-posts", post({}, { token: before.data.csrfToken }))).status, 403);
  assert.equal((await request("/api/new-posts", post({}))).status, 200);
}, { mountRoutes: openRoute }));

test("production refuses weak secrets and insecure origins", () => {
  const store = new session.MemoryStore();
  assert.throws(() => createAuth({ store, production: true, secret: "short", clientOrigin: "https://app.example" }));
  assert.throws(() => createAuth({ store, production: true, secret: undefined, clientOrigin: "https://app.example" }));
  assert.throws(() => createAuth({ store, production: true, secret, clientOrigin: "http://app.example" }));
  assert.throws(() => createAuth({ store, production: false, secret, sameSite: "none" }));
  const auth = createAuth({ store, production: true, secret, clientOrigin: "https://app.example" });
  assert.equal(auth.cookieOptions.name, "__Host-app.sid");
  assert.equal(auth.cookieOptions.secure, true);
  assert.equal(auth.cookieOptions.httpOnly, true);
  assert.equal(auth.cookieOptions.sameSite, "strict");
  assert.equal(auth.cookieOptions.path, "/");
  assert.equal(auth.cookieOptions.domain, undefined);
});

for (const trustProxy of [false, 1]) {
  test(`a secure cookie needs real or trusted HTTPS (proxy trust ${trustProxy})`, async () => {
    const auth = createAuth({ store: new session.MemoryStore(), secret, production: true, clientOrigin: "https://app.example" });
    const { base, close } = await listen(createApp({ auth, trustProxy, clientOrigin: "https://app.example", checkDatabase: async () => true }));
    try {
      const response = await fetch(`${base}/api/auth/csrf`, { headers: { "X-Forwarded-Proto": "https" } });
      assert.equal(response.status, 200);
      const cookie = response.headers.get("set-cookie");
      if (!trustProxy) assert.equal(cookie, null);
      else {
        assert.match(cookie, /^__Host-app\.sid=/);
        assert.match(cookie, /; Secure/i);
        assert.match(cookie, /; HttpOnly/i);
        assert.match(cookie, /SameSite=Strict/i);
        assert.doesNotMatch(cookie, /Domain=/i);
      }
    } finally {
      await close();
    }
  });
}
