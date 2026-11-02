// Helpers that keep one account from reading or changing another account's records.
//
// The most common way people reach someone else's data is by changing an ID in
// a URL, for example /api/items/<someone-else's-id>. This is called an
// IDOR (insecure direct object reference). These helpers make the safe pattern
// the easy pattern for the routes and controllers you write later:
//
//   const id = readObjectId(req.params.id);
//   const item = await findOwned(Item, { id, ownerId: req.authUser._id });
//   if (!item) throw notFound();
//
// The owner condition is part of the database query itself, so a record
// belonging to someone else is never loaded. Both "doesn't exist" and
// "belongs to someone else" return the same 404, so an attacker cannot even
// tell which IDs exist.

import { HttpError } from "./input.js";

export function notFound() {
  return new HttpError(404, "Not found.");
}

// Accept only a 24-character hexadecimal MongoDB ID string from the URL.
// Anything else (objects, arrays, operators, other formats) is a 404.
export function readObjectId(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{24}$/i.test(value)) {
    throw notFound();
  }
  return value.toLowerCase();
}

// Load a document ONLY if it belongs to ownerId. Returns null otherwise.
export async function findOwned(
  Model,
  { id, ownerId, ownerField = "ownerId", select } = {},
) {
  if (!ownerId) throw new Error("findOwned requires the signed-in owner's ID.");
  const query = Model.findOne({ _id: readObjectId(String(id)), [ownerField]: ownerId });
  if (select) query.select(select);
  return query;
}

// For records already loaded some other way: throw 404 unless owned.
export function assertOwner(document, ownerId, ownerField = "ownerId") {
  if (!document || String(document[ownerField]) !== String(ownerId)) {
    throw notFound();
  }
  return document;
}
