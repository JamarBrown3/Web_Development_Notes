import express from "express";
import ItemsController from "../controllers/items.js";

export default function itemRoutes(auth) {
  const router = express.Router();

  // Every route here needs a signed-in account. Move this line below a route
  // to leave that route public, or use auth.requireAdmin for admins only.
  router.use(auth.requireAuth);

  router.get("/", ItemsController.getItems);
  router.get("/:id", ItemsController.getItemById);
  router.post("/", ItemsController.createItem);
  router.patch("/:id", ItemsController.updateItem);
  router.delete("/:id", ItemsController.deleteItem);

  return router;
}
