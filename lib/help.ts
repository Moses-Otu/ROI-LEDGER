/**
 * Help text for every field, shown in the ⓘ popover next to its label.
 * `what`: plain meaning. `example`: a typical entry. `calc`: how it feeds the numbers.
 * Examples use GBP and the same running example so the calculations connect.
 */
export interface HelpEntry {
  what: string;
  example?: string;
  calc?: string;
}

export const HELP = {
  // --- Organisation --------------------------------------------------------
  org_name: { what: "Your company or team name, shown in the header." },
  org_industry: { what: "Optional. Helps when comparing results across teams later.", example: "Logistics" },
  org_currency: {
    what: "The currency every amount is entered and shown in.",
    example: "GBP",
    calc: "Changing it later relabels amounts; it does not convert them. Pick it before entering costs.",
  },
  org_rate: {
    what: "What an hour of staff time costs the business: salary plus overheads (pension, tax, office, IT), roughly salary × 1.3. Used whenever a baseline or time log has no rate of its own.",
    example: "£31,000 salary ÷ 1,800 hours × 1.3 ≈ £22/h. Specialist staff are often £40–£60/h.",
  },
  org_hours: {
    what: "Working hours in a year for one full-time person, after holidays.",
    example: "1,800 (about 37.5 hours × 48 weeks)",
  },

  // --- Deployment ----------------------------------------------------------
  dep_name: { what: "A short name people will recognise.", example: "Knowledge Base Chatbot" },
  dep_type: {
    what: "Agent: the AI decides its own steps or tool calls. Workflow: fixed steps with an AI step inside. Seat tool: per-user licences (Copilot, ChatGPT Team). Custom GPT: an assistant configured in a chat product.",
  },
  dep_status: {
    what: "Planned: not used yet. Live: in daily use (value is counted from the go-live date). Paused or Retired: no longer used.",
    calc: "Flags only apply to Live deployments.",
  },
  dep_task: {
    what: "The work people did by hand before this existed. The baseline describes how long it took.",
    example: "Staff searching policy documents or asking HR and waiting for a reply",
  },
  dep_description: { what: "What it does and how, in a sentence or two, for anyone reading the report." },
  dep_owner: { what: "The person accountable for it and its numbers." },
  dep_owner_contact: { what: "Their email. The weekly time check-in (n8n template) asks this address how much time the team spent on it." },
  dep_go_live: {
    what: "The day people started using it for real.",
    calc: "Value and run coverage are counted from this date. The Kill rule waits 90 days after it. Build costs before it still count.",
  },
  dep_life: {
    what: "How long you expect to use it before it's replaced. For planning; it doesn't change today's figures.",
    example: "24 months",
  },
  dep_pred_value: {
    what: "The monthly value promised in the business case, if there was one.",
    example: "200 questions × 10 min ÷ 60 × £40 = £1,333 a month",
    calc: "The Scale flag needs realised monthly value to reach this. Leave blank if there was no business case.",
  },
  dep_pred_cost: {
    what: "The monthly running cost expected in the business case (hosting, AI usage, people's time).",
    calc: "Shown next to the realised monthly cost under Predicted vs realised.",
  },
  dep_n8n: {
    what: "The ID of the n8n workflow, from its URL after /workflow/. Lets the n8n connector and the Report to ledger template attach runs to this deployment.",
    example: "Ab12Cd34Ef56Gh78",
  },
  dep_lf_tags: { what: "The tag(s) on this deployment's traces in Langfuse. The Langfuse connector uses them to find its AI cost per run." },
  dep_lf_project: { what: "The Langfuse project name, for reference." },
  dep_or_label: { what: "The name of the API key this deployment uses in OpenRouter. The OpenRouter connector pulls that key's daily spend." },

  // --- Baseline ------------------------------------------------------------
  bl_volume: {
    what: "How many times the task was done in a typical month before AI.",
    example: "200 questions a month",
    calc: "If run data is missing for a week, that week's value is estimated from this volume. Also the yardstick for the Fix and Kill volume rules.",
  },
  bl_minutes: {
    what: "Hands-on staff time per task: actual work, not the days it sat waiting. Include everyone involved.",
    example: "6 min searching + 4 min for the person answering = 10",
    calc: "Value per task = minutes ÷ 60 × hourly rate. 10 min at £40/h = £6.67.",
  },
  bl_rate: {
    what: "Loaded hourly cost of the people who did the task (salary plus overheads).",
    example: "£40",
    calc: "Value per task = minutes ÷ 60 × this rate. Also used for human time logged without its own rate.",
  },
  bl_turnaround: {
    what: "How long a task took from request to done, including waiting. Shown for context only.",
    example: "4 hours",
  },
  bl_error_before: {
    what: "Share of tasks that went wrong and needed rework before AI. Leave blank unless you have a source.",
    example: "8",
    calc: "Errors avoided per task = (before − with AI) × cost per error. 8% → 3% at £150 = £7.50 extra value per task.",
  },
  bl_error_ai: {
    what: "Share of tasks that go wrong now, with the AI.",
    example: "3",
    calc: "Needed together with the error rate before and the cost per error, otherwise error savings are skipped.",
  },
  bl_cost_error: {
    what: "What one mistake costs: rework time, write-offs, penalties.",
    example: "£150",
  },
  bl_source: {
    what: "Measured: timed before go-live. Reconstructed: rebuilt afterwards from records and interviews. Estimate: an informed guess.",
    calc: "Confidence can only reach Medium with a Measured baseline.",
  },
  bl_notes: { what: "Where each number came from, so someone else can check it.", example: "Volume: HR inbox Aug–Oct. Minutes: median of 5 staff." },

  // --- Costs ---------------------------------------------------------------
  cost_category: {
    what: "Build, setup, training: getting it live. Licence, tokens, hosting, tooling: running it. Maintenance and other: anything else.",
  },
  cost_kind: {
    what: "One-off: paid once (counted in full on its date). Recurring: covers a period (spread evenly across its days).",
    example: "Build £320 one-off; hosting £20 recurring for 1–31 Oct",
    calc: "A £31 bill for 1–31 Oct counts £1 per day, so mid-month only half is in the totals.",
  },
  cost_amount: { what: "The amount in your organisation's currency, excluding anything already logged elsewhere." },
  cost_start: { what: "One-off: the date it was paid. Recurring: the first day the cost covers." },
  cost_end: { what: "The last day a recurring cost covers. The amount is spread evenly between start and end." },
  cost_notes: { what: "What it was, e.g. invoice or plan name." },

  // --- Human time ----------------------------------------------------------
  ht_period: {
    what: "The week the time was spent in. Defaults to last Monday–Sunday.",
  },
  ht_review: {
    what: "Minutes spent checking the AI's output before it was used.",
    example: "30",
    calc: "All human time is cost: minutes ÷ 60 × rate. 30 min at £40/h = £20. It never reduces value, so nothing is counted twice.",
  },
  ht_fix: { what: "Minutes correcting mistakes the AI made.", example: "10" },
  ht_escalation: { what: "Minutes people spent handling cases the AI couldn't.", example: "15" },
  ht_maintenance: { what: "Minutes keeping it running: updating prompts or documents, credentials, monitoring.", example: "15" },
  ht_rate: {
    what: "Optional hourly cost for this entry. Blank uses the baseline rate, then the organisation default.",
  },
  ht_by: { what: "Who logged it, for reference." },

  // --- Thresholds ----------------------------------------------------------
  th_scale_roi: {
    what: "Scale needs ROI above this. 1 means a 100% return: value is double the cost.",
    example: "1",
  },
  th_fix_touch: {
    what: "Fix when people have to step in on more than this share of runs.",
    example: "20 (%)",
  },
  th_fix_volume: {
    what: "A loss-making deployment counts as Fix (not Kill) when it's used at least this much, as a % of baseline volume.",
    example: "50 (%)",
  },
  th_kill_days: { what: "Kill is only considered after this many days live.", example: "90" },
  th_kill_volume: {
    what: "Kill when it's losing money and used at less than this % of the old volume.",
    example: "30 (%)",
  },
  th_spike: {
    what: "Send a cost-per-run alert when this week's cost per completed run is this much higher than last week's.",
    example: "25 (%)",
  },
} satisfies Record<string, HelpEntry>;

export type HelpKey = keyof typeof HELP;

/** Help for dashboard figures that don't have their own Explain drawer. */
export const STAT_HELP: Record<string, HelpEntry> = {
  total_runs: { what: "Every run recorded: successful, failed and handed to a person." },
  completed: {
    what: "Runs where the work got done: successful plus those a person finished.",
    calc: "Value = completed runs × value per task.",
  },
  failed: { what: "Runs that produced nothing usable. They add cost but no value." },
  coverage: {
    what: "Share of weeks since go-live that have run data.",
    calc: "Weeks without runs are estimated from the baseline volume. Medium confidence needs 80% or more.",
  },
  volume_ratio: {
    what: "Runs in the last 30 days compared with the baseline's monthly volume.",
    example: "150 runs vs a baseline of 200 = 75%",
    calc: "Below 30% after 90 days, with a loss, the flag becomes Kill.",
  },
  estimated_tasks: {
    what: "Tasks estimated from the baseline for weeks with no run data.",
    calc: "They count towards value but lower confidence. Send real runs to replace them.",
  },
  days_live: { what: "Days since the go-live date, including today." },
};
