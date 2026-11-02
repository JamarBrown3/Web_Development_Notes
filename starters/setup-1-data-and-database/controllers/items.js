import { pool } from "../config/database.js";
import { HttpError } from "../utils/HttpError.js";

// An id has to be a whole number before it goes to the database.
const readId = (value) => {
  if (!/^\d{1,9}$/.test(value)) throw new HttpError(404, "Item not found.");
  return Number(value);
};

// Only copy the fields you expect. Never save the whole req.body.
const pickFields = (body) => {
  if (typeof body?.title !== "string" || !body.title.trim()) {
    throw new HttpError(400, "Title is required.");
  }

  if (body.title.trim().length > 255) {
    throw new HttpError(400, "Title must be 255 characters or fewer.");
  }

  return [
    body.title.trim(),
    String(body.description ?? ""),
    String(body.image ?? ""),
  ];
};

const getItems = async (req, res) => {
  const results = await pool.query("SELECT * FROM items ORDER BY id ASC");

  res.status(200).json(results.rows);
};

const getItemById = async (req, res) => {
  const results = await pool.query("SELECT * FROM items WHERE id = $1", [
    readId(req.params.id),
  ]);

  if (results.rows.length === 0) throw new HttpError(404, "Item not found.");
  res.status(200).json(results.rows[0]);
};

const createItem = async (req, res) => {
  const results = await pool.query(
    `INSERT INTO items (title, description, image)
    VALUES ($1, $2, $3)
    RETURNING *`,
    pickFields(req.body),
  );

  res.status(201).json(results.rows[0]);
};

const updateItem = async (req, res) => {
  const id = readId(req.params.id);
  const found = await pool.query("SELECT * FROM items WHERE id = $1", [id]);

  if (found.rows.length === 0) throw new HttpError(404, "Item not found.");

  // PATCH keeps any field the request left out.
  const results = await pool.query(
    `UPDATE items SET title = $1, description = $2, image = $3
    WHERE id = $4
    RETURNING *`,
    [...pickFields({ ...found.rows[0], ...req.body }), id],
  );

  if (results.rows.length === 0) throw new HttpError(404, "Item not found.");
  res.status(200).json(results.rows[0]);
};

const deleteItem = async (req, res) => {
  const results = await pool.query(
    "DELETE FROM items WHERE id = $1 RETURNING *",
    [readId(req.params.id)],
  );

  if (results.rows.length === 0) throw new HttpError(404, "Item not found.");
  res.status(200).json(results.rows[0]);
};

export default { getItems, getItemById, createItem, updateItem, deleteItem };
