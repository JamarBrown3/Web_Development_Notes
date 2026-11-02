# Setup 1: Data Folder And A Database

The data folder fills the database once with `npm run reset`, then the database is the real copy.

## Start a new project

Run these from the folder that holds your projects. Change `my-project` to your project name.

```bash
mkdir my-project
cp -R ~/Documents/Web_Development_Notes/starters/setup-1-data-and-database my-project/server
cd my-project/server
npm install
cp .env.example .env
```

Put your database login in `.env`, then:

```bash
npm run reset
npm run dev
```

In a second terminal:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/items
```

## Make it yours

- YOUR DATA GOES IN `data/items.js`, with no id. The database makes the ids.
- If you change the fields, also change `CREATE TABLE` and the insert in `config/reset.js`, plus `pickFields` and the SQL in `controllers/items.js`.
- If you rename a file, change every import that points at it.
- `npm run reset` deletes the table first. Never add it to your start script.
- The full walkthrough is in Setup 1 on the Node page.
- `config/database.js` sets `rejectUnauthorized: false` for hosted databases. It still encrypts the connection but skips checking the host's certificate, so it is fine for practice. Use your host's CA certificate for a real product.
