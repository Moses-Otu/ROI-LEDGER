export type RunStatus = "success" | "failed" | "needs_human";
export type Confidence = "low" | "medium" | "high";
export type Flag = "scale" | "fix" | "kill" | "watch";
export type BaselineSource = "measured" | "reconstructed" | "estimate";
export type CostCategory =
  | "build"
  | "setup"
  | "training"
  | "licence"
  | "tokens"
  | "hosting"
  | "tooling"
  | "maintenance"
  | "other";

/** Dates are 'YYYY-MM-DD' (UTC calendar days); run timestamps are ISO strings. */
export interface RoiDeployment {
  status: "planned" | "live" | "paused" | "retired";
  goLiveDate: string | null;
  predictedMonthlyValue: number | null;
  predictedMonthlyCost: number | null;
}

export interface RoiBaseline {
  volumePerMonth: number;
  minutesPerTask: number;
  loadedHourlyRate: number;
  errorRate: number | null;
  /** Error rate with the AI in place. Needed with errorRate and costPerError for error impact. */
  aiErrorRate: number | null;
  costPerError: number | null;
  source: BaselineSource;
}

export interface RoiRun {
  startedAt: string;
  status: RunStatus;
  tokenCost: number | null;
}

export interface RoiCostEntry {
  category: CostCategory;
  isOneOff: boolean;
  amount: number;
  periodStart: string;
  periodEnd: string;
}

export interface RoiHumanTime {
  periodStart: string;
  periodEnd: string;
  minutes: number;
  hourlyRate: number | null;
}

export interface FlagThresholds {
  scale_min_roi: number;
  fix_max_human_touch_rate: number;
  fix_healthy_volume_ratio: number;
  kill_min_days_live: number;
  kill_max_volume_ratio: number;
  cost_per_run_spike_pct: number;
}

export interface RoiOrg {
  currency: string;
  defaultLoadedHourlyRate: number;
  flagThresholds?: Partial<FlagThresholds> | null;
}

export interface RoiInput {
  asOf: string;
  org: RoiOrg;
  deployment: RoiDeployment;
  baseline: RoiBaseline | null;
  runs: RoiRun[];
  costEntries: RoiCostEntry[];
  humanTime: RoiHumanTime[];
}

export interface Explanation {
  label: string;
  value: number | string | null;
  formula: string;
  inputs: Record<string, number | string | boolean | null>;
  notes: string[];
}

export type KpiKey =
  | "cost_one_off"
  | "cost_running"
  | "cost_human"
  | "cost_total"
  | "value_total"
  | "net"
  | "roi"
  | "payback_date"
  | "cost_per_successful_run"
  | "success_rate"
  | "human_touch_rate"
  | "confidence"
  | "flag";

export interface SeriesPoint {
  date: string;
  cost: number;
  value: number;
  cumCost: number;
  cumValue: number;
}

export interface RoiResult {
  asOf: string;
  currency: string;
  costOneOff: number;
  costRunning: number;
  costHuman: number;
  costTotal: number;
  valueTotal: number;
  net: number;
  roi: number | null;
  paybackDate: string | null;
  paybackProjected: boolean;
  costPerSuccessfulRun: number | null;
  successRate: number | null;
  humanTouchRate: number | null;
  confidence: Confidence;
  flag: Flag;
  runCounts: {
    total: number;
    success: number;
    failed: number;
    needsHuman: number;
    /** success + needs_human: work that got done. Human effort is already on the cost side. */
    completed: number;
    /** Completed tasks estimated from the baseline for weeks with no run data. */
    estimatedCompleted: number;
  };
  coverage: number | null;
  daysLive: number;
  realisedMonthlyValue: number | null;
  volumeRatio: number | null;
  weeklyCostPerRun: { current: number | null; previous: number | null };
  series: SeriesPoint[];
  explain: Record<KpiKey, Explanation>;
  /** Everything used in the calculation; stored on the snapshot. */
  inputs: Record<string, unknown>;
}
