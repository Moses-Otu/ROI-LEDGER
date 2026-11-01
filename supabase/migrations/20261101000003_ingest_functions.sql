-- Idempotent ingest helpers. Called by the server with the service role only.

-- Upsert runs, merging with any existing row for the same (deployment_id, external_id):
-- a field that arrives null keeps the stored value, metadata is merged. This is
-- what lets a Langfuse trace and an n8n execution land on one row in either order.
create or replace function public.upsert_runs(p_org uuid, p_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  with incoming as (
    select r.*
    from jsonb_to_recordset(p_rows) as r(
      deployment_id uuid, external_id text, source text, started_at timestamptz,
      finished_at timestamptz, status text, token_cost numeric, tokens_in integer,
      tokens_out integer, model text, metadata jsonb
    )
    join public.deployments d on d.id = r.deployment_id and d.org_id = p_org
  ), written as (
    insert into public.runs as t (
      org_id, deployment_id, external_id, source, started_at, finished_at, status,
      token_cost, tokens_in, tokens_out, model, metadata
    )
    select p_org, deployment_id, external_id, source, started_at, finished_at, status,
           token_cost, tokens_in, tokens_out, model, coalesce(metadata, '{}'::jsonb)
    from incoming
    on conflict (deployment_id, external_id) do update set
      -- Execution sources (n8n, push, csv) own status and timings; trace sources fill gaps.
      source = case when excluded.source in ('langfuse', 'openrouter') then t.source else excluded.source end,
      started_at = case when excluded.source in ('langfuse', 'openrouter') then least(t.started_at, excluded.started_at) else excluded.started_at end,
      finished_at = coalesce(case when excluded.source in ('langfuse', 'openrouter') then t.finished_at else excluded.finished_at end, excluded.finished_at, t.finished_at),
      status = case when excluded.source in ('langfuse', 'openrouter') and t.source not in ('langfuse', 'openrouter') then t.status else excluded.status end,
      token_cost = coalesce(excluded.token_cost, t.token_cost),
      tokens_in = coalesce(excluded.tokens_in, t.tokens_in),
      tokens_out = coalesce(excluded.tokens_out, t.tokens_out),
      model = coalesce(excluded.model, t.model),
      metadata = t.metadata || excluded.metadata
    returning 1
  )
  select count(*) into v_count from written;
  return v_count;
end $$;

create or replace function public.upsert_cost_entries(p_org uuid, p_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  with incoming as (
    select r.*
    from jsonb_to_recordset(p_rows) as r(
      deployment_id uuid, category text, is_one_off boolean, amount numeric,
      period_start date, period_end date, external_id text, notes text
    )
    join public.deployments d on d.id = r.deployment_id and d.org_id = p_org
  ), written as (
    insert into public.cost_entries as t (
      org_id, deployment_id, category, is_one_off, amount, period_start, period_end, external_id, notes
    )
    select p_org, deployment_id, category, is_one_off, amount, period_start, period_end, external_id, notes
    from incoming
    on conflict (deployment_id, external_id) do update set
      category = excluded.category,
      is_one_off = excluded.is_one_off,
      amount = excluded.amount,
      period_start = excluded.period_start,
      period_end = excluded.period_end,
      notes = coalesce(excluded.notes, t.notes)
    returning 1
  )
  select count(*) into v_count from written;
  return v_count;
end $$;

create or replace function public.upsert_human_time(p_org uuid, p_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  with incoming as (
    select r.*
    from jsonb_to_recordset(p_rows) as r(
      deployment_id uuid, period_start date, period_end date, activity text, minutes numeric,
      hourly_rate numeric, logged_by text, source text, external_id text
    )
    join public.deployments d on d.id = r.deployment_id and d.org_id = p_org
  ), written as (
    insert into public.human_time_logs as t (
      org_id, deployment_id, period_start, period_end, activity, minutes, hourly_rate, logged_by, source, external_id
    )
    select p_org, deployment_id, period_start, period_end, activity, minutes, hourly_rate, logged_by,
           coalesce(source, 'push'), external_id
    from incoming
    on conflict (deployment_id, external_id) do update set
      period_start = excluded.period_start,
      period_end = excluded.period_end,
      activity = excluded.activity,
      minutes = excluded.minutes,
      hourly_rate = excluded.hourly_rate,
      logged_by = coalesce(excluded.logged_by, t.logged_by)
    returning 1
  )
  select count(*) into v_count from written;
  return v_count;
end $$;

revoke execute on function public.upsert_runs(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.upsert_cost_entries(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.upsert_human_time(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_runs(uuid, jsonb) to service_role;
grant execute on function public.upsert_cost_entries(uuid, jsonb) to service_role;
grant execute on function public.upsert_human_time(uuid, jsonb) to service_role;
