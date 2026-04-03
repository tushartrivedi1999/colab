import { Response } from "express";
import { db } from "../db/pool";
import { AuthedRequest } from "../middleware/auth.middleware";
import { decryptEmail } from "../services/crypto.service";

export const getProfile = async (req: AuthedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;

  const result = await db.query(
    "SELECT id, email_encrypted, role, created_at FROM users WHERE id = $1",
    [userId]
  );

  if (!result.rowCount) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  const user = result.rows[0] as {
    id: string;
    email_encrypted: string;
    role: string;
    created_at: string;
  };

  res.json({
    profile: {
      id: user.id,
      email: decryptEmail(user.email_encrypted),
      role: user.role,
      createdAt: user.created_at
    }
  });
};
