-- HomeBase Initial Schema
-- Run this in your Supabase SQL editor or via supabase db push

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  name text,
  role text not null default 'buyer' check (role in ('buyer', 'advisor')),
  income numeric,
  credit_score int check (credit_score between 300 and 850),
  monthly_debt numeric,
  savings numeric,
  target_location text,
  created_at timestamptz not null default now()
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  address text not null,
  city text not null default 'Seattle',
  state text not null default 'WA',
  zip text,
  price numeric not null,
  sqft int,
  bedrooms int,
  bathrooms int,
  hoa_monthly numeric default 0,
  property_tax_annual numeric,
  year_built int,
  listing_url text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.mortgage_scenarios (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  loan_type text not null check (loan_type in ('FHA', 'Conventional', 'VA')),
  purchase_price numeric not null,
  down_payment_percent numeric not null,
  down_payment_amount numeric not null,
  interest_rate numeric not null,
  loan_term_years int not null default 30,
  monthly_payment numeric not null,
  monthly_mip_or_pmi numeric not null default 0,
  total_monthly_cost numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists public.budget_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  category text not null default 'Other',
  description text not null,
  amount numeric not null,
  is_income boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  title text not null,
  description text,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'complete')),
  due_date date,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.advisor_access (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles on delete cascade,
  advisor_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  unique (buyer_id, advisor_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists idx_properties_user on public.properties (user_id);
create index if not exists idx_mortgage_scenarios_property on public.mortgage_scenarios (property_id);
create index if not exists idx_mortgage_scenarios_user on public.mortgage_scenarios (user_id);
create index if not exists idx_budget_items_user on public.budget_items (user_id);
create index if not exists idx_checklist_items_user on public.checklist_items (user_id);
create index if not exists idx_advisor_access_buyer on public.advisor_access (buyer_id);
create index if not exists idx_advisor_access_advisor on public.advisor_access (advisor_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.mortgage_scenarios enable row level security;
alter table public.budget_items enable row level security;
alter table public.checklist_items enable row level security;
alter table public.advisor_access enable row level security;

-- Profiles: users can read/write their own profile
-- Advisors can read profiles of buyers who granted access
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Advisors can view buyer profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.advisor_access
      where advisor_id = auth.uid() and buyer_id = profiles.id
    )
  );

-- Properties: owners can CRUD, advisors can read via advisor_access
create policy "Users can manage own properties"
  on public.properties for all
  using (auth.uid() = user_id);

create policy "Advisors can view buyer properties"
  on public.properties for select
  using (
    exists (
      select 1 from public.advisor_access
      where advisor_id = auth.uid() and buyer_id = properties.user_id
    )
  );

-- Mortgage Scenarios: owners can CRUD, advisors can read
create policy "Users can manage own scenarios"
  on public.mortgage_scenarios for all
  using (auth.uid() = user_id);

create policy "Advisors can view buyer scenarios"
  on public.mortgage_scenarios for select
  using (
    exists (
      select 1 from public.advisor_access
      where advisor_id = auth.uid() and buyer_id = mortgage_scenarios.user_id
    )
  );

-- Budget Items: owners can CRUD, advisors can read
create policy "Users can manage own budget items"
  on public.budget_items for all
  using (auth.uid() = user_id);

create policy "Advisors can view buyer budget items"
  on public.budget_items for select
  using (
    exists (
      select 1 from public.advisor_access
      where advisor_id = auth.uid() and buyer_id = budget_items.user_id
    )
  );

-- Checklist Items: owners can CRUD, advisors can read
create policy "Users can manage own checklist items"
  on public.checklist_items for all
  using (auth.uid() = user_id);

create policy "Advisors can view buyer checklist items"
  on public.checklist_items for select
  using (
    exists (
      select 1 from public.advisor_access
      where advisor_id = auth.uid() and buyer_id = checklist_items.user_id
    )
  );

-- Advisor Access: buyers can manage their own grants, advisors can see grants to them
create policy "Buyers can manage advisor access"
  on public.advisor_access for all
  using (auth.uid() = buyer_id);

create policy "Advisors can view their access grants"
  on public.advisor_access for select
  using (auth.uid() = advisor_id);

-- ============================================================
-- TRIGGER: auto-create profile on signup
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  );
  return new;
end;
$$;

-- Drop if exists to make this idempotent
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
