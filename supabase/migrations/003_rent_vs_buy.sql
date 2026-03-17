create table if not exists public.rent_vs_buy_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  name text not null default 'My Scenario',
  inputs jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.rent_vs_buy_scenarios enable row level security;
create policy "Users can manage own rv_scenarios" on public.rent_vs_buy_scenarios for all using (auth.uid() = user_id);
create index if not exists idx_rvb_user on public.rent_vs_buy_scenarios (user_id);
