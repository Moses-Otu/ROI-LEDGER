-- Remove demo mode. The app is live; demo data and the demo generator go away.
--
-- 1. Delete the generated sample deployment(s) (their runs, costs, time logs and
--    snapshots cascade). They are recognisable by the "DEMO DATA." description
--    the generator wrote.
-- 2. A former demo org that still holds real work (a deployment someone added
--    there) becomes a normal organisation, renamed so it no longer says "DEMO".
--    Rename it properly in Settings → Organisation.
-- 3. A former demo org with nothing left in it is deleted.
-- 4. Drop the generator function and the is_demo flag.

delete from public.deployments d
using public.organisations o
where d.org_id = o.id
  and o.is_demo
  and d.description like 'DEMO DATA.%';

delete from public.organisations o
where o.is_demo
  and not exists (select 1 from public.deployments d where d.org_id = o.id);

update public.organisations
set name = case when name = 'Demo Co (DEMO DATA)' then 'My Organisation' else name end,
    industry = case when industry like '%(demo)%' then null else industry end
where is_demo;

drop function if exists public.create_demo_org();
alter table public.organisations drop column is_demo;
