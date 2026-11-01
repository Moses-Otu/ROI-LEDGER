-- DEMO DATA generator. Everything it creates is fake and labelled as such.
-- create_demo_org() builds an organisation (is_demo = true) for the calling user with
-- one "Procurement assistant" deployment and ~6 months of runs, costs and human time.
-- Delete it from Settings → Demo data (deleting the org cascades to every row).

create or replace function public.create_demo_org()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid;
  v_dep uuid;
  v_go_live date := (current_date - interval '180 days')::date;
  v_day date;
  v_runs int;
  v_i int;
  v_n int := 0;
  v_start timestamptz;
  v_r double precision;
  v_week date;
  v_progress double precision;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  perform setseed(0.42);

  insert into public.organisations (name, industry, currency, default_loaded_hourly_rate, is_demo)
  values ('Demo Co (DEMO DATA)', 'Manufacturing (demo)', 'NGN', 6000, true)
  returning id into v_org;
  insert into public.org_members (org_id, user_id, role) values (v_org, v_user, 'admin');

  insert into public.deployments (
    org_id, name, type, description, task_replaced, owner_name, owner_contact, status,
    go_live_date, expected_life_months, predicted_monthly_value, predicted_monthly_cost, external_refs
  ) values (
    v_org, 'Procurement assistant', 'agent',
    'DEMO DATA. An n8n procurement assistant used by ~50 staff to raise, check and route purchase requests.',
    'Raising and approving purchase requests by email (took days)',
    'Demo Owner', 'owner@demo.invalid', 'live', v_go_live, 24, 2500000, 450000,
    '{"n8n_workflow_ids": ["demo-wf-procuremate"], "langfuse_tags": ["procuremate-demo"], "openrouter_key_label": "procuremate-demo"}'::jsonb
  ) returning id into v_dep;

  -- Reconstructed after go-live (counted from the old procurement mailbox and staff interviews).
  insert into public.baselines (
    org_id, deployment_id, volume_per_month, minutes_per_task, loaded_hourly_rate,
    error_rate, ai_error_rate, cost_per_error, turnaround_hours, source, notes, captured_at
  ) values (
    v_org, v_dep, 700, 25, 6500, 0.08, 0.03, 12000, 72, 'reconstructed',
    'DEMO DATA. Volume: requests in the procurement mailbox, Feb–Apr. Minutes: median of 5 staff walkthroughs. Errors: rework log from finance.',
    v_go_live + 14
  );

  -- One-off costs.
  insert into public.cost_entries (org_id, deployment_id, category, is_one_off, amount, period_start, period_end, external_id, notes) values
    (v_org, v_dep, 'build', true, 2400000, v_go_live - 45, v_go_live - 45, 'demo-build', 'DEMO: build by contractor'),
    (v_org, v_dep, 'setup', true, 180000, v_go_live - 7, v_go_live - 7, 'demo-setup', 'DEMO: credentials, approvals matrix'),
    (v_org, v_dep, 'training', true, 220000, v_go_live, v_go_live, 'demo-training', 'DEMO: two staff training sessions');

  -- Monthly recurring costs (n8n hosting, Langfuse) from go-live.
  v_day := date_trunc('month', v_go_live)::date;
  while v_day <= current_date loop
    insert into public.cost_entries (org_id, deployment_id, category, is_one_off, amount, period_start, period_end, external_id, notes) values
      (v_org, v_dep, 'hosting', false, 45000, v_day, (v_day + interval '1 month' - interval '1 day')::date, 'demo-hosting-' || to_char(v_day, 'YYYY-MM'), 'DEMO: n8n hosting'),
      (v_org, v_dep, 'tooling', false, 30000, v_day, (v_day + interval '1 month' - interval '1 day')::date, 'demo-tooling-' || to_char(v_day, 'YYYY-MM'), 'DEMO: Langfuse');
    v_day := (v_day + interval '1 month')::date;
  end loop;

  -- Runs: weekdays only, ramping from ~8/day to ~35/day over the first three months.
  v_day := v_go_live;
  while v_day < current_date loop
    if extract(isodow from v_day) < 6 then
      v_progress := least(1.0, (v_day - v_go_live) / 90.0);
      v_runs := greatest(1, round(8 + 27 * v_progress + (random() - 0.5) * 10)::int);
      for v_i in 1..v_runs loop
        v_n := v_n + 1;
        v_start := v_day + time '08:00' + (random() * interval '9 hours');
        v_r := random();
        insert into public.runs (
          org_id, deployment_id, external_id, source, started_at, finished_at, status,
          token_cost, tokens_in, tokens_out, model, metadata
        ) values (
          v_org, v_dep, 'n8n:demo-' || v_n, 'n8n', v_start,
          v_start + (120 + random() * 120) * interval '1 second',
          -- needs_human falls as prompts improve: ~16% at launch to ~8% later.
          case when v_r < 0.04 then 'failed'
               when v_r < 0.04 + (0.16 - 0.08 * v_progress) then 'needs_human'
               else 'success' end,
          round((20 + random() * 30)::numeric, 2),
          1500 + floor(random() * 1500)::int, 300 + floor(random() * 400)::int,
          'openai/gpt-4o-mini', '{"demo": true}'::jsonb
        );
      end loop;
    end if;
    v_day := v_day + 1;
  end loop;

  -- Weekly human time: review and fixes drop as the assistant beds in.
  v_week := v_go_live;
  while v_week + 6 < current_date loop
    v_progress := least(1.0, (v_week - v_go_live) / 120.0);
    insert into public.human_time_logs (org_id, deployment_id, period_start, period_end, activity, minutes, logged_by, source, external_id) values
      (v_org, v_dep, v_week, v_week + 6, 'review', round(540 - 300 * v_progress + random() * 60), 'Demo reviewer', 'form', 'demo-review-' || v_week),
      (v_org, v_dep, v_week, v_week + 6, 'fix', round(150 - 100 * v_progress + random() * 30), 'Demo reviewer', 'form', 'demo-fix-' || v_week),
      (v_org, v_dep, v_week, v_week + 6, 'escalation', round(90 - 60 * v_progress + random() * 20), 'Demo owner', 'form', 'demo-esc-' || v_week),
      (v_org, v_dep, v_week, v_week + 6, 'maintenance', 60 + round(random() * 30), 'Demo builder', 'form', 'demo-maint-' || v_week);
    v_week := v_week + 7;
  end loop;

  return v_org;
end $$;

revoke execute on function public.create_demo_org() from public, anon;
grant execute on function public.create_demo_org() to authenticated;
