-- Shwas Forecast (ML): 48-hour hourly PM2.5 forecasts table
-- Apply manually in the Supabase SQL Editor (do not run automatically).

create table if not exists public.forecasts (
  id bigserial primary key,
  location_id text not null,
  location_name text not null,
  lat double precision not null,
  lon double precision not null,
  generated_at timestamptz not null default now(),
  target_time timestamptz not null,
  horizon_hour integer not null check (horizon_hour >= 1 and horizon_hour <= 48),
  predicted_pm25 double precision not null check (predicted_pm25 >= 0),
  predicted_us_aqi integer not null check (predicted_us_aqi >= 0 and predicted_us_aqi <= 500),
  model_version text not null default 'shwas-lgbm-v1',
  model_mae double precision,
  constraint forecasts_location_horizon_unique unique (location_id, horizon_hour)
);

create index if not exists idx_forecasts_location_target
  on public.forecasts (location_id, target_time asc);

create index if not exists idx_forecasts_generated_at
  on public.forecasts (generated_at desc);

-- Row Level Security: anyone can read forecasts, nobody can write from the browser.
-- Only the server-side GitHub Action using SUPABASE_SERVICE_ROLE_KEY (bypasses RLS) can upsert.
alter table public.forecasts enable row level security;

drop policy if exists "Public read access to forecasts" on public.forecasts;
create policy "Public read access to forecasts"
  on public.forecasts
  for select
  to anon, authenticated
  using (true);

-- Explicitly revoke write privileges from browser roles for defense in depth
revoke insert, update, delete on public.forecasts from anon, authenticated;

