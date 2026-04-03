import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

const sanitizeValue = (input: unknown): unknown => {
  if (typeof input === "string") {
    return input
      .replace(/[<>]/g, "")
      .replace(/javascript:/gi, "")
      .replace(/on\w+=/gi, "")
      .trim();
  }

  if (Array.isArray(input)) {
    return input.map(sanitizeValue);
  }

  if (input && typeof input === "object") {
    return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, sanitizeValue(value)]));
  }

  return input;
};

const shouldBypassHttpsCheck = (req: Request): boolean => {
  return req.path.includes("/health") || req.path.startsWith("/.well-known");
};

export const enforceHttps = (req: Request, res: Response, next: NextFunction): void => {
  if (!env.FORCE_HTTPS || shouldBypassHttpsCheck(req)) {
    next();
    return;
  }

  const forwardedProto = req.headers["x-forwarded-proto"];
  const isSecure = req.secure || forwardedProto === "https";

  if (!isSecure) {
    res.status(426).json({ message: "HTTPS is required" });
    return;
  }

  next();
};

export const sanitizeRequestInput = (req: Request, _res: Response, next: NextFunction): void => {
  req.body = sanitizeValue(req.body);
  req.query = sanitizeValue(req.query) as Request["query"];
  req.params = sanitizeValue(req.params) as Request["params"];
  next();
};
