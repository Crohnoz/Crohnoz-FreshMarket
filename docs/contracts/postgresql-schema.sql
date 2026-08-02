-- Crohnoz Fresh Market -> Crohnoz Kernel
-- Contract-only schema. It is not deployed by this repository.
-- PostgreSQL 16+ recommended.

begin;

create extension if not exists pgcrypto;
create schema if not exists app;

create or replace function app.current_organization_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.organization_id', true), '')::uuid;
$$;

create or replace function app.current_actor_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.actor_id', true), '')::uuid;
$$;

create table if not exists app.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.users (
  id uuid primary key default gen_random_uuid(),
  auth_subject text not null unique,
  email citext,
  display_name text not null check (char_length(display_name) between 1 and 160),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  user_id uuid not null references app.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'operator', 'viewer')),
  status text not null default 'active' check (status in ('invited', 'active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists app.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  external_id text,
  name text not null check (char_length(name) between 1 and 160),
  category text,
  base_unit text not null check (base_unit in ('kg', 'g', 'unit', 'pack', 'bag', 'box')),
  current_price integer not null default 0 check (current_price >= 0),
  current_cost integer not null default 0 check (current_cost >= 0),
  stock_minimum numeric(14,3) not null default 0 check (stock_minimum >= 0),
  active boolean not null default true,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, external_id)
);

create table if not exists app.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  external_id text,
  display_name text not null check (char_length(display_name) between 1 and 160),
  phone text,
  notes text,
  credit_limit integer not null default 0 check (credit_limit >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, external_id)
);

create table if not exists app.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  external_id text,
  name text not null check (char_length(name) between 1 and 160),
  phone text,
  lead_time_days integer not null default 0 check (lead_time_days >= 0),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, external_id)
);

create table if not exists app.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  external_id text,
  customer_id uuid references app.customers(id) on delete set null,
  customer_label text not null check (char_length(customer_label) between 1 and 160),
  fulfillment text not null check (fulfillment in ('pickup', 'delivery')),
  status text not null check (status in (
    'new', 'preparing', 'pending_weighing', 'pending_customer_confirmation',
    'confirmed', 'ready', 'delivering', 'delivered', 'cancelled'
  )),
  tolerance_percent numeric(7,3) not null default 0 check (tolerance_percent >= 0),
  max_extra_amount integer not null default 0 check (max_extra_amount >= 0),
  version integer not null default 1 check (version >= 1),
  created_by uuid references app.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, external_id)
);

create table if not exists app.order_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  order_id uuid not null references app.orders(id) on delete cascade,
  product_id uuid not null references app.products(id) on delete restrict,
  requested_quantity numeric(14,3) not null check (requested_quantity > 0),
  actual_quantity numeric(14,3) check (actual_quantity >= 0),
  unit text not null check (unit in ('kg', 'g', 'unit', 'pack', 'bag', 'box')),
  unit_price integer not null check (unit_price >= 0),
  preference text,
  position integer not null check (position >= 1),
  created_at timestamptz not null default now(),
  unique (order_id, position)
);

create table if not exists app.order_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  order_id uuid not null references app.orders(id) on delete restrict,
  amount integer not null check (amount > 0),
  settlement text not null check (settlement in ('cash', 'transfer', 'credit')),
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'reversed')),
  idempotency_key text not null,
  created_by uuid references app.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create table if not exists app.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  external_id text,
  supplier_id uuid not null references app.suppliers(id) on delete restrict,
  settlement text not null check (settlement in ('cash', 'transfer', 'credit')),
  total integer not null check (total >= 0),
  created_by uuid references app.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, external_id)
);

create table if not exists app.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  purchase_order_id uuid not null references app.purchase_orders(id) on delete cascade,
  product_id uuid not null references app.products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null check (unit in ('kg', 'g', 'unit', 'pack', 'bag', 'box')),
  unit_cost integer not null check (unit_cost >= 0),
  target_margin_percent numeric(7,3) check (target_margin_percent >= 0),
  expected_waste_percent numeric(7,3) check (expected_waste_percent between 0 and 100),
  suggested_price integer check (suggested_price >= 0),
  position integer not null check (position >= 1),
  unique (purchase_order_id, position)
);

create table if not exists app.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  external_id text,
  product_id uuid not null references app.products(id) on delete restrict,
  supplier_id uuid references app.suppliers(id) on delete set null,
  purchase_order_id uuid references app.purchase_orders(id) on delete set null,
  received_quantity numeric(14,3) not null check (received_quantity > 0),
  sold_quantity numeric(14,3) not null default 0 check (sold_quantity >= 0),
  waste_quantity numeric(14,3) not null default 0 check (waste_quantity >= 0),
  adjustment_quantity numeric(14,3) not null default 0,
  unit text not null check (unit in ('kg', 'g', 'unit', 'pack', 'bag', 'box')),
  unit_cost integer not null check (unit_cost >= 0),
  condition text,
  ripeness smallint check (ripeness between 0 and 5),
  received_at date not null,
  best_before_date date,
  notes text,
  created_at timestamptz not null default now(),
  unique (organization_id, external_id),
  check (best_before_date is null or best_before_date >= received_at),
  check (received_quantity - sold_quantity - waste_quantity + adjustment_quantity >= 0)
);

create table if not exists app.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  customer_id uuid not null references app.customers(id) on delete restrict,
  entry_type text not null check (entry_type in ('charge', 'payment')),
  amount integer not null check (amount > 0),
  settlement text not null check (settlement in ('cash', 'transfer', 'credit')),
  description text,
  source text not null,
  reference_id text,
  occurred_at timestamptz not null,
  created_by uuid references app.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists app.daily_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('sale', 'purchase', 'expense', 'withdrawal', 'other_income')),
  settlement text not null check (settlement in ('cash', 'transfer', 'credit')),
  customer_id uuid references app.customers(id) on delete set null,
  counterparty text,
  total integer not null check (total >= 0),
  source text not null,
  occurred_at timestamptz not null,
  created_by uuid references app.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists app.waste_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  product_id uuid not null references app.products(id) on delete restrict,
  inventory_lot_id uuid references app.inventory_lots(id) on delete set null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null check (unit in ('kg', 'g', 'unit', 'pack', 'bag', 'box')),
  estimated_cost integer check (estimated_cost >= 0),
  reason text,
  occurred_at timestamptz not null,
  created_by uuid references app.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists app.daily_closes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  business_date date not null,
  revision integer not null default 1 check (revision >= 1),
  expected_cash integer not null check (expected_cash >= 0),
  counted_cash integer not null check (counted_cash >= 0),
  difference integer not null,
  absolute_difference integer generated always as (abs(difference)) stored,
  status text not null check (status in ('balanced', 'review')),
  notes text,
  created_by uuid references app.users(id) on delete set null,
  created_at timestamptz not null default now(),
  supersedes_id uuid references app.daily_closes(id) on delete restrict,
  unique (organization_id, business_date, revision),
  check (difference = counted_cash - expected_cash)
);

create table if not exists app.idempotency_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  actor_id uuid references app.users(id) on delete set null,
  idempotency_key text not null,
  request_method text not null,
  request_path text not null,
  request_hash text not null,
  response_status integer,
  response_body jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (organization_id, idempotency_key)
);

create table if not exists app.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  sequence bigint not null check (sequence >= 1),
  occurred_at timestamptz not null default now(),
  actor_id uuid references app.users(id) on delete set null,
  actor_role text,
  action text not null check (char_length(action) between 1 and 120),
  resource_type text not null check (char_length(resource_type) between 1 and 120),
  resource_id text,
  source text not null,
  previous_event_hash text,
  event_hash text not null,
  before_digest text,
  after_digest text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, sequence),
  unique (organization_id, event_hash)
);

create table if not exists app.import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references app.organizations(id) on delete restrict,
  requested_by uuid references app.users(id) on delete set null,
  source_product text not null,
  source_version text not null,
  package_format text not null,
  package_version integer not null check (package_version >= 1),
  package_checksum text not null,
  status text not null default 'pending' check (status in ('pending', 'validating', 'ready', 'importing', 'completed', 'failed', 'cancelled')),
  error_count integer not null default 0 check (error_count >= 0),
  warning_count integer not null default 0 check (warning_count >= 0),
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  unique (package_checksum)
);

create table if not exists app.import_job_items (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references app.import_jobs(id) on delete cascade,
  collection_name text not null,
  source_id text,
  target_id uuid,
  status text not null check (status in ('pending', 'validated', 'imported', 'skipped', 'failed')),
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists orders_org_status_created_idx on app.orders (organization_id, status, created_at desc);
create index if not exists inventory_lots_org_best_before_idx on app.inventory_lots (organization_id, best_before_date, received_at);
create index if not exists ledger_entries_org_customer_occurred_idx on app.ledger_entries (organization_id, customer_id, occurred_at desc);
create index if not exists audit_events_org_sequence_idx on app.audit_events (organization_id, sequence desc);
create index if not exists import_job_items_job_status_idx on app.import_job_items (import_job_id, status);

create or replace function app.reject_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_events is append-only';
end;
$$;

drop trigger if exists audit_events_no_update on app.audit_events;
create trigger audit_events_no_update
before update or delete on app.audit_events
for each row execute function app.reject_audit_mutation();

alter table app.organization_memberships enable row level security;
alter table app.products enable row level security;
alter table app.customers enable row level security;
alter table app.suppliers enable row level security;
alter table app.orders enable row level security;
alter table app.order_lines enable row level security;
alter table app.order_payments enable row level security;
alter table app.purchase_orders enable row level security;
alter table app.purchase_lines enable row level security;
alter table app.inventory_lots enable row level security;
alter table app.ledger_entries enable row level security;
alter table app.daily_transactions enable row level security;
alter table app.waste_entries enable row level security;
alter table app.daily_closes enable row level security;
alter table app.idempotency_records enable row level security;
alter table app.audit_events enable row level security;

create policy membership_org_isolation on app.organization_memberships
using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());
create policy products_org_isolation on app.products
using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());
create policy customers_org_isolation on app.customers
using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());
create policy suppliers_org_isolation on app.suppliers
using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());
create policy orders_org_isolation on app.orders
using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());
create policy order_lines_org_isolation on app.order_lines
using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());
create policy order_payments_org_isolation on app.order_payments
using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());
create policy purchase_orders_org_isolation on app.purchase_orders
using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());
create policy purchase_lines_org_isolation on app.purchase_lines
using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());
create policy inventory_lots_org_isolation on app.inventory_lots
using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());
create policy ledger_entries_org_isolation on app.ledger_entries
using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());
create policy daily_transactions_org_isolation on app.daily_transactions
using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());
create policy waste_entries_org_isolation on app.waste_entries
using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());
create policy daily_closes_org_isolation on app.daily_closes
using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());
create policy idempotency_records_org_isolation on app.idempotency_records
using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());
create policy audit_events_org_isolation on app.audit_events
using (organization_id = app.current_organization_id())
with check (organization_id = app.current_organization_id());

commit;
