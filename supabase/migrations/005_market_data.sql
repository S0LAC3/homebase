create table if not exists public.market_data (
  id uuid primary key default gen_random_uuid(),
  data_date date not null,
  metro text not null default 'Seattle-Tacoma-Bellevue',
  metric_name text not null,
  metric_value numeric not null,
  metric_unit text,
  source text not null,
  created_at timestamptz not null default now(),
  unique(data_date, metro, metric_name)
);
create index if not exists idx_market_data_date on public.market_data (data_date desc);
create index if not exists idx_market_data_metric on public.market_data (metric_name, data_date desc);
