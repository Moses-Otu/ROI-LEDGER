import { DAYS_PER_MONTH, daysInclusive, fromDay, toDay } from "./dates";
import { decideConfidence, decideFlag, MIN_COVERAGE_FOR_MEDIUM, resolveThresholds } from "./flags";
import { currencyDecimals, roundTo } from "./money";
import type { Explanation, KpiKey, RoiInput, RoiResult, SeriesPoint } from "./types";

/** Runs are bucketed into 7-day windows from go-live to judge data coverage. */
const COVERAGE_BUCKET_DAYS = 7;
const TRAILING_DAYS = 30;

/**
 * Computes ROI for one deployment as of a date.
 *
 * Everything is built from one daily series (cost and value per day) so the
 * totals, the payback date and the chart can never disagree.
 *
 * Human time is counted once: all of it is cost. Value is the full baseline
 * time saved per completed task (success + needs_human).
 */
export function calculateRoi(input: RoiInput): RoiResult {
  const { org, deployment, baseline } = input;
  const currency = org.currency;
  const dp = currencyDecimals(currency);
  const money = (x: number) => roundTo(x, dp);
  const thresholds = resolveThresholds(org.flagThresholds);
  const asOf = toDay(input.asOf);
  const notes: Partial<Record<KpiKey, string[]>> = {};
  const note = (k: KpiKey, msg: string) => (notes[k] ??= []).push(msg);

  const runs = input.runs
    .map((r) => ({ ...r, day: toDay(r.startedAt) }))
    .filter((r) => r.day <= asOf);
  const costs = input.costEntries
    .map((c) => ({ ...c, start: toDay(c.periodStart), end: toDay(c.periodEnd) }))
    .filter((c) => c.start <= asOf);
  const human = input.humanTime
    .map((h) => ({ ...h, start: toDay(h.periodStart), end: toDay(h.periodEnd) }))
    .filter((h) => h.start <= asOf);

  const goLive = deployment.goLiveDate ? toDay(deployment.goLiveDate) : null;
  let earliest = asOf;
  for (const d of [
    ...runs.map((r) => r.day),
    ...costs.map((c) => c.start),
    ...human.map((h) => h.start),
  ]) {
    if (d < earliest) earliest = d;
  }
  if (goLive !== null && goLive < earliest) earliest = goLive;
  // Measurement period (value, coverage): go-live → as_of. Costs can start earlier.
  const periodStart = goLive ?? earliest;
  const daysLive = daysInclusive(periodStart, asOf);
  const isLive = goLive !== null && goLive <= asOf && deployment.status !== "planned";

  const n = daysInclusive(earliest, asOf);
  const idx = (day: number) => day - earliest;
  const oneOff = new Float64Array(n);
  const running = new Float64Array(n);
  const humanCost = new Float64Array(n);
  const value = new Float64Array(n);
  const runsPerDay = new Uint32Array(n);
  const completedPerDay = new Uint32Array(n);

  // --- Runs --------------------------------------------------------------
  let success = 0;
  let failed = 0;
  let needsHuman = 0;
  let perRunTokenCost = 0;
  let tokenSpanStart: number | null = null;
  let tokenSpanEnd: number | null = null;
  for (const r of runs) {
    const i = idx(r.day);
    runsPerDay[i]++;
    if (r.status === "success") success++;
    else if (r.status === "failed") failed++;
    else needsHuman++;
    if (r.status !== "failed") completedPerDay[i]++;
    if (r.tokenCost !== null && r.tokenCost !== undefined) {
      running[i] += r.tokenCost;
      perRunTokenCost += r.tokenCost;
      if (tokenSpanStart === null || r.day < tokenSpanStart) tokenSpanStart = r.day;
      if (tokenSpanEnd === null || r.day > tokenSpanEnd) tokenSpanEnd = r.day;
    }
  }
  const totalRuns = success + failed + needsHuman;
  const completed = success + needsHuman;

  // --- Cost entries --------------------------------------------------------
  // Token cost entries are dropped for days already covered by per-run token
  // cost (the span from the first to the last run that carried a cost): per-run wins.
  let oneOffTotal = 0;
  let recurringEntries = 0;
  let tokenEntriesCounted = 0;
  let tokenEntriesExcluded = 0;
  const byCategory: Record<string, number> = {};
  for (const c of costs) {
    if (c.isOneOff && c.category !== "tokens") {
      oneOff[idx(c.start)] += c.amount;
      oneOffTotal += c.amount;
      byCategory[c.category] = (byCategory[c.category] ?? 0) + c.amount;
      continue;
    }
    const span = daysInclusive(c.start, c.end);
    const daily = c.amount / span;
    const last = Math.min(c.end, asOf);
    let counted = 0;
    for (let d = c.start; d <= last; d++) {
      const coveredByRuns =
        c.category === "tokens" &&
        tokenSpanStart !== null &&
        tokenSpanEnd !== null &&
        d >= tokenSpanStart &&
        d <= tokenSpanEnd;
      if (coveredByRuns) {
        tokenEntriesExcluded += daily;
      } else {
        running[idx(d)] += daily;
        counted += daily;
      }
    }
    if (c.category === "tokens") tokenEntriesCounted += counted;
    else recurringEntries += counted;
    byCategory[c.category] = (byCategory[c.category] ?? 0) + counted;
  }

  // --- Human time (cost side only) -----------------------------------------
  const rateSources = { log: 0, baseline: 0, org: 0 };
  let humanMinutes = 0;
  for (const h of human) {
    let rate: number;
    if (h.hourlyRate !== null && h.hourlyRate !== undefined) {
      rate = h.hourlyRate;
      rateSources.log++;
    } else if (baseline) {
      rate = baseline.loadedHourlyRate;
      rateSources.baseline++;
    } else {
      rate = org.defaultLoadedHourlyRate;
      rateSources.org++;
    }
    const span = daysInclusive(h.start, h.end);
    const last = Math.min(h.end, asOf);
    for (let d = h.start; d <= last; d++) {
      humanCost[idx(d)] += ((h.minutes / 60) * rate) / span;
      humanMinutes += h.minutes / span;
    }
  }

  // --- Value -----------------------------------------------------------------
  const timeValuePerTask = baseline ? (baseline.minutesPerTask / 60) * baseline.loadedHourlyRate : 0;
  const errorRatesKnown =
    !!baseline &&
    baseline.errorRate !== null &&
    baseline.aiErrorRate !== null &&
    baseline.costPerError !== null;
  const errorValuePerTask = errorRatesKnown
    ? (baseline!.errorRate! - baseline!.aiErrorRate!) * baseline!.costPerError!
    : 0;
  const valuePerTask = timeValuePerTask + errorValuePerTask;

  for (let i = 0; i < n; i++) value[i] = completedPerDay[i] * valuePerTask;

  // Weeks with no run data fall back to baseline volume × the observed
  // completion ratio (or 1 with no runs at all). This lowers confidence.
  const completionRatio = totalRuns > 0 ? completed / totalRuns : 1;
  let coveredDays = 0;
  let fallbackDays = 0;
  let estimatedCompleted = 0;
  if (isLive) {
    for (let b = periodStart; b <= asOf; b += COVERAGE_BUCKET_DAYS) {
      const bEnd = Math.min(b + COVERAGE_BUCKET_DAYS - 1, asOf);
      let bucketRuns = 0;
      for (let d = b; d <= bEnd; d++) bucketRuns += runsPerDay[idx(d)];
      const len = daysInclusive(b, bEnd);
      if (bucketRuns > 0) {
        coveredDays += len;
      } else if (baseline) {
        fallbackDays += len;
        const perDay = (baseline.volumePerMonth / DAYS_PER_MONTH) * completionRatio;
        for (let d = b; d <= bEnd; d++) value[idx(d)] += perDay * valuePerTask;
        estimatedCompleted += perDay * len;
      }
    }
  }
  const coverage = isLive && daysLive > 0 ? coveredDays / daysLive : null;

  // --- Totals from the series -------------------------------------------------
  const sum = (a: Float64Array) => a.reduce((s, x) => s + x, 0);
  const costOneOffRaw = sum(oneOff);
  const costRunningRaw = sum(running);
  const costHumanRaw = sum(humanCost);
  const costTotalRaw = costOneOffRaw + costRunningRaw + costHumanRaw;
  const valueTotalRaw = sum(value);
  const netRaw = valueTotalRaw - costTotalRaw;

  const series: SeriesPoint[] = [];
  let cumCost = 0;
  let cumValue = 0;
  let paybackDay: number | null = null;
  for (let i = 0; i < n; i++) {
    const dayCost = oneOff[i] + running[i] + humanCost[i];
    cumCost += dayCost;
    cumValue += value[i];
    if (paybackDay === null && cumCost > 0 && cumValue >= cumCost) paybackDay = earliest + i;
    series.push({
      date: fromDay(earliest + i),
      cost: money(dayCost),
      value: money(value[i]),
      cumCost: money(cumCost),
      cumValue: money(cumValue),
    });
  }

  // --- Payback ---------------------------------------------------------------
  const trailingLen = Math.min(TRAILING_DAYS, n);
  let trailingNet = 0;
  let trailingRuns = 0;
  for (let i = n - trailingLen; i < n; i++) {
    trailingNet += value[i] - (oneOff[i] + running[i] + humanCost[i]);
    trailingRuns += runsPerDay[i];
  }
  const trailingNetPerDay = trailingLen > 0 ? trailingNet / trailingLen : 0;
  let paybackProjected = false;
  if (paybackDay === null && netRaw < 0 && trailingNetPerDay > 0) {
    paybackDay = asOf + Math.ceil(-netRaw / trailingNetPerDay);
    paybackProjected = true;
    note("payback_date", "Projected from the trailing 30-day net rate; not yet reached.");
  } else if (paybackDay === null) {
    note("payback_date", "Not reached, and the trailing 30-day net rate is not positive.");
  }

  // --- Rates -------------------------------------------------------------------
  const roiRaw = costTotalRaw > 0 ? netRaw / costTotalRaw : null;
  const costPerRun = completed > 0 ? costTotalRaw / completed : null;
  const successRate = totalRuns > 0 ? success / totalRuns : null;
  const humanTouchRate = totalRuns > 0 ? needsHuman / totalRuns : null;
  const monthsLive = daysLive / DAYS_PER_MONTH;
  const realisedMonthlyValue = isLive && monthsLive > 0 ? valueTotalRaw / monthsLive : null;
  // Volume ratio uses observed runs only. With no run data at all it is unknown,
  // so the kill rule can't fire on missing data.
  const volumeRatio =
    baseline && baseline.volumePerMonth > 0 && totalRuns > 0 && trailingLen > 0
      ? (trailingRuns * (DAYS_PER_MONTH / trailingLen)) / baseline.volumePerMonth
      : null;

  const weekly = (fromIdx: number, toIdx: number) => {
    let c = 0;
    let runsDone = 0;
    for (let i = Math.max(0, fromIdx); i <= toIdx; i++) {
      c += oneOff[i] + running[i] + humanCost[i];
      runsDone += completedPerDay[i];
    }
    return runsDone > 0 ? money(c / runsDone) : null;
  };
  const weeklyCostPerRun = {
    current: n >= 7 ? weekly(n - 7, n - 1) : null,
    previous: n >= 14 ? weekly(n - 14, n - 8) : null,
  };

  const confidence = decideConfidence(baseline?.source ?? null, coverage);
  const { flag, reasons } = decideFlag(
    {
      isLive,
      roi: roiRaw,
      net: netRaw,
      daysLive,
      humanTouchRate,
      volumeRatio,
      realisedMonthlyValue,
      predictedMonthlyValue: deployment.predictedMonthlyValue,
    },
    thresholds,
  );

  // --- Notes -------------------------------------------------------------------
  if (!baseline) note("value_total", "No baseline recorded, so value is 0. Add a baseline.");
  if (baseline && !errorRatesKnown)
    note("value_total", "Error impact skipped: needs baseline error rate, AI error rate and cost per error.");
  if (fallbackDays > 0)
    note(
      "value_total",
      `${fallbackDays} day(s) had no run data; value there is estimated from baseline volume.`,
    );
  if (tokenEntriesExcluded > 0)
    note(
      "cost_running",
      `${money(tokenEntriesExcluded)} of token cost entries skipped: per-run token cost already covers those days.`,
    );
  if (rateSources.baseline + rateSources.org > 0)
    note(
      "cost_human",
      `${rateSources.baseline + rateSources.org} log(s) had no rate and used the ${rateSources.baseline ? "baseline" : "org default"} rate.`,
    );
  if (!baseline) note("confidence", "No baseline.");
  else if (baseline.source !== "measured")
    note("confidence", `Baseline is ${baseline.source}, not measured.`);
  if (coverage !== null && coverage < MIN_COVERAGE_FOR_MEDIUM)
    note("confidence", `Run data covers ${Math.round(coverage * 100)}% of days since go-live (need 80%).`);
  note("confidence", "'high' is reserved for control-group or staggered-rollout methods.");
  for (const r of reasons) note("flag", r);
  note("cost_per_successful_run", "Completed runs = success + needs_human (human effort is on the cost side).");

  const costOneOff = money(costOneOffRaw);
  const costRunning = money(costRunningRaw);
  const costHuman = money(costHumanRaw);
  const costTotal = money(costTotalRaw);
  const valueTotal = money(valueTotalRaw);
  const net = money(netRaw);
  const roi = roiRaw === null ? null : roundTo(roiRaw, 4);
  const paybackDate = paybackDay === null ? null : fromDay(paybackDay);
  const costPerSuccessfulRun = costPerRun === null ? null : money(costPerRun);
  const rate4 = (x: number | null) => (x === null ? null : roundTo(x, 4));

  const ex = (
    label: string,
    v: number | string | null,
    formula: string,
    inputs: Explanation["inputs"],
    key: KpiKey,
  ): Explanation => ({ label, value: v, formula, inputs, notes: notes[key] ?? [] });

  const explain: Record<KpiKey, Explanation> = {
    cost_one_off: ex("One-off cost", costOneOff, "Σ one-off cost entries (build, setup, training…)",
      { ...roundAll(byCategoryOneOff(costs), dp) }, "cost_one_off"),
    cost_running: ex("Running cost", costRunning,
      "per-run token cost + recurring entries prorated by day up to as-of",
      {
        per_run_token_cost: money(perRunTokenCost),
        recurring_entries: money(recurringEntries),
        token_entries_counted: money(tokenEntriesCounted),
        token_entries_skipped: money(tokenEntriesExcluded),
      }, "cost_running"),
    cost_human: ex("Human cost", costHuman, "Σ minutes ÷ 60 × hourly rate (log → baseline → org default)",
      { minutes: roundTo(humanMinutes, 1), logs: human.length }, "cost_human"),
    cost_total: ex("Total cost", costTotal, "one-off + running + human",
      { cost_one_off: costOneOff, cost_running: costRunning, cost_human: costHuman }, "cost_total"),
    value_total: ex("Value", valueTotal,
      "completed tasks × (minutes per task ÷ 60 × loaded rate + (baseline error rate − AI error rate) × cost per error)",
      {
        completed_runs: completed,
        estimated_tasks: roundTo(estimatedCompleted, 1),
        minutes_per_task: baseline?.minutesPerTask ?? null,
        loaded_hourly_rate: baseline?.loadedHourlyRate ?? null,
        value_per_task: money(valuePerTask),
        error_value_per_task: money(errorValuePerTask),
      }, "value_total"),
    net: ex("Net return", net, "value − total cost", { value_total: valueTotal, cost_total: costTotal }, "net"),
    roi: ex("ROI", roi, "net ÷ total cost", { net, cost_total: costTotal }, "roi"),
    payback_date: ex("Payback", paybackDate,
      "first day cumulative value ≥ cumulative cost; else as-of + (−net ÷ trailing 30-day net per day)",
      { projected: paybackProjected, trailing_net_per_day: money(trailingNetPerDay), net }, "payback_date"),
    cost_per_successful_run: ex("Cost per completed run", costPerSuccessfulRun,
      "total cost ÷ completed runs", { cost_total: costTotal, completed_runs: completed }, "cost_per_successful_run"),
    success_rate: ex("Success rate", rate4(successRate), "success ÷ total runs",
      { success, total_runs: totalRuns }, "success_rate"),
    human_touch_rate: ex("Human-touch rate", rate4(humanTouchRate), "needs_human ÷ total runs",
      { needs_human: needsHuman, total_runs: totalRuns }, "human_touch_rate"),
    confidence: ex("Confidence", confidence, "medium if baseline measured and coverage ≥ 80%, else low",
      { baseline_source: baseline?.source ?? null, coverage: rate4(coverage) }, "confidence"),
    flag: ex("Flag", flag, "kill → fix → scale → watch (thresholds per org)",
      {
        roi,
        net,
        days_live: daysLive,
        human_touch_rate: rate4(humanTouchRate),
        volume_ratio: rate4(volumeRatio),
        realised_monthly_value: realisedMonthlyValue === null ? null : money(realisedMonthlyValue),
        predicted_monthly_value: deployment.predictedMonthlyValue,
      }, "flag"),
  };

  return {
    asOf: input.asOf,
    currency,
    costOneOff,
    costRunning,
    costHuman,
    costTotal,
    valueTotal,
    net,
    roi,
    paybackDate,
    paybackProjected,
    costPerSuccessfulRun,
    successRate: rate4(successRate),
    humanTouchRate: rate4(humanTouchRate),
    confidence,
    flag,
    runCounts: {
      total: totalRuns,
      success,
      failed,
      needsHuman,
      completed,
      estimatedCompleted: roundTo(estimatedCompleted, 1),
    },
    coverage: rate4(coverage),
    daysLive,
    realisedMonthlyValue: realisedMonthlyValue === null ? null : money(realisedMonthlyValue),
    volumeRatio: rate4(volumeRatio),
    weeklyCostPerRun,
    series,
    explain,
    inputs: {
      as_of: input.asOf,
      currency,
      period_start: fromDay(periodStart),
      series_start: fromDay(earliest),
      go_live_date: deployment.goLiveDate,
      status: deployment.status,
      baseline,
      thresholds,
      counts: {
        runs: totalRuns,
        cost_entries: costs.length,
        human_time_logs: human.length,
      },
      cost_by_category: roundAll(byCategory, dp),
      coverage: rate4(coverage),
      fallback_days: fallbackDays,
      trailing_days: trailingLen,
      weekly_cost_per_run: weeklyCostPerRun,
      explain,
    },
  };
}

function byCategoryOneOff(costs: { category: string; isOneOff: boolean; amount: number }[]) {
  const out: Record<string, number> = {};
  for (const c of costs) {
    if (c.isOneOff && c.category !== "tokens") out[c.category] = (out[c.category] ?? 0) + c.amount;
  }
  return out;
}

function roundAll(o: Record<string, number>, dp: number): Record<string, number> {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, roundTo(v, dp)]));
}
