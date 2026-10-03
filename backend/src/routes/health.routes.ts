import { Router, Request, Response } from "express";

const router = Router();

router.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    service: "gruas-cares-backend",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export default router;
