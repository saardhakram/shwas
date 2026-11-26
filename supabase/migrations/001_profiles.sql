-- Shwas Profiles: Per-user household profile, language, location, family & home settings
-- Apply manually in the Supabase SQL Editor (do not run automatically).

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  language text not null default 'en' check (language in ('en', 'hi', 'te', 'ta', 'bn', 'mr')),
  location jsonb not null default '{}'::jsonb,
  family jsonb not null default '[]'::jsonb,
  home jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_profiles_updated_at();

-- Row Level Security: users can only read and write their own profile row.
alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can delete own profile" on public.profiles;
create policy "Users can delete own profile"
  on public.profiles
  for delete
  to authenticated
  using (auth.uid() = id);

revoke all on public.profiles from anon;
