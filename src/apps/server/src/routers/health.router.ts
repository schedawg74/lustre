import type { HealthResponse } from "@lustre/api/v1";
import { Router } from "express";

export const createHealthRouter = () =>
  Router().get("/health", (_req, res) => {
    const body: HealthResponse = { status: "ok" };
    res.json(body);
  });
