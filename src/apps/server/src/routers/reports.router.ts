import { reportBatchSchema } from "@lustre/api/v1";
import { type RequestHandler, Router } from "express";
import { installIdOf } from "../middleware/auth";
import type { Services } from "../services";

export const createReportsRouter = (
  services: Services,
  guards: RequestHandler[]
) =>
  Router().post("/reports", ...guards, (req, res) => {
    const { reports } = reportBatchSchema.parse(req.body);
    res.json(services.reports.record(installIdOf(res), reports));
  });
