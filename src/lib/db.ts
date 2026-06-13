import "server-only";

import { chmodSync, existsSync, mkdirSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";

const dataDir = ".data";
const globalForDb = globalThis as unknown as { ceregiumDb?: DatabaseSync };
const databasePath = ".data/ceregium.sqlite";

function openDatabase() {
  if (globalForDb.ceregiumDb) return globalForDb.ceregiumDb;

  mkdirSync(/*turbopackIgnore: true*/ dataDir, { recursive: true, mode: 0o700 });
  chmodSync(/*turbopackIgnore: true*/ dataDir, 0o700);
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
  const database = new DatabaseSync(databasePath);
  database.exec(`
    pragma busy_timeout = 5000;
    pragma journal_mode = WAL;
    pragma foreign_keys = ON;

    create table if not exists users (
      id text primary key,
      email text not null unique collate nocase,
      password_hash text not null,
      display_name text not null,
      date_of_birth text not null,
      timezone text not null default 'America/Los_Angeles',
      settings_json text not null default '{}',
      created_at text not null
    );

    create table if not exists sessions (
      token_hash text primary key,
      user_id text not null references users(id) on delete cascade,
      expires_at text not null,
      created_at text not null
    );

    create table if not exists reflections (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      local_date text not null,
      encrypted_text text not null,
      energy integer not null,
      stress integer not null,
      sleep integer not null,
      workload integer not null,
      analysis_json text not null,
      created_at text not null,
      updated_at text not null,
      unique(user_id, local_date)
    );

    create table if not exists workload_items (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      external_id text,
      title text not null,
      source text not null,
      course text,
      due_at text not null,
      status text not null,
      points_possible real,
      grade_impact text not null default 'unknown',
      created_at text not null,
      updated_at text not null,
      unique(user_id, source, external_id)
    );

    create table if not exists browser_pairings (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      token_hash text not null unique,
      label text not null,
      last_used_at text,
      created_at text not null,
      revoked_at text
    );

    create table if not exists safety_plans (
      user_id text primary key references users(id) on delete cascade,
      encrypted_contact text not null,
      active integer not null default 0,
      updated_at text not null
    );

    create table if not exists browser_activity_daily (
      user_id text not null references users(id) on delete cascade,
      local_date text not null,
      active_minutes integer not null default 0,
      education_minutes integer not null default 0,
      productivity_minutes integer not null default 0,
      social_minutes integer not null default 0,
      entertainment_minutes integer not null default 0,
      other_minutes integer not null default 0,
      late_night_minutes integer not null default 0,
      longest_session_minutes integer not null default 0,
      tab_switches integer not null default 0,
      break_count integer not null default 0,
      updated_at text not null,
      primary key(user_id, local_date)
    );

    create table if not exists schedule_plans (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      fingerprint text not null,
      assessment_score integer not null,
      plan_json text not null,
      created_at text not null,
      unique(user_id, fingerprint)
    );

    create index if not exists reflections_user_date_idx on reflections(user_id, local_date desc);
    create index if not exists workload_user_due_idx on workload_items(user_id, due_at);
    create index if not exists sessions_expiry_idx on sessions(expires_at);
    create index if not exists activity_user_date_idx on browser_activity_daily(user_id, local_date desc);
    create index if not exists plans_user_date_idx on schedule_plans(user_id, created_at desc);
  `);

  const now = new Date();
  database.prepare("delete from sessions where expires_at<?").run(now.toISOString());
  database.prepare("delete from browser_pairings where revoked_at is not null and revoked_at<?").run(
    new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  );

  for (const file of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    if (existsSync(/*turbopackIgnore: true*/ file)) {
      chmodSync(/*turbopackIgnore: true*/ file, 0o600);
    }
  }

  globalForDb.ceregiumDb = database;
  return database;
}

export const db = new Proxy({} as DatabaseSync, {
  get(_target, property) {
    const database = openDatabase();
    const value = Reflect.get(database, property, database) as unknown;
    return typeof value === "function" ? value.bind(database) : value;
  },
});

export function jsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
