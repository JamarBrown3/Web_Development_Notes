import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSafeObject,
  isReservedUsername,
  parseItem,
  parseLogin,
  parseRegistration,
  parseReset,
  readEmail,
} from "../security/input.js";
import { assertApplicationRoles } from "../security/databaseAccess.js";
import { getTrustProxy } from "../config/env.js";
import { password } from "./helpers.js";

const registration = (username, email = "fixture@example.invalid") =>
  parseRegistration({ username, email, password });

for (const value of [{ $ne: null }, { $gt: "" }, { $regex: ".*" }, ["someone@example.invalid"], null, 123, true, undefined]) {
  test(`login rejects non-text email ${JSON.stringify(value)}`, () => {
    assert.throws(() => parseLogin({ email: value, password }), { status: 400 });
  });
  test(`login rejects non-text password ${JSON.stringify(value)}`, () => {
    assert.throws(() => parseLogin({ email: "fixture@example.invalid", password: value }), { status: 400 });
  });
}

test("login accepts only email and password", () => {
  assert.throws(() => parseLogin({ email: "a@b.co", password: "p", extra: "x" }), { status: 400 });
});

for (const field of ["role", "status", "sessionVersion", "passwordHash", "_id", "isAdmin"]) {
  test(`registration rejects client-controlled ${field}`, () => {
    assert.throws(() => parseRegistration({ username: "fixture", email: "fixture@example.invalid", password, [field]: "admin" }), { status: 400 });
  });
}

for (const value of ["1234", "a".repeat(63), "a".repeat(65), "A".repeat(64), { $ne: null }, ["a".repeat(64)], undefined]) {
  test(`reset rejects invalid token ${JSON.stringify(value)}`, () => {
    assert.throws(() => parseReset({ token: value, newPassword: password }), { status: 400 });
  });
}

for (const key of ["$ne", "$where", "$function", "user.role", "__proto__", "constructor", "prototype"]) {
  test(`JSON guard rejects nested key ${key}`, () => {
    assert.throws(() => assertSafeObject(JSON.parse(`{"profile":{"${key}":true}}`)), { status: 400 });
  });
}

test("short passwords cannot be registered", () => {
  assert.throws(() => parseRegistration({ username: "fixture", email: "fixture@example.invalid", password: "short" }), { status: 400 });
});

test("password spaces are preserved, not silently trimmed", () => {
  assert.equal(parseRegistration({ username: " fixture ", email: " FIXTURE@EXAMPLE.INVALID ", password: ` ${password} ` }).password, ` ${password} `);
});

test("ordinary usernames are accepted", () => {
  for (const name of ["Sam", "sam_99", "gamer.one", "a-b", "Player2026"]) {
    assert.equal(registration(name).username, name);
  }
});

for (const name of ["Sаm" /* Cyrillic а */, "s am", "_sam", "sam_", "..", "sam​", "sâm", "<b>sam</b>", "sa$m"]) {
  test(`look-alike or unsafe username ${JSON.stringify(name)} is rejected`, () => {
    assert.throws(() => registration(name), { status: 400 });
  });
}

for (const name of ["admin", "Admin", "ADMINISTRATOR", "Ad_Min", "r.o.o.t", "support", "Moderator"]) {
  test(`staff-like username ${name} is not available`, () => {
    assert.throws(() => registration(name), { status: 409, message: "That username is not available." });
  });
}

test("RESERVED_USERNAMES adds your own names", () => {
  assert.equal(isReservedUsername("Sam", "sam,other"), true);
  assert.equal(isReservedUsername("S_A_M", "sam"), true);
  assert.equal(isReservedUsername("Samuel", "sam"), false);
});

for (const email of ["a​b@example.com", "a@exa\u0000mple.com", "a b@example.com", "a@example.com\r\nBcc: x@y.z", "a@b", "@example.com"]) {
  test(`unsafe email ${JSON.stringify(email)} is rejected`, () => {
    assert.throws(() => readEmail(email), { status: 400 });
  });
}

test("normal emails are trimmed and lower-cased", () => {
  assert.equal(readEmail("  Sam.Lee+tag@Example.COM "), "sam.lee+tag@example.com");
});

test("items accept only the allowed fields", () => {
  assert.deepEqual(parseItem({ title: " A " }), { title: "A", description: "" });
  assert.throws(() => parseItem({ title: "A", ownerId: "someone-else" }), { status: 400 });
  assert.throws(() => parseItem({ title: "" }), { status: 400 });
  assert.throws(() => parseItem({ title: "x".repeat(256) }), { status: 400 });
});

for (const roles of [
  [],
  [{ role: "atlasAdmin", db: "admin" }],
  [{ role: "root", db: "admin" }],
  [{ role: "readWriteAnyDatabase", db: "admin" }],
  [{ role: "readWrite", db: "another-database" }],
  [{ role: "readWrite", db: "app" }, { role: "atlasAdmin", db: "admin" }],
]) {
  test(`database login is refused with roles ${JSON.stringify(roles)}`, () => {
    assert.throws(() => assertApplicationRoles({ authenticatedUserRoles: roles }, "app"), { code: "EXCESS_DATABASE_PRIVILEGES" });
  });
}

test("database login is accepted with readWrite on this database only", () => {
  assert.doesNotThrow(() => assertApplicationRoles({ authenticatedUserRoles: [{ role: "readWrite", db: "app" }] }, "app"));
});

test("TRUST_PROXY_HOPS is validated and required in production", () => {
  assert.equal(getTrustProxy({}), false);
  assert.throws(() => getTrustProxy({ NODE_ENV: "production" }), /TRUST_PROXY_HOPS/);
  assert.equal(getTrustProxy({ NODE_ENV: "production", TRUST_PROXY_HOPS: "1" }), 1);
  assert.equal(getTrustProxy({ NODE_ENV: "production", TRUST_PROXY_HOPS: "0" }), false);
  for (const bad of ["4", "-1", "1.5", "one", "true"]) {
    assert.throws(() => getTrustProxy({ TRUST_PROXY_HOPS: bad }));
  }
});
