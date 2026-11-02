import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  hashNewPassword,
  needsRehash,
  verifyPassword,
  PASSWORD_WORK_LIMITS,
} from "../security/passwords.js";
import { password } from "./helpers.js";

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

test("new hashes are salted Argon2id with the expected costs", async () => {
  const first = await hashNewPassword(password);
  const second = await hashNewPassword(password);
  assert.notEqual(first, second);
  assert.match(first, /^\$argon2id\$v=19\$/);
  for (const part of ["m=19456", "t=2", "p=1"]) assert.ok(first.includes(part), part);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword(`${password}!`, first), false);
  assert.equal(await verifyPassword(password, undefined), false);
});

test("an unknown account does the same Argon2 work as a real one", async () => {
  const hash = await hashNewPassword(password);
  await verifyPassword("warm up", undefined);
  const known = [];
  const unknown = [];
  for (let round = 0; round < 15; round += 1) {
    let start = performance.now();
    await verifyPassword("wrong guess", hash);
    known.push(performance.now() - start);
    start = performance.now();
    await verifyPassword("wrong guess", undefined);
    unknown.push(performance.now() - start);
  }
  const ratio = median(known) / median(unknown);
  assert.ok(ratio > 0.5 && ratio < 2, `known/unknown timing ratio ${ratio.toFixed(2)}`);
});

test("non-text passwords and malformed stored hashes are refused", async () => {
  for (const bad of [undefined, null, 123, ["x"], { $ne: null }]) {
    assert.equal(await verifyPassword(bad, "x"), false);
  }
  for (const stored of [null, "", "plain-text-password", "$argon2id$v=19$m=999999,t=99,p=9$AAAA$BBBB", "$2b$10$bcrypt-style"]) {
    assert.equal(await verifyPassword(password, stored), false);
  }
});

test("older hashes are flagged for an upgrade", async () => {
  assert.equal(needsRehash(await hashNewPassword(password)), false);
  assert.equal(needsRehash("$argon2id$v=19$m=4096,t=3,p=1$c29tZXNhbHRzb21lc2FsdA$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g"), true);
  assert.equal(needsRehash("not a hash"), true);
});

test("8 simultaneous password checks all succeed", async () => {
  const hash = await hashNewPassword(password);
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => verifyPassword(password, hash)));
  assert.deepEqual(results.map((result) => result.status === "fulfilled" && result.value), Array(8).fill(true));
});

test("a flood beyond the waiting line gets a 503 and later work still succeeds", async () => {
  const { MAX_CONCURRENT_HASHES, MAX_WAITING_HASHES } = PASSWORD_WORK_LIMITS;
  const total = MAX_CONCURRENT_HASHES + MAX_WAITING_HASHES + 24;
  const results = await Promise.allSettled(Array.from({ length: total }, () => verifyPassword("guess", undefined)));
  const refused = results.filter((result) => result.status === "rejected");
  assert.equal(refused.length, 24);
  assert.ok(refused.every((result) => result.reason.status === 503));
  assert.equal(await verifyPassword("guess", undefined), false);
});
