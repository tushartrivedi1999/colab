import crypto from "crypto";
import { env } from "../config/env";

const AES_ALGO = "aes-256-gcm";
const KEY = Buffer.from(env.EMAIL_ENCRYPTION_KEY, "hex");

if (KEY.length !== 32) {
  throw new Error("EMAIL_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const hashEmail = (email: string): string => {
  return crypto.createHash("sha256").update(normalizeEmail(email)).digest("hex");
};

export const encryptEmail = (email: string): string => {
  const normalized = normalizeEmail(email);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(AES_ALGO, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
};

export const decryptEmail = (payload: string): string => {
  const [ivHex, tagHex, encryptedHex] = payload.split(":");
  if (!ivHex || !tagHex || !encryptedHex) {
    throw new Error("Invalid encrypted email payload format");
  }

  const decipher = crypto.createDecipheriv(AES_ALGO, KEY, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));

  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
};
