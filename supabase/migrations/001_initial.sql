create extension if not exists "pgcrypto";

create type public.signal_status as enum ('steady', 'watch', 'elevated', 'critical');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  date_of_birth date not null,
  timezone text not null default 'America/Los_Angeles',
  created_at timestamptz not null default now()
);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  granted boolean not null,
  policy_version text not null,
  created_at timestamptz not null default now()
);

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  encrypted_tokens text not null,
  scopes text[] not null default '{}',
  sync_cursor text,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  unique (user_id, provider)
);

create table public.normalized_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  connection_id uuid not null references public.connections(id) on delete cascade,
  external_id text not null,
  category text not null,
  occurred_at timestamptz not null,
  sensitivity text not null check (sensitivity in ('metadata', 'content')),
  consent_scope text not null,
  features jsonb not null default '{}',
  encrypted_content text,
  expires_at timestamptz,
  unique (connection_id, external_id)
);

create table public.daily_reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_date date not null,
  encrypted_text text not null,
  energy smallint not null check (energy between 1 and 5),
  stress smallint not null check (stress between 1 and 5),
  sleep smallint not null check (sleep between 1 and 5),
  workload smallint not null check (workload between 1 and 5),
  analysis_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);

create table public.reflection_analyses (
  id uuid primary key default gen_random_uuid(),
  reflection_id uuid not null unique references public.daily_reflections(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.signal_status not null,
  score smallint not null check (score between 0 and 100),
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  themes jsonb not null default '[]',
  protective_factors jsonb not null default '[]',
  model_versions jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.signal_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.signal_status not null,
  score smallint not null check (score between 0 and 100),
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  contributors jsonb not null default '[]',
  model_versions jsonb not null default '{}',
  generated_at timestamptz not null default now()
);

create table public.safety_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  encrypted_contact text not null,
  verified_at timestamptz,
  active boolean not null default false,
  consent_version text not null,
  cooldown_hours integer not null default 24,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.consents enable row level security;
alter table public.connections enable row level security;
alter table public.normalized_events enable row level security;
alter table public.daily_reflections enable row level security;
alter table public.reflection_analyses enable row level security;
alter table public.signal_results enable row level security;
alter table public.safety_plans enable row level security;

create policy "profiles are private" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "consents are private" on public.consents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "connections are private" on public.connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "events are private" on public.normalized_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "reflections are private" on public.daily_reflections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "reflection analyses are private" on public.reflection_analyses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "signals are private" on public.signal_results
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "safety plans are private" on public.safety_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
