import { pool } from "./database.js";
import itemData from "../data/items.js";

const createTableQuery = `
  DROP TABLE IF EXISTS items;

  CREATE TABLE items (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const insertQuery = `
  INSERT INTO items (title, description, image)
  VALUES ($1, $2, $3);
`;

try {
  await pool.query(createTableQuery);

  for (const item of itemData) {
    await pool.query(insertQuery, [item.title, item.description, item.image]);
  }

  console.log(`🎉 Finished! Saved ${itemData.length} items.`);
} catch (error) {
  console.error("⚠️ Reset failed:", error.code || error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
