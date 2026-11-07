import { blocklistQuerySchema } from "@lustre/api/v1";
import { type RequestHandler, Router } from "express";
import type { Services } from "../services";

// Open to every valid install token for now. Payment gating comes later.
export const createBlocklistRouter = (
  services: Services,
  guards: RequestHandler[]
) =>
  Router().get("/blocklist", ...guards, (req, res) => {
    res.json(services.blocklist.list(blocklistQuerySchema.parse(req.query)));
  });
