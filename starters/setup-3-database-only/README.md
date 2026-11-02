# Setup 3: Database Only

There is no data folder. The table starts empty and records come in through POST requests.

## Start a new project

Run these from the folder that holds your projects. Change `my-project` to your project name.

```bash
mkdir my-project
cp -R ~/Documents/Web_Development_Notes/starters/setup-3-database-only my-project/server
cd my-project/server
npm install
cp .env.example .env
```

Put your database login in `.env`, then:

```bash
npm run setup
npm run dev
```

In a second terminal. The first GET returns `[]`, and that is correct:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/items
curl -X POST http://localhost:3000/api/items -H "Content-Type: application/json" -d '{"title":"First item"}'
curl http://localhost:3000/api/items
```

## Make it yours

- YOUR DATA COMES IN THROUGH POST REQUESTS.
- If you change the fields, also change `CREATE TABLE` in `config/createTable.js`, plus `pickFields` and the SQL in `controllers/items.js`.
- If you rename a file, change every import that points at it.
- `npm run setup` never deletes rows, so it is safe to run again.
- `config/database.js` sets `rejectUnauthorized: false` for hosted databases. It still encrypts the connection but skips checking the host's certificate, so it is fine for practice. Use your host's CA certificate for a real product.
