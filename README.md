# AI ROI Ledger

Tells a company whether each AI deployment (agent, automation workflow, AI tool) is paying for itself. For every deployment it shows cost, value against a pre-AI baseline, net return, ROI, payback date, cost per completed run, and a **scale / fix / kill / watch** flag. Every number can be expanded to show its inputs and formula.

This MVP covers post-deployment measurement. Deployments are self-contained, so a later opportunity map can add `use_cases` and `tasks` tables plus a `deployment_use_cases` join table without changing what exists.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui (Base UI) · Supabase (Postgres, Auth, RLS) · Recharts · zod · Vitest · Vercel Cron.

## Core rules the code enforces

| Rule | Where |
|---|---|
| Metadata only: no prompt or output content is stored | `lib/ingest/schemas.ts` rejects content-like metadata keys. Langfuse is queried without the `io` field group; n8n with `includeData=false`. |
| Multi-tenant, RLS from day one | Every table has `org_id` (set from the parent by trigger). Policies are in `supabase/migrations/…_rls.sql`. |
| Human time is counted once | All human time is **cost**. Value is the **full** baseline time per completed task. See `lib/roi/calculate.ts` and its tests. |
| Every number is explainable | `calculateRoi()` returns an `explain` entry for each KPI. It is stored in `roi_snapshots.inputs` and shown in the drawer. |
| Currency per organisation | `organisations.currency` (default NGN). Amounts are `numeric` and rounded only at output. |
| Secrets stay server-side | Connector credentials and webhook secrets are AES-256-GCM encrypted (`ENCRYPTION_KEY`). Column grants stop browser roles reading them. Ingest keys are stored as SHA-256 hashes. |

## How ROI is calculated

`lib/roi/` is pure TypeScript with no I/O. It builds **one daily series** of cost and value from the earliest data point to `as_of`, then derives everything from that series. As a result, the totals, the payback date and the chart always agree.

- **cost_one_off**: one-off cost entries, counted in full on their date (build costs before go-live included).
- **cost_running**: per-run token cost plus recurring entries prorated by day. A `tokens` cost entry is skipped on days already covered by per-run token cost (from the first to the last run that carried a cost). Per-run wins.
- **cost_human**: minutes ÷ 60 × rate. The rate falls back from the log, to the baseline, to the org default.
- **value_total**: completed runs × (minutes per task ÷ 60 × loaded rate), plus (baseline error rate − AI error rate) × cost per error when all three are known.
  - Completed means `success` plus `needs_human`. The human's effort is already on the cost side.
  - Any 7-day window since go-live with no runs falls back to baseline volume × the observed completion rate. This is flagged, and it lowers confidence.
- **net** = value − cost. **roi** = net ÷ cost.
- **payback**: the first day cumulative value ≥ cumulative cost. If it hasn't happened yet, it is projected from the trailing 30-day net rate (`payback_projected = true`).
- **confidence**:
  - `medium`: the baseline is *measured* and run data covers at least 80% of days since go-live.
  - `low`: otherwise.
  - `high`: reserved for control-group methods.
- **flag**: checked in order kill → fix → scale → watch. Thresholds are per org, in Settings.
  - **kill**: live > 90 days, net < 0, and trailing-30-day volume < 30% of baseline.
  - **fix**: human-touch rate > 20%, or net < 0 with volume ≥ 50% of baseline.
  - **scale**: ROI > 1 and realised monthly value ≥ predicted (if a prediction exists).
  - **watch**: none of the above.

Snapshots are written daily by cron, after every ingest, and by the **Recalculate** button. The deployment page computes the same figures live.

## Local setup

Prerequisites: Node 22+, Docker Desktop (for the local Supabase stack).

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the local Supabase stack. This project uses ports **554xx** so it doesn't collide with other local Supabase projects on the default 543xx:

   ```bash
   npx supabase start
   ```

3. Create `.env.local` from `.env.example`.
   - Copy the API URL, anon/publishable key and service-role/secret key that `supabase start` prints.
   - Generate an encryption key:

     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
     ```

4. Run the app and the tests:

   ```bash
   npm run dev
   ```

   ```bash
   npm test
   ```

5. Open http://localhost:3000 and sign in with any email. Locally, magic-link emails land in Mailpit at http://127.0.0.1:55424.

6. On the onboarding screen you can create your own organisation, or click **Explore with demo data**. That creates a separate, clearly labelled *Demo Co (DEMO DATA)* org with six months of fake data for a "Procurement assistant". Delete it in **Settings → Demo data**: one click, cascading delete.

`npm run db:reset` re-applies all migrations to the local database. **It wipes local data.**

## Supabase setup (hosted)

1. Create a project. On the free tier this has no cost; paid tiers do.
2. Link the project and push the migrations:

   ```bash
   npx supabase link --project-ref <your-project-ref>
   ```

   ```bash
   npx supabase db push --linked
   ```

3. Configure **Authentication → URL configuration**:
   - Site URL: your app URL.
   - Redirect URLs: add `https://<your-domain>/auth/confirm`.
4. Email: the default magic-link template works (PKCE `?code=`). For production volumes, configure your own SMTP.
5. Copy the API URL, anon/publishable key and service-role/secret key into your environment.

## Deploy to Vercel

1. Import the repo into Vercel (framework: Next.js).
2. Set the environment variables from `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`, `ENCRYPTION_KEY`
3. `vercel.json` schedules `GET /api/cron/sync` daily at 03:00 UTC. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set.
4. The cron route allows up to 300 s (`maxDuration`). Check your plan's function limits if you have many connectors.

Keep `ENCRYPTION_KEY` safe: losing it makes stored connector credentials and webhook secrets unreadable, and you'd have to re-enter them.

## Getting data in

Every write is idempotent (upsert on `external_id`), so re-running anything is safe.

### 1. Push API

Create a key in **Settings → Ingest keys**; it's shown once. Send it as `x-ingest-key`.

| Endpoint | Body |
|---|---|
| `POST /api/ingest/runs` | `{ "records": [ { deployment_ref, external_id, started_at, finished_at?, status, token_cost?, tokens_in?, tokens_out?, model?, metadata? } ] }` |
| `POST /api/ingest/costs` | `{ "records": [ { deployment_ref, category, is_one_off, amount, period_start, period_end, external_id?, notes? } ] }` |
| `POST /api/ingest/human-time` | `{ "records": [ { deployment_ref, period_start, period_end, activity, minutes, hourly_rate?, logged_by?, external_id? } ] }` |

- **Deployment matching:** `deployment_id` (uuid) or `deployment_ref`. A ref matches the deployment id or any value in its external refs (n8n workflow id, Langfuse tag, OpenRouter key label).
- **Batch limit:** 500 records per request.
- **Response:** `{ received, written, errors: [{ index, error }] }`. Valid records are written even if others fail.
- **Status values:** `success`, `failed` or `needs_human`.
- **Costs and human time:** without an `external_id`, a stable id is derived from the content.
- **Metadata:** flat primitives only. Keys like `prompt`, `output` or `messages` are rejected.

**TypeScript.** Report a run at the end of an agent's execution:

```ts
async function reportRun(run: { id: string; startedAt: Date; ok: boolean; needsHuman: boolean; costNgn?: number; model?: string }) {
  await fetch("https://your-ledger.example.com/api/ingest/runs", {
    method: "POST",
    headers: { "content-type": "application/json", "x-ingest-key": process.env.ROI_LEDGER_KEY! },
    body: JSON.stringify({
      records: [{
        deployment_ref: "procuremate",
        external_id: run.id,
        started_at: run.startedAt.toISOString(),
        finished_at: new Date().toISOString(),
        status: !run.ok ? "failed" : run.needsHuman ? "needs_human" : "success",
        token_cost: run.costNgn ?? null,
        model: run.model ?? null,
      }],
    }),
  }).catch(() => {}); // never let reporting break the agent
}
```

**Python:**

```python
import os, datetime, requests

def report_run(run_id: str, started_at: datetime.datetime, status: str, token_cost: float | None = None, model: str | None = None):
    try:
        requests.post(
            "https://your-ledger.example.com/api/ingest/runs",
            headers={"x-ingest-key": os.environ["ROI_LEDGER_KEY"]},
            json={"records": [{
                "deployment_ref": "procuremate",
                "external_id": run_id,
                "started_at": started_at.isoformat(),
                "finished_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "status": status,  # "success" | "failed" | "needs_human"
                "token_cost": token_cost,
                "model": model,
            }]},
            timeout=10,
        )
    except requests.RequestException:
        pass  # never let reporting break the agent
```

### 2. CSV upload

**Import** in the app supports runs, costs and human time.
- Download the template for each type, then upload.
- You see a validated preview before anything is written. Invalid rows are skipped and listed.
- Templates are also available at `/api/templates/{runs|costs|human-time}`.

### 3. Pull connectors

Add connectors in **Settings → Connectors**. Credentials are encrypted at rest and never returned to the browser.
- **Test connection** checks the credentials, and **Sync now** pulls immediately.
- The daily cron syncs every non-paused connector from its cursor: 30 days back on the first sync, then from the last sync with a small overlap.
- 429 and 5xx responses are retried with exponential backoff (honouring `Retry-After`).
- To map data to deployments, edit each deployment's *Data source mapping* (n8n workflow IDs, Langfuse trace tags, OpenRouter key label).

**Langfuse** (checked against the current public OpenAPI spec)
- **Credentials:** public key + secret key (HTTP Basic). Base URL defaults to `https://cloud.langfuse.com`; use `https://us.cloud.langfuse.com` or your self-hosted URL as needed.
- **API used:** `GET /api/public/v2/observations` (cursor pagination), filtered to `GENERATION`s by start time.
- **Field groups:** `core,basic,usage,model,metadata,trace_context`. The `io` group is never requested.
- **Runs:** one run per trace, with generation costs and tokens summed.
- **Mapping:** by trace tag (deployment's *Langfuse trace tags*), or a default deployment for untagged traces.
- **Merging with n8n:** if a generation's metadata has `n8n_execution_id` (the key is configurable), the run is written as `n8n:<id>` and merges with the n8n execution row.
- **Currency:** Langfuse costs are in **USD**, so set **USD → org currency rate** on the connector.

**OpenRouter** (checked against `openrouter.ai/openapi.json`)
- **Credentials:** a **management** key (normal inference keys can't read activity).
- **API used:** `GET /api/v1/keys` maps keys to deployments by label/name. `GET /api/v1/activity?date=…&api_key_hash=…` gives the daily spend.
- **Output:** one recurring `tokens` cost entry per key per day (`openrouter:<hash>:<date>`). OpenRouter exposes no per-request listing here, and activity covers only the last 30 completed UTC days.
- **No double counting:** if Langfuse also reports per-run token cost for the same days, the ROI module drops the OpenRouter entries for those days.
- **Currency:** usage is in USD; set the rate.

**n8n** (checked against `getExecutions` in the n8n public API spec)
- **Credentials:** API key (`X-N8N-API-KEY`), plus your instance URL.
- **API used:** `GET /api/v1/executions?workflowId=…&includeData=false&startedAfter=…` for each mapped workflow.
- **Status mapping:** success → `success`; error, crashed or canceled → `failed`; waiting → `needs_human`. Running and new executions are picked up on a later sync.
- **Older n8n versions:** they may ignore `startedAfter`, so paging also stops at older executions.
- **Matching:** `external_id` is `n8n:<execution id>`, the same key the *Report to ledger* template and Langfuse matching use.

## Outgoing webhooks

Add endpoints in **Settings → Webhooks**. The signing secret is shown once.

| Event | When |
|---|---|
| `deployment.flag_changed` | Today's flag differs from the previous snapshot's |
| `deployment.cost_per_run_spike` | Cost per completed run this week is more than 25% above last week's (the threshold is per org). Sent once per 7 days per deployment. |
| `snapshot.monthly_summary` | On the 1st of each month: totals and per-deployment figures for the org |

- **Body:** `{ id, event, created_at, dedupe_key, data }`.
- **Headers:**
  - `x-signature: sha256=<hex HMAC-SHA256 of the raw body using the secret>`
  - `x-event`
  - `x-delivery-id`
- **Retries:** failed deliveries are retried up to 3 times with backoff. Every attempt is logged in `webhook_deliveries` and shown in Settings.
- **Send test** posts a test payload.

Verifying in Node:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
const ok = expected.length === sig.length && timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
```

## n8n companion templates

These live in `public/n8n-templates/` and are served at `/n8n-templates/*.json`; they can also be downloaded from **Settings → Templates**. Import them in n8n with **Workflows → Import from file**. They sit at the edges only; the ledger never depends on n8n.

All three templates need a **Header Auth** credential in n8n: Name `x-ingest-key`, Value = an ingest key from the ledger. Replace `YOUR-LEDGER-DOMAIN` in the HTTP Request nodes.

1. **Report to ledger** (`report-to-ledger.json`)
   - A sub-workflow. At the end of any workflow, add an **Execute Workflow** node that calls it with:
     - `deployment_ref`
     - `execution_id = {{ $execution.id }}`: from the **calling** workflow.
     - `status`: `success`, `failed` or `needs_human`.
     - `started_at`, `finished_at`, `token_cost`, `model`: optional.
   - It posts one run with `external_id = n8n:<execution id>` and retries 3 times. Errors don't fail the caller.
2. **Weekly human-time check-in** (`weekly-human-time.json`)
   - Runs every Monday at 09:00. Edit the list in **Deployments and last week**: deployment ref, name, owner email.
   - It emails each owner a short form (review, fixes, escalations, maintenance, in minutes) using **Send Email → Send and Wait** with a custom form. It waits up to 3 days.
   - Answers are posted to `/api/ingest/human-time` with stable ids, so a re-run updates instead of duplicating.
   - Needs an SMTP credential. You can swap the email node for Slack or WhatsApp *send and wait* nodes.
3. **Alerts and monthly report** (`alerts-and-monthly-report.json`)
   - Receives the ledger's webhooks. Copy its production URL into **Settings → Webhooks**.
   - Paste the signing secret into **Compute HMAC**. It verifies `x-signature` and replies 401 if the signature doesn't match.
   - It formats flag changes, cost spikes and the monthly summary, and emails them to a configured recipient. A Slack node is included, disabled.

TODOs in the templates (left as notes on the nodes rather than guessed):
- **Weekly check-in:** after import, confirm the From/To fields of the *Send and Wait* email node and that form answers arrive under `$json.data`. Both can differ between n8n versions.
- **Alerts:** the HMAC is computed over `JSON.stringify($json.body)`, which reproduces the ledger's exact body. If your n8n version changes key order, switch the Webhook to *Raw Body* and hash that instead.

## Project layout

```
app/
  (app)/deployments/…        list, detail dashboard, forms (new, edit, baseline, log)
  (app)/import/              CSV import with preview
  (app)/settings/            org, thresholds, connectors, ingest keys, webhooks, templates, demo data
  api/ingest/{runs,costs,human-time}/   push API
  api/cron/sync/             daily sync + recalc + webhooks
  api/templates/[kind]/      CSV templates
  login/, auth/, onboarding/
lib/
  roi/          pure ROI module + tests
  ingest/       zod schemas, deployment matching, idempotent writes, CSV
  connectors/   langfuse, openrouter, n8n, sync, retry helper + tests
  webhooks/     events, HMAC signing, delivery + tests
  ledger/       load data → calculate → snapshot; daily pipeline
  crypto/       AES-256-GCM for secrets
supabase/migrations/   schema, RLS, ingest functions, views, demo-data generator
public/n8n-templates/  importable n8n workflows
```

## Known limitations and assumptions

- **Dates** are bucketed by UTC day.
- **Users and orgs:** a user can belong to several orgs (switcher in the header). Inviting members isn't built yet; add rows to `org_members` for now.
- **FX:** USD → org-currency conversion uses one fixed rate per connector. Historical rates are not modelled.
- **Langfuse runs at the sync boundary:** a trace whose generations straddle a sync window can be split. The 2-hour overlap makes this rare for ~3-minute runs.
- **Webhook URLs:** in production they must be public `https://` URLs.
