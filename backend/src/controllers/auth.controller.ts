import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/pool";
import { decryptEmail, encryptEmail, hashEmail, normalizeEmail } from "../services/crypto.service";
import { UserRole, signToken } from "../services/jwt.service";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: z.enum(["admin", "sub-admin", "provider"]).default("provider")
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128)
});

export const register = async (req: Request, res: Response): Promise<void> => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
    return;
  }

  const { email, password, role } = parsed.data;
  const emailHash = hashEmail(email);
  const existing = await db.query("SELECT id FROM users WHERE email_hash = $1", [emailHash]);

  if (existing.rowCount) {
    res.status(409).json({ message: "Email already in use" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const encryptedEmail = encryptEmail(email);

  const result = await db.query(
    `INSERT INTO users (email_encrypted, email_hash, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, role, created_at`,
    [encryptedEmail, emailHash, passwordHash, role]
  );

  const user = result.rows[0] as { id: string; role: UserRole; created_at: string };
  const token = signToken({ sub: user.id, role: user.role });

  res.status(201).json({
    token,
    user: {
      id: user.id,
      email: normalizeEmail(email),
      role: user.role,
      createdAt: user.created_at
    }
  });
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
    return;
  }

  const { email, password } = parsed.data;
  const emailHash = hashEmail(email);

  const result = await db.query(
    "SELECT id, email_encrypted, password_hash, role FROM users WHERE email_hash = $1",
    [emailHash]
  );

  if (!result.rowCount) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  const user = result.rows[0] as {
    id: string;
    email_encrypted: string;
    password_hash: string;
    role: UserRole;
  };

  const isPasswordValid = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordValid) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  const token = signToken({ sub: user.id, role: user.role });

  res.json({
    token,
    user: {
      id: user.id,
      email: decryptEmail(user.email_encrypted),
      role: user.role
    }
  });
};
