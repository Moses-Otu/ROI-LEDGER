-- Faster RLS: evaluate the caller's org ids once per query (an InitPlan) instead of
-- calling is_org_member(org_id) for every row. Same rules, same results.

create or replace function private.user_org_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.org_id from public.org_members m where m.user_id = (select auth.uid());
$$;

create or replace function private.user_admin_org_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.org_id from public.org_members m where m.user_id = (select auth.uid()) and m.role = 'admin';
$$;

grant execute on function private.user_org_ids(), private.user_admin_org_ids() to authenticated;

do $$
declare
  r record;
  member_expr constant text := 'org_id in (select private.user_org_ids())';
  admin_expr constant text := 'org_id in (select private.user_admin_org_ids())';
begin
  -- Rewrite every policy that used the per-row helpers.
  for r in
    select schemaname, tablename, policyname, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (qual like '%is_org_%' or with_check like '%is_org_%')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    execute format(
      'create policy %I on %I.%I for %s to authenticated %s %s',
      r.policyname, r.schemaname, r.tablename, r.cmd,
      case when r.qual is null then '' else 'using (' || replace(replace(replace(replace(r.qual,
        'private.is_org_member(org_id)', member_expr),
        'private.is_org_admin(org_id)', admin_expr),
        'private.is_org_member(id)', 'id in (select private.user_org_ids())'),
        'private.is_org_admin(id)', 'id in (select private.user_admin_org_ids())') || ')' end,
      case when r.with_check is null then '' else 'with check (' || replace(replace(replace(replace(r.with_check,
        'private.is_org_member(org_id)', member_expr),
        'private.is_org_admin(org_id)', admin_expr),
        'private.is_org_member(id)', 'id in (select private.user_org_ids())'),
        'private.is_org_admin(id)', 'id in (select private.user_admin_org_ids())') || ')' end
    );
  end loop;
end $$;

-- Runs are read per deployment in started_at order; include id for stable paging.
create index if not exists runs_deployment_started_id_idx on public.runs (deployment_id, started_at, id);
