-- Shwas Community: Society / School Groups, Daily Savings Leaderboard & Local Alerts
-- Apply manually in the Supabase SQL Editor (do not run automatically).

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) >= 2 and char_length(name) <= 80),
  join_code text not null unique check (join_code ~ '^[A-Z0-9]{6}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default 'Family' check (char_length(trim(display_name)) >= 1 and char_length(display_name) <= 60),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.daily_savings (
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  day date not null,
  cigarettes_saved double precision not null default 0 check (cigarettes_saved >= 0 and cigarettes_saved <= 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, group_id, day)
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('garbage_burning', 'construction_dust', 'vehicle_smoke', 'other')),
  message text not null check (char_length(trim(message)) >= 2 and char_length(message) <= 280),
  lat double precision,
  lon double precision,
  created_at timestamptz not null default now()
);

create index if not exists idx_group_members_user on public.group_members (user_id);
create index if not exists idx_daily_savings_group_day on public.daily_savings (group_id, day desc);
create index if not exists idx_alerts_group_created on public.alerts (group_id, created_at desc);

-- Security-definer helper to check group membership without recursive RLS loops
create or replace function public.is_group_member(target_group_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = target_group_id
      and gm.user_id = auth.uid()
  );
$$;

-- Enable Row Level Security on all community tables
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.daily_savings enable row level security;
alter table public.alerts enable row level security;

-- 1. groups: authenticated users can look up groups (to join by join_code) and read their groups;
--    users can only create groups attributed to themselves.
drop policy if exists "Authenticated users can read groups" on public.groups;
create policy "Authenticated users can read groups"
  on public.groups
  for select
  to authenticated
  using (true);

drop policy if exists "Users can create own groups" on public.groups;
create policy "Users can create own groups"
  on public.groups
  for insert
  to authenticated
  with check (created_by = auth.uid());

-- 2. group_members: members can read their group's roster; users write only their own membership row.
drop policy if exists "Members can read group members" on public.group_members;
create policy "Members can read group members"
  on public.group_members
  for select
  to authenticated
  using (public.is_group_member(group_id) or user_id = auth.uid());

drop policy if exists "Users can join groups as themselves" on public.group_members;
create policy "Users can join groups as themselves"
  on public.group_members
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update own membership" on public.group_members;
create policy "Users can update own membership"
  on public.group_members
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can leave groups" on public.group_members;
create policy "Users can leave groups"
  on public.group_members
  for delete
  to authenticated
  using (user_id = auth.uid());

-- 3. daily_savings: members can read their group's savings; users write only their own rows.
drop policy if exists "Members can read group daily savings" on public.daily_savings;
create policy "Members can read group daily savings"
  on public.daily_savings
  for select
  to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "Users can insert own daily savings" on public.daily_savings;
create policy "Users can insert own daily savings"
  on public.daily_savings
  for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_group_member(group_id));

drop policy if exists "Users can update own daily savings" on public.daily_savings;
create policy "Users can update own daily savings"
  on public.daily_savings
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_group_member(group_id));

drop policy if exists "Users can delete own daily savings" on public.daily_savings;
create policy "Users can delete own daily savings"
  on public.daily_savings
  for delete
  to authenticated
  using (user_id = auth.uid());

-- 4. alerts: members can read their group's alerts; users can only insert/delete their own alerts.
drop policy if exists "Members can read group alerts" on public.alerts;
create policy "Members can read group alerts"
  on public.alerts
  for select
  to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "Users can report alerts to their group" on public.alerts;
create policy "Users can report alerts to their group"
  on public.alerts
  for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_group_member(group_id));

drop policy if exists "Users can delete own alerts" on public.alerts;
create policy "Users can delete own alerts"
  on public.alerts
  for delete
  to authenticated
  using (user_id = auth.uid());

-- Enable Supabase Realtime for live leaderboard & local alerts (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'daily_savings'
  ) then
    alter publication supabase_realtime add table public.daily_savings;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'alerts'
  ) then
    alter publication supabase_realtime add table public.alerts;
  end if;
end $$;
