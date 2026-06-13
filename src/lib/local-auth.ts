import "server-only";

import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

const COOKIE_NAME = "ceregium_session";
const SESSION_DAYS = 30;

export interface LocalUser {
  id: string;
  email: string;
  displayName: string;
  dateOfBirth: string;
  timezone: string;
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function passwordHash(password: string) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `${salt.toString("base64url")}.${derived.toString("base64url")}`;
}

export function passwordMatches(password: string, stored: string) {
  const [saltPart, hashPart] = stored.split(".");
  if (!saltPart || !hashPart) return false;
  const supplied = scryptSync(password, Buffer.from(saltPart, "base64url"), 64);
  const expected = Buffer.from(hashPart, "base64url");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  db.prepare(
    "insert into sessions(token_hash,user_id,expires_at,created_at) values(?,?,?,?)",
  ).run(tokenHash(token), userId, expires.toISOString(), now.toISOString());
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) db.prepare("delete from sessions where token_hash=?").run(tokenHash(token));
  store.delete(COOKIE_NAME);
}

export async function currentUser(): Promise<LocalUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const row = db.prepare(`
    select u.id,u.email,u.display_name,u.date_of_birth,u.timezone
    from sessions s join users u on u.id=s.user_id
    where s.token_hash=? and s.expires_at>?
  `).get(tokenHash(token), new Date().toISOString()) as Record<string, string> | undefined;
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    dateOfBirth: row.date_of_birth,
    timezone: row.timezone,
  };
}

export function createUser(input: {
  email: string;
  password: string;
  displayName: string;
  dateOfBirth: string;
}) {
  const id = randomUUID();
  db.prepare(`
    insert into users(id,email,password_hash,display_name,date_of_birth,created_at)
    values(?,?,?,?,?,?)
  `).run(
    id,
    input.email.trim().toLowerCase(),
    passwordHash(input.password),
    input.displayName.trim(),
    input.dateOfBirth,
    new Date().toISOString(),
  );
  return id;
}

export function userByEmail(email: string) {
  return db.prepare("select * from users where email=?").get(email.trim().toLowerCase()) as
    | Record<string, string>
    | undefined;
}
