alter table public.profiles
  add column if not exists display_name text,
  add column if not exists settings jsonb not null default '{
    "timezone": "America/Los_Angeles",
    "reducedMotion": false,
    "digestEnabled": true,
    "digestHour": 7,
    "analysisEnabled": true
  }'::jsonb;

create table if not exists public.trusted_contact_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  encrypted_destination text not null,
  destination_type text not null check (destination_type in ('email', 'sms')),
  code_hash text not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.workload_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  connection_id uuid references public.connections(id) on delete cascade,
  external_id text not null,
  title text not null,
  source text not null,
  course text,
  due_at timestamptz not null,
  status text not null check (status in ('upcoming', 'submitted', 'overdue')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);

alter table public.trusted_contact_verifications enable row level security;
alter table public.workload_items enable row level security;

create policy "trusted contact verifications are private"
  on public.trusted_contact_verifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "workload is private"
  on public.workload_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.reflection_analyses
  add column if not exists summary text not null default 'Saved without analysis.',
  add column if not exists immediate_safety_concern boolean not null default false,
  add column if not exists balances jsonb not null default '[]';

alter table public.safety_plans
  add column if not exists contact_type text not null default 'email'
  check (contact_type in ('email', 'sms'));

alter table public.workload_items
  add column if not exists points_possible numeric,
  add column if not exists grade_impact text not null default 'unknown'
  check (grade_impact in ('low', 'medium', 'high', 'unknown'));
