import Item from "../models/Item.js";
import { findOwned, notFound } from "../security/access.js";
import { parseItem } from "../security/input.js";

// Every query includes the signed-in owner, so one account can never read or
// change another account's records by changing an ID in the URL.
const findMine = async (req) => {
  const item = await findOwned(Item, { id: req.params.id, ownerId: req.authUser._id });

  if (!item) throw notFound();
  return item;
};

const getItems = async (req, res) => {
  const items = await Item.find({ ownerId: req.authUser._id }).sort({ createdAt: 1 });

  res.status(200).json(items);
};

const getItemById = async (req, res) => {
  res.status(200).json(await findMine(req));
};

const createItem = async (req, res) => {
  const item = await Item.create({ ...parseItem(req.body), ownerId: req.authUser._id });

  res.status(201).json(item);
};

const updateItem = async (req, res) => {
  const item = await findMine(req);

  // PATCH keeps any field the request left out.
  const { title, description } = item;
  Object.assign(item, parseItem({ title, description, ...req.body }));
  await item.save();
  res.status(200).json(item);
};

const deleteItem = async (req, res) => {
  const item = await findMine(req);

  await item.deleteOne();
  res.status(200).json(item);
};

export default { getItems, getItemById, createItem, updateItem, deleteItem };
