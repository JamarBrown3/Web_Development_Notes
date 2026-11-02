# Login Starter: Argon2, Sessions, And MongoDB

A secure email and password login for an Express API. It has no real accounts, keys, or two-step sign-in in it, so every project starts clean.

## What you get

- Register, log in, log out, and a "who am I" route
- Passwords hashed with Argon2id
- Sessions stored in MongoDB, with HttpOnly cookies
- CSRF protection on every POST, PUT, PATCH, and DELETE
- Rate limits per IP address and per account
- Password reset, which stays off until you add an email sender
- Admin accounts that can only be created from your own computer
- An example `items` feature showing how to protect your own routes

## What you need

- Node 22 or newer
- A MongoDB Atlas database. Password reset uses a transaction, which a plain local MongoDB does not support.
- A database login with **only readWrite on this one database**. The server refuses to start with an admin login, and that is on purpose.

## Start a new project

Run these from the folder that holds your projects. Change `my-project` to your project name.

```bash
mkdir my-project
cp -R ~/Documents/Web_Development_Notes/starters/login-argon2-mongodb my-project/server
cd my-project/server
npm install
cp .env.example .env
```

Put your `MONGODB_URI` and `MONGODB_DB_NAME` in `.env`. Then make a secret for `SESSION_SECRET`:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Then start it:

```bash
npm run dev
```

In a second terminal:

```bash
curl http://localhost:3000/api/health/database
bash scripts/try-login.sh
```

## Make your admin account

Do this before the site is public. Replace the email and name with yours.

```bash
npm run admin:create -- --email you@example.com --username YourName
```

## Add your own feature

Everything marked `YOUR ... GOES HERE` is a place to edit.

1. Copy `models/Item.js` and change the fields.
2. Add a `parse` function for those fields in `security/input.js`.
3. Copy `controllers/items.js` and `routes/items.js`.
4. Add one `app.use` line under `YOUR ROUTES GO HERE` in `server.js`.

If you do not need items, delete those files and that line.

| You want | Do this |
|---|---|
| Any signed-in account | Keep `router.use(auth.requireAuth)` |
| Admins only | Use `auth.requireAdmin` |
| Only the owner's records | Use `findOwned` from `security/access.js` |

Every new model needs `import "../config/mongooseSecurity.js";` at the top.

## Connect React

Use the Vite proxy from the React page in your notes. `CLIENT_ORIGIN` must match your frontend.

```js
const options = { credentials: "include" };

// 1. Get a token before any POST.
const { csrfToken } = await (await fetch("/api/auth/csrf", options)).json();

// 2. Send it with the request.
const response = await fetch("/api/auth/login", {
  ...options,
  method: "POST",
  headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
  body: JSON.stringify({ email, password }),
});

// 3. Login returns a NEW token. Use that one from now on.
const { user, csrfToken: nextToken } = await response.json();
```

## Turn on password reset

In `server.js`, replace `deliverResetEmail: null` with an async function that sends the link, such as through Resend or SendGrid. Your React app needs a `/reset-password` page that reads the token from the part of the link after `#`.

## Before you go live

Set these on your host, not in a file:

- `NODE_ENV=production`
- `SESSION_SECRET` with a new value for this project
- `CLIENT_ORIGIN` with your `https://` site
- `TRUST_PROXY_HOPS=1`, or the real number of proxies
- `SESSION_SAME_SITE=none`, only if the frontend and API are on different sites

The server refuses to start in production if these are missing or unsafe.

## Tests

```bash
npm test
```

`npm test` needs no database and never reads `.env`. The database test only runs if you opt in, using a throwaway database whose name ends in `_test`. It deletes everything in that database.

```bash
TEST_MONGODB_URI="your_test_uri" TEST_MONGODB_DB="my_project_test" npm run test:database
```

## What this does not include

- **Two-step sign-in.** There is no authenticator code, so an admin login is protected by the password alone. Use a long, unique password, and add two-step sign-in before you trust this with anything valuable.
- **Email verification.** Anyone can register with an email they do not own.
- **A change password route.** People change it through password reset.

## Never copy these into a project

- `.env` from another project. Make new secrets every time.
- The `.git` folder from another project.
- The same database as another project. Each project gets its own.
