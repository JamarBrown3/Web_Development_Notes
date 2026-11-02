// Create or promote an admin from your own computer. No website route can make
// an administrator, so this script and the database login are the only way.
//
// Run inside the server folder:
//
//   npm run admin:create -- --email you@example.com --username YourName
//       Creates a new admin. Do this before the site is public, so nobody
//       else can register your email first.
//
//   npm run admin:create -- --email you@example.com --promote
//       Makes an account you already registered the admin.

import readline from "node:readline";
import {
  connectDatabase,
  disconnectDatabase,
  explainDatabaseError,
} from "../config/database.js";
import User from "../models/User.js";
import { USERNAME_PATTERN } from "../models/validators.js";
import { readEmail, readNewPassword } from "../security/input.js";
import { hashNewPassword } from "../security/passwords.js";

const interactive = Boolean(process.stdin.isTTY);
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: interactive,
});
let muted = false;
if (interactive) {
  // Hide what you type while entering a password.
  const write = rl._writeToOutput.bind(rl);
  rl._writeToOutput = (text) => {
    if (!muted || text === "\n" || text === "\r\n") write(text);
  };
}
const queued = [];
const waiting = [];
let inputClosed = false;
rl.on("line", (line) => {
  const next = waiting.shift();
  if (next) next.resolve(line);
  else queued.push(line);
});
rl.on("close", () => {
  inputClosed = true;
  while (waiting.length) waiting.shift().reject(new Error("Input ended."));
});

function ask(prompt, { hidden = false } = {}) {
  process.stdout.write(prompt);
  muted = hidden;
  return new Promise((resolve, reject) => {
    const finish = (line) => {
      muted = false;
      if (hidden && interactive) process.stdout.write("\n");
      resolve(line); // kept exactly as typed, because passwords may have spaces
    };
    if (queued.length) return finish(queued.shift());
    if (inputClosed) return reject(new Error("Input ended."));
    waiting.push({ resolve: finish, reject });
  });
}

function fail(message) {
  const error = new Error(message);
  error.safe = true;
  throw error;
}

function readArguments(argv) {
  const options = { email: null, username: null, promote: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--email") options.email = argv[++index];
    else if (argument === "--username") options.username = argv[++index];
    else if (argument === "--promote") options.promote = true;
    else fail(`Unknown option: ${argument}`);
  }
  if (!options.email) fail("Add --email you@example.com");
  if (!options.promote && !options.username) fail("Add --username YourName for a new account.");
  return options;
}

async function createAdmin(email, usernameInput) {
  const existing = await User.findOne({ email });
  if (existing) {
    fail(
      "An account with that email already exists. If it is yours, use --promote instead of --username.\n" +
        "If you did not create it, use a different email for your admin account.",
    );
  }

  const username = usernameInput.trim();
  if (username.length < 3 || username.length > 35 || !USERNAME_PATTERN.test(username)) {
    fail("Username must be 3-35 letters, numbers, _, -, or . and start and end with a letter or number.");
  }

  const password = await ask("Choose a password (15-128 characters, input is hidden): ", { hidden: true });
  readNewPassword(password);
  const again = await ask("Type the password again: ", { hidden: true });
  if (again !== password) fail("The passwords did not match. Nothing was changed.");

  await User.create({
    username,
    email,
    passwordHash: await hashNewPassword(password),
    role: "admin",
    status: "active",
    sessionVersion: 0,
  });

  console.log(`\nDone. Admin account created: ${username}.`);
}

async function promoteAdmin(email) {
  const existing = await User.findOne({ email });
  if (!existing) fail("No account uses that email. Check the spelling, or create one without --promote.");

  console.log(`Found "${existing.username}", created ${existing.createdAt?.toISOString()}, role ${existing.role}.`);
  const confirm = await ask("Type PROMOTE to make this account an admin: ");
  if (confirm.trim() !== "PROMOTE") fail("Cancelled. Nothing was changed.");

  // Raising sessionVersion signs this account out, so its next login is an admin login.
  await User.updateOne(
    { _id: existing._id },
    { $set: { role: "admin", status: "active" }, $inc: { sessionVersion: 1 } },
  );

  console.log(`\nDone. "${existing.username}" is an admin. Sign in again to use it.`);
}

async function main() {
  const options = readArguments(process.argv.slice(2));
  const email = readEmail(options.email);

  await connectDatabase();
  await User.init(); // make sure the unique indexes exist

  if (options.promote) await promoteAdmin(email);
  else await createAdmin(email, options.username);
}

try {
  await main();
} catch (error) {
  process.exitCode = 1;
  // Our own messages are safe to show. Driver errors go through
  // explainDatabaseError, so no connection string is printed.
  const message = error.safe || error.status ? error.message : explainDatabaseError(error);
  console.error(`\nAdmin setup stopped: ${message}`);
} finally {
  rl.close();
  await disconnectDatabase();
}
