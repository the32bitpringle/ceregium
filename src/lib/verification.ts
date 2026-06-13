import { createHash, randomInt } from "node:crypto";

export function createVerificationCode() {
  return String(randomInt(100000, 1000000));
}

export function hashVerificationCode(code: string) {
  return createHash("sha256")
    .update(`${process.env.OAUTH_STATE_SECRET ?? "development"}:${code}`)
    .digest("hex");
}

export function destinationType(destination: string) {
  return destination.includes("@") ? "email" : "sms";
}
