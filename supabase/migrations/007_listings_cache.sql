-- Cache Rentcast API results
create table if not exists public.listings_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null unique,
  data jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_listings_cache_key on public.listings_cache (cache_key);
create index if not exists idx_listings_cache_expires on public.listings_cache (expires_at);

-- Per-user API usage tracking
create table if not exists public.api_usage (
  user_id uuid not null references public.profiles on delete cascade,
  api_name text not null,
  month text not null, -- 'YYYY-MM'
  calls_used int not null default 0,
  primary key (user_id, api_name, month)
);
