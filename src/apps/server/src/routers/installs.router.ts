import type { CreateInstallResponse } from "@lustre/api/v1";
import { Router } from "express";
import { limitInstallsPerIp } from "../middleware/rate-limit";
import type { Services } from "../services";

export const createInstallsRouter = (
  services: Services,
  installsPerIp: number
) =>
  Router().post("/installs", limitInstallsPerIp(installsPerIp), (_req, res) => {
    const body: CreateInstallResponse = services.installs.create();
    res.status(201).json(body);
  });
