-- Row Level Security: users only ever see their own organisation's rows.
-- Server-side jobs (cron, ingest API, connectors) use the service role, which bypasses RLS,
-- and always scope their queries by org_id explicitly.

create or replace function private.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_org_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.role = 'admin'
  );
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_org_member(uuid), private.is_org_admin(uuid) to authenticated;

alter table public.organisations enable row level security;
alter table public.org_members enable row level security;
alter table public.deployments enable row level security;
alter table public.baselines enable row level security;
alter table public.runs enable row level security;
alter table public.cost_entries enable row level security;
alter table public.human_time_logs enable row level security;
alter table public.roi_snapshots enable row level security;
alter table public.connectors enable row level security;
alter table public.sync_runs enable row level security;
alter table public.ingest_keys enable row level security;
alter table public.webhooks enable row level security;
alter table public.webhook_deliveries enable row level security;

-- Organisations: members read, admins update. Creation goes through create_organisation().
create policy org_select on public.organisations for select to authenticated
  using (private.is_org_member(id));
create policy org_update on public.organisations for update to authenticated
  using (private.is_org_admin(id)) with check (private.is_org_admin(id));

-- Membership: members see their org's members, admins manage them.
create policy members_select on public.org_members for select to authenticated
  using (private.is_org_member(org_id));
create policy members_admin_write on public.org_members for all to authenticated
  using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));

-- Deployment data: any member can read and record; only admins delete deployments.
create policy deployments_select on public.deployments for select to authenticated
  using (private.is_org_member(org_id));
create policy deployments_insert on public.deployments for insert to authenticated
  with check (private.is_org_member(org_id));
create policy deployments_update on public.deployments for update to authenticated
  using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy deployments_delete on public.deployments for delete to authenticated
  using (private.is_org_admin(org_id));

do $$
declare t text;
begin
  foreach t in array array['baselines', 'runs', 'cost_entries', 'human_time_logs'] loop
    -- org_id is overwritten from the parent deployment by trigger, so the
    -- with-check below evaluates against the deployment's real org.
    execute format('create policy %1$s_select on public.%1$s for select to authenticated
      using (private.is_org_member(org_id))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated
      with check (private.is_org_member(org_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated
      using (private.is_org_member(org_id)) with check (private.is_org_member(org_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated
      using (private.is_org_member(org_id))', t);
  end loop;
end $$;

-- Read-only to members; written by the server (service role).
create policy snapshots_select on public.roi_snapshots for select to authenticated
  using (private.is_org_member(org_id));
create policy sync_runs_select on public.sync_runs for select to authenticated
  using (private.is_org_member(org_id));
create policy deliveries_select on public.webhook_deliveries for select to authenticated
  using (private.is_org_member(org_id));

-- Settings objects: admins only. Secrets are created server-side.
create policy connectors_admin on public.connectors for all to authenticated
  using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));
create policy ingest_keys_admin on public.ingest_keys for all to authenticated
  using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));
create policy webhooks_admin on public.webhooks for all to authenticated
  using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));

-- Column-level lock-down: secret columns are never readable or writable by
-- browser roles, even for admins. Only the service role touches them.
revoke all on public.connectors from anon, authenticated;
grant select (id, org_id, type, name, config, status, cursor, last_synced_at, last_error, created_at)
  on public.connectors to authenticated;
grant update (name, config, status) on public.connectors to authenticated;
grant delete on public.connectors to authenticated;

revoke all on public.ingest_keys from anon, authenticated;
grant select (id, org_id, name, key_prefix, created_at, last_used_at, revoked_at)
  on public.ingest_keys to authenticated;
grant update (revoked_at) on public.ingest_keys to authenticated;

revoke all on public.webhooks from anon, authenticated;
grant select (id, org_id, url, events, active, created_at) on public.webhooks to authenticated;
grant update (url, events, active) on public.webhooks to authenticated;
grant delete on public.webhooks to authenticated;

-- Nothing is public.
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- Onboarding: create an organisation and make the caller its admin.
-- ---------------------------------------------------------------------------
create or replace function public.create_organisation(
  p_name text,
  p_currency text default 'NGN',
  p_default_loaded_hourly_rate numeric default 0,
  p_industry text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  insert into public.organisations (name, currency, default_loaded_hourly_rate, industry)
  values (p_name, upper(p_currency), p_default_loaded_hourly_rate, p_industry)
  returning id into v_org;
  insert into public.org_members (org_id, user_id, role) values (v_org, (select auth.uid()), 'admin');
  return v_org;
end $$;

revoke execute on function public.create_organisation(text, text, numeric, text) from public, anon;
grant execute on function public.create_organisation(text, text, numeric, text) to authenticated;
