import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

function key() {
  let source = process.env.DATA_ENCRYPTION_KEY;
  if (!source) {
    const dataDir = ".data";
    const keyPath = ".data/encryption.key";
    mkdirSync(/*turbopackIgnore: true*/ dataDir, { recursive: true, mode: 0o700 });
    if (!existsSync(/*turbopackIgnore: true*/ keyPath)) {
      writeFileSync(
        /*turbopackIgnore: true*/ keyPath,
        randomBytes(32).toString("base64url"),
        { mode: 0o600 },
      );
    }
    source = readFileSync(/*turbopackIgnore: true*/ keyPath, "utf8").trim();
  }
  return createHash("sha256").update(source).digest();
}

export function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decrypt(value: string) {
  const [ivPart, tagPart, encryptedPart] = value.split(".");
  if (!ivPart || !tagPart || !encryptedPart) throw new Error("Invalid encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
import "server-only";
