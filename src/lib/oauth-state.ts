import { createHmac, timingSafeEqual } from "node:crypto";

interface OAuthState {
  userId: string;
  expiresAt: number;
  nonce: string;
}

function secret() {
  const value = process.env.OAUTH_STATE_SECRET;
  if (!value) throw new Error("OAUTH_STATE_SECRET is not configured");
  return value;
}

export function createOAuthState(payload: OAuthState) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyOAuthState(value: string): OAuthState | null {
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;
  const expected = createHmac("sha256", secret()).update(encoded).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OAuthState;
  if (payload.expiresAt < Date.now()) return null;
  return payload;
}
