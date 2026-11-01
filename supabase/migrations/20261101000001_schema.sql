-- AI ROI Ledger: core schema
-- Rule: metadata only. No table stores prompt or output content.
-- Every row carries org_id so RLS stays a single indexed check.

create extension if not exists pgcrypto;
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Organisations and membership
-- ---------------------------------------------------------------------------
create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text,
  currency text not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  default_loaded_hourly_rate numeric(14,2) not null default 0 check (default_loaded_hourly_rate >= 0),
  productive_hours_per_year integer not null default 1800 check (productive_hours_per_year > 0),
  flag_thresholds jsonb not null default '{
    "scale_min_roi": 1,
    "fix_max_human_touch_rate": 0.2,
    "fix_healthy_volume_ratio": 0.5,
    "kill_min_days_live": 90,
    "kill_max_volume_ratio": 0.3,
    "cost_per_run_spike_pct": 0.25
  }'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.org_members (
  org_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_idx on public.org_members(user_id);

-- ---------------------------------------------------------------------------
-- Deployments and baselines
-- (A later opportunity map adds use_cases/tasks plus a deployment_use_cases
-- join table; nothing here needs to change for that.)
-- ---------------------------------------------------------------------------
create table public.deployments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  type text not null check (type in ('agent', 'workflow', 'seat_tool', 'custom_gpt')),
  description text,
  task_replaced text,
  owner_name text,
  owner_contact text,
  status text not null default 'planned' check (status in ('planned', 'live', 'paused', 'retired')),
  go_live_date date,
  expected_life_months integer not null default 24 check (expected_life_months > 0),
  predicted_monthly_value numeric(14,2),
  predicted_monthly_cost numeric(14,2),
  -- { "n8n_workflow_ids": [], "langfuse_tags": [], "langfuse_project": "", "openrouter_key_label": "" }
  external_refs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index deployments_org_idx on public.deployments(org_id);
create index deployments_external_refs_idx on public.deployments using gin (external_refs);

create table public.baselines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  deployment_id uuid not null references public.deployments(id) on delete cascade,
  volume_per_month numeric(14,2) not null check (volume_per_month >= 0),
  minutes_per_task numeric(10,2) not null check (minutes_per_task >= 0),
  loaded_hourly_rate numeric(14,2) not null check (loaded_hourly_rate >= 0),
  error_rate numeric(5,4) check (error_rate between 0 and 1),
  ai_error_rate numeric(5,4) check (ai_error_rate between 0 and 1),
  cost_per_error numeric(14,2) check (cost_per_error >= 0),
  turnaround_hours numeric(10,2),
  source text not null check (source in ('measured', 'reconstructed', 'estimate')),
  notes text,
  captured_at timestamptz not null default now()
);
-- Latest baseline per deployment wins; history is kept.
create index baselines_deployment_idx on public.baselines(deployment_id, captured_at desc);

-- ---------------------------------------------------------------------------
-- Runs, costs, human time
-- ---------------------------------------------------------------------------
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  deployment_id uuid not null references public.deployments(id) on delete cascade,
  external_id text not null,
  source text not null check (source in ('n8n', 'langfuse', 'openrouter', 'push', 'csv', 'manual')),
  started_at timestamptz not null,
  finished_at timestamptz,
  status text not null check (status in ('success', 'failed', 'needs_human')),
  token_cost numeric(14,6),
  tokens_in integer check (tokens_in >= 0),
  tokens_out integer check (tokens_out >= 0),
  model text,
  -- IDs, counts and timings only. Never prompt/output content.
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deployment_id, external_id)
);
create index runs_deployment_started_idx on public.runs(deployment_id, started_at);

create table public.cost_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  deployment_id uuid not null references public.deployments(id) on delete cascade,
  category text not null check (category in ('build', 'setup', 'training', 'licence', 'tokens', 'hosting', 'tooling', 'maintenance', 'other')),
  is_one_off boolean not null,
  amount numeric(14,2) not null check (amount >= 0),
  period_start date not null,
  period_end date not null,
  external_id text,
  notes text,
  created_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (deployment_id, external_id)
);
create index cost_entries_deployment_idx on public.cost_entries(deployment_id, period_start);

create table public.human_time_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  deployment_id uuid not null references public.deployments(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  activity text not null check (activity in ('review', 'fix', 'escalation', 'maintenance')),
  minutes numeric(10,2) not null check (minutes >= 0),
  hourly_rate numeric(14,2) check (hourly_rate >= 0),
  logged_by text,
  source text not null default 'form' check (source in ('form', 'push', 'csv')),
  -- Optional, lets push/CSV re-runs upsert instead of duplicating.
  external_id text,
  created_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (deployment_id, external_id)
);
create index human_time_deployment_idx on public.human_time_logs(deployment_id, period_start);

-- ---------------------------------------------------------------------------
-- ROI snapshots (one per deployment per day)
-- ---------------------------------------------------------------------------
create table public.roi_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  deployment_id uuid not null references public.deployments(id) on delete cascade,
  as_of date not null,
  cost_one_off numeric(14,2) not null,
  cost_running numeric(14,2) not null,
  cost_human numeric(14,2) not null,
  cost_total numeric(14,2) not null,
  value_total numeric(14,2) not null,
  net numeric(14,2) not null,
  roi numeric(12,4),
  payback_date date,
  payback_projected boolean not null default false,
  cost_per_successful_run numeric(14,2),
  success_rate numeric(5,4),
  human_touch_rate numeric(5,4),
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  flag text not null check (flag in ('scale', 'fix', 'kill', 'watch')),
  inputs jsonb not null,
  created_at timestamptz not null default now(),
  unique (deployment_id, as_of)
);

-- ---------------------------------------------------------------------------
-- Connectors and sync log
-- ---------------------------------------------------------------------------
create table public.connectors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  type text not null check (type in ('langfuse', 'openrouter', 'n8n')),
  name text not null,
  -- base URL, project, mapping rules to deployments. No secrets.
  config jsonb not null default '{}'::jsonb,
  -- AES-256-GCM ciphertext (see lib/crypto). Never readable by browser roles.
  credentials text,
  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  cursor jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index connectors_org_idx on public.connectors(org_id);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  connector_id uuid not null references public.connectors(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_in integer not null default 0,
  status text not null default 'running' check (status in ('running', 'success', 'failed')),
  error text
);
create index sync_runs_connector_idx on public.sync_runs(connector_id, started_at desc);

-- ---------------------------------------------------------------------------
-- Ingest keys and webhooks
-- ---------------------------------------------------------------------------
create table public.ingest_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index ingest_keys_org_idx on public.ingest_keys(org_id);

create table public.webhooks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  url text not null check (url ~ '^https?://'),
  secret text not null,
  events text[] not null default array['deployment.flag_changed', 'deployment.cost_per_run_spike', 'snapshot.monthly_summary'],
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index webhooks_org_idx on public.webhooks(org_id);

create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  webhook_id uuid not null references public.webhooks(id) on delete cascade,
  event text not null,
  payload jsonb not null,
  status_code integer,
  attempt integer not null default 1,
  error text,
  attempted_at timestamptz not null default now()
);
create index webhook_deliveries_webhook_idx on public.webhook_deliveries(webhook_id, attempted_at desc);

-- ---------------------------------------------------------------------------
-- org_id consistency: children always inherit org_id from their parent,
-- whatever the client sent.
-- ---------------------------------------------------------------------------
create or replace function private.set_org_from_deployment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select d.org_id into new.org_id from public.deployments d where d.id = new.deployment_id;
  if new.org_id is null then
    raise exception 'deployment % not found', new.deployment_id;
  end if;
  return new;
end $$;

create or replace function private.set_org_from_connector()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select c.org_id into new.org_id from public.connectors c where c.id = new.connector_id;
  return new;
end $$;

create or replace function private.set_org_from_webhook()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select w.org_id into new.org_id from public.webhooks w where w.id = new.webhook_id;
  return new;
end $$;

create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['baselines', 'runs', 'cost_entries', 'human_time_logs', 'roi_snapshots'] loop
    execute format(
      'create trigger %1$s_set_org before insert or update of deployment_id on public.%1$s
       for each row execute function private.set_org_from_deployment()', t);
  end loop;
end $$;

create trigger sync_runs_set_org before insert on public.sync_runs
  for each row execute function private.set_org_from_connector();
create trigger webhook_deliveries_set_org before insert on public.webhook_deliveries
  for each row execute function private.set_org_from_webhook();
create trigger runs_touch before update on public.runs
  for each row execute function private.touch_updated_at();
