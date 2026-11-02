import itemData from "../data/items.js";
import { HttpError } from "../utils/HttpError.js";

// Work on a copy of the array from the data folder.
let items = [...itemData];
let nextId = Math.max(0, ...items.map((item) => item.id)) + 1;

// Only copy the fields you expect. Never save the whole req.body.
const pickFields = (body) => {
  if (typeof body?.title !== "string" || !body.title.trim()) {
    throw new HttpError(400, "Title is required.");
  }

  if (body.title.trim().length > 255) {
    throw new HttpError(400, "Title must be 255 characters or fewer.");
  }

  return {
    title: body.title.trim(),
    description: String(body.description ?? ""),
    image: String(body.image ?? ""),
  };
};

// req.params.id is always text, so turn it into a number before comparing.
const findItem = (id) => {
  const item = items.find((other) => other.id === Number(id));

  if (!item) throw new HttpError(404, "Item not found.");
  return item;
};

const getItems = (req, res) => {
  res.status(200).json(items);
};

const getItemById = (req, res) => {
  res.status(200).json(findItem(req.params.id));
};

const createItem = (req, res) => {
  const item = { id: nextId, ...pickFields(req.body) };

  nextId += 1;
  items.push(item);
  res.status(201).json(item);
};

const updateItem = (req, res) => {
  const item = findItem(req.params.id);

  // PATCH keeps any field the request left out.
  Object.assign(item, pickFields({ ...item, ...req.body }));
  res.status(200).json(item);
};

const deleteItem = (req, res) => {
  const item = findItem(req.params.id);

  items = items.filter((other) => other.id !== item.id);
  res.status(200).json(item);
};

export default { getItems, getItemById, createItem, updateItem, deleteItem };
