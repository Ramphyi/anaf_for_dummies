import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

function key() {
  const secret = process.env.AUTH_SECRET || "dev-only-insecure-secret-change-me-please-0123456789";
  return createHash("sha256").update(`afd-secrets:${secret}`).digest();
}

/** Criptează un secret (token ANAF, parolă SMTP) cu AES-256-GCM înainte de salvare în DB. */
export function encryptSecret(plain: string | null | undefined): string | null {
  if (!plain) return null;
  if (plain.startsWith(PREFIX)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${data.toString("base64")}`;
}

/** Decriptează; valorile vechi salvate în clar sunt returnate neschimbate. */
export function decryptSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith(PREFIX)) return value;
  try {
    const [iv, tag, data] = value.slice(PREFIX.length).split(":");
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null; // cheia s-a schimbat (AUTH_SECRET nou) → secretul trebuie reintrodus
  }
}
