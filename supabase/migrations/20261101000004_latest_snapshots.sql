-- Latest snapshot per deployment, for the deployments list. security_invoker keeps RLS.
create or replace view public.latest_snapshots
with (security_invoker = true) as
select distinct on (deployment_id) *
from public.roi_snapshots
order by deployment_id, as_of desc;

grant select on public.latest_snapshots to authenticated;
