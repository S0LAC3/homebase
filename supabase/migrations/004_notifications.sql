-- Rate alert preferences per user
create table if not exists public.rate_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  alert_when text not null check (alert_when in ('drops_below', 'rises_above', 'any_change')),
  threshold_rate numeric,
  loan_type text not null default 'FHA' check (loan_type in ('FHA', 'Conventional', 'VA')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.rate_alerts enable row level security;
create policy "Users manage own rate alerts" on public.rate_alerts for all using (auth.uid() = user_id);

-- In-app notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  type text not null, -- 'rate_alert', 'market_update'
  title text not null,
  body text not null,
  metadata jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
create policy "Users manage own notifications" on public.notifications for all using (auth.uid() = user_id);
create index if not exists idx_notifications_user_unread on public.notifications (user_id, read_at) where read_at is null;

-- Mortgage rate history (populated by FRED API / Confluent consumer)
-- CONFLUENT HOOK: When Confluent integration is wired in, the consumer will INSERT rows here
-- after consuming from the 'mortgage-rates' Kafka topic.
create table if not exists public.mortgage_rates (
  id uuid primary key default gen_random_uuid(),
  rate_date date not null unique,
  rate_30yr_fixed numeric not null,
  rate_15yr_fixed numeric,
  rate_fha numeric,
  source text not null default 'FRED',
  created_at timestamptz not null default now()
);
-- No RLS needed - rates are public data
create index if not exists idx_mortgage_rates_date on public.mortgage_rates (rate_date desc);
