import type { BaselineSource, Confidence, Flag, FlagThresholds } from "./types";

export const DEFAULT_THRESHOLDS: FlagThresholds = {
  scale_min_roi: 1,
  fix_max_human_touch_rate: 0.2,
  fix_healthy_volume_ratio: 0.5,
  kill_min_days_live: 90,
  kill_max_volume_ratio: 0.3,
  cost_per_run_spike_pct: 0.25,
};

export function resolveThresholds(overrides?: Partial<FlagThresholds> | null): FlagThresholds {
  const out = { ...DEFAULT_THRESHOLDS };
  for (const [k, v] of Object.entries(overrides ?? {})) {
    if (typeof v === "number" && Number.isFinite(v)) out[k as keyof FlagThresholds] = v;
  }
  return out;
}

export const MIN_COVERAGE_FOR_MEDIUM = 0.8;

/**
 * 'medium' needs a measured baseline and run data on ≥ 80% of days since go-live.
 * 'high' is reserved for control-group / staggered-rollout methods (not in the MVP).
 */
export function decideConfidence(
  baselineSource: BaselineSource | null,
  coverage: number | null,
): Confidence {
  if (baselineSource === "measured" && coverage !== null && coverage >= MIN_COVERAGE_FOR_MEDIUM) {
    return "medium";
  }
  return "low";
}

export interface FlagParams {
  isLive: boolean;
  roi: number | null;
  net: number;
  daysLive: number;
  humanTouchRate: number | null;
  /** Trailing-30-day observed volume ÷ baseline monthly volume; null when unknown. */
  volumeRatio: number | null;
  realisedMonthlyValue: number | null;
  predictedMonthlyValue: number | null;
}

/**
 * Checked in order kill → fix → scale → watch, so a failing deployment is never
 * told to scale and a high-touch one is fixed before it is scaled.
 */
export function decideFlag(p: FlagParams, t: FlagThresholds): { flag: Flag; reasons: string[] } {
  if (!p.isLive) return { flag: "watch", reasons: ["Not live yet"] };

  if (
    p.daysLive > t.kill_min_days_live &&
    p.net < 0 &&
    p.volumeRatio !== null &&
    p.volumeRatio < t.kill_max_volume_ratio
  ) {
    return {
      flag: "kill",
      reasons: [
        `Live ${p.daysLive} days (> ${t.kill_min_days_live})`,
        "Net return is negative",
        `Volume is ${pct(p.volumeRatio)} of baseline (< ${pct(t.kill_max_volume_ratio)})`,
      ],
    };
  }

  const fixReasons: string[] = [];
  if (p.humanTouchRate !== null && p.humanTouchRate > t.fix_max_human_touch_rate) {
    fixReasons.push(
      `Human-touch rate ${pct(p.humanTouchRate)} (> ${pct(t.fix_max_human_touch_rate)})`,
    );
  }
  if (p.net < 0 && p.volumeRatio !== null && p.volumeRatio >= t.fix_healthy_volume_ratio) {
    fixReasons.push(
      `Net return is negative despite healthy volume (${pct(p.volumeRatio)} of baseline)`,
    );
  }
  if (fixReasons.length) return { flag: "fix", reasons: fixReasons };

  if (p.roi !== null && p.roi > t.scale_min_roi) {
    if (p.predictedMonthlyValue === null) {
      return {
        flag: "scale",
        reasons: [`ROI ${p.roi.toFixed(2)} (> ${t.scale_min_roi})`, "No predicted value to compare"],
      };
    }
    if (p.realisedMonthlyValue !== null && p.realisedMonthlyValue >= p.predictedMonthlyValue) {
      return {
        flag: "scale",
        reasons: [`ROI ${p.roi.toFixed(2)} (> ${t.scale_min_roi})`, "Realised value ≥ predicted"],
      };
    }
  }

  return { flag: "watch", reasons: ["No scale, fix or kill condition met"] };
}

function pct(x: number): string {
  return `${Math.round(x * 1000) / 10}%`;
}
