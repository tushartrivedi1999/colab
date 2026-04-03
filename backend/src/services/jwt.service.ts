import jwt from "jsonwebtoken";
import { env } from "../config/env";

export type UserRole = "admin" | "sub-admin" | "provider";

type JwtPayload = {
  sub: string;
  role: UserRole;
};

export const signToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
};

export const verifyToken = (token: string): JwtPayload => {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
};
