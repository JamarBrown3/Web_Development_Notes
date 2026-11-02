# Setup 2: Data Folder Only

No database and no .env. The server loads the data file when it starts. Changes made through the API are gone when the server restarts.

## Start a new project

Run these from the folder that holds your projects. Change `my-project` to your project name.

```bash
mkdir my-project
cp -R ~/Documents/Web_Development_Notes/starters/setup-2-data-folder-only my-project/server
cd my-project/server
npm install
npm run dev
```

In a second terminal:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/items
curl http://localhost:3000/api/items/1
```

## Make it yours

- YOUR DATA GOES IN `data/items.js`. Every record needs its own id.
- If you change the fields, also change `pickFields` in `controllers/items.js`.
- If people only view the data, such as a menu, use the reading only routes and controller from Setup 2 on the Node page.
- If you rename a file, change every import that points at it.
