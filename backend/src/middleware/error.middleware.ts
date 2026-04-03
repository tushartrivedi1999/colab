import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { logger } from "../utils/logger";

type RequestWithId = Request & { requestId?: string };

export const errorHandler = (error: Error, req: RequestWithId, res: Response, _next: NextFunction): void => {
  logger.error("unhandled_error", {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    error: error.message,
    stack: env.NODE_ENV === "production" ? undefined : error.stack
  });

  res.status(500).json({
    message: "Internal server error",
    requestId: req.requestId
  });
};
