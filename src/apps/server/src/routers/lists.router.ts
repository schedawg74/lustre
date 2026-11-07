import { listsQuerySchema } from "@lustre/api/v1";
import { type RequestHandler, Router } from "express";
import type { Services } from "../services";

export const createListsRouter = (
  services: Services,
  guards: RequestHandler[]
) =>
  Router().get("/lists", ...guards, (req, res) => {
    res.json(services.lists.list(listsQuerySchema.parse(req.query)));
  });
