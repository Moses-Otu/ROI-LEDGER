import { describe, expect, it } from "vitest";
import { calculateRoi } from "./calculate";
import { fromDay, toDay } from "./dates";
import { decideFlag, DEFAULT_THRESHOLDS } from "./flags";
import { roundMoney, roundTo } from "./money";
import type { RoiBaseline, RoiInput, RoiRun } from "./types";

// 10 min per task at 6,000/h → 1,000 of value per completed task.
const baseline: RoiBaseline = {
  volumePerMonth: 300,
  minutesPerTask: 10,
  loadedHourlyRate: 6000,
  errorRate: null,
  aiErrorRate: null,
  costPerError: null,
  source: "measured",
};

function input(overrides: Partial<RoiInput> = {}): RoiInput {
  return {
    asOf: "2026-01-31",
    org: { currency: "NGN", defaultLoadedHourlyRate: 3000 },
    deployment: {
      status: "live",
      goLiveDate: "2026-01-01",
      predictedMonthlyValue: null,
      predictedMonthlyCost: null,
    },
    baseline,
    runs: [],
    costEntries: [],
    humanTime: [],
    ...overrides,
  };
}

/** `perDay` runs every day from start to end inclusive. */
function dailyRuns(
  start: string,
  end: string,
  perDay: number,
  opts: { status?: RoiRun["status"]; tokenCost?: number | null } = {},
): RoiRun[] {
  const out: RoiRun[] = [];
  for (let d = toDay(start); d <= toDay(end); d++) {
    for (let i = 0; i < perDay; i++) {
      out.push({
        startedAt: `${fromDay(d)}T09:00:00Z`,
        status: opts.status ?? "success",
        tokenCost: opts.tokenCost === undefined ? null : opts.tokenCost,
      });
    }
  }
  return out;
}

describe("human time is counted once", () => {
  it("puts review time on the cost side and leaves value at the full baseline", () => {
    const r = calculateRoi(
      input({
        runs: dailyRuns("2026-01-01", "2026-01-31", 2),
        humanTime: [
          { periodStart: "2026-01-01", periodEnd: "2026-01-31", minutes: 600, hourlyRate: null },
        ],
      }),
    );
    expect(r.runCounts.completed).toBe(62);
    expect(r.valueTotal).toBe(62_000); // not reduced by the 600 review minutes
    expect(r.costHuman).toBe(60_000); // 600 / 60 × 6,000 (baseline rate fallback)
    expect(r.net).toBe(2_000);
  });

  it("counts needs_human runs as completed value, with human effort as cost", () => {
    const r = calculateRoi(
      input({
        runs: [
          ...dailyRuns("2026-01-01", "2026-01-31", 1),
          ...dailyRuns("2026-01-01", "2026-01-31", 1, { status: "needs_human" }),
          ...dailyRuns("2026-01-01", "2026-01-31", 1, { status: "failed" }),
        ],
      }),
    );
    expect(r.runCounts.completed).toBe(62);
    expect(r.valueTotal).toBe(62_000);
    expect(r.humanTouchRate).toBeCloseTo(1 / 3, 4);
    expect(r.successRate).toBeCloseTo(1 / 3, 4);
  });

  it("uses log rate, then baseline rate, then org default", () => {
    const r = calculateRoi(
      input({
        baseline: null,
        humanTime: [
          { periodStart: "2026-01-05", periodEnd: "2026-01-05", minutes: 60, hourlyRate: 5000 },
          { periodStart: "2026-01-06", periodEnd: "2026-01-06", minutes: 60, hourlyRate: null },
        ],
      }),
    );
    expect(r.costHuman).toBe(8_000); // 5,000 + org default 3,000
  });
});

describe("token double-counting protection", () => {
  it("drops token cost entries for days covered by per-run token cost", () => {
    const r = calculateRoi(
      input({
        runs: dailyRuns("2026-01-01", "2026-01-31", 1, { tokenCost: 10 }),
        costEntries: [
          { category: "tokens", isOneOff: false, amount: 3_100, periodStart: "2026-01-01", periodEnd: "2026-01-31" },
        ],
      }),
    );
    expect(r.costRunning).toBe(310); // per-run only
    expect(r.explain.cost_running.inputs.token_entries_skipped).toBe(3_100);
  });

  it("keeps token entries for days before per-run tracking started", () => {
    const r = calculateRoi(
      input({
        runs: [
          ...dailyRuns("2026-01-01", "2026-01-15", 1),
          ...dailyRuns("2026-01-16", "2026-01-31", 1, { tokenCost: 10 }),
        ],
        costEntries: [
          { category: "tokens", isOneOff: false, amount: 3_100, periodStart: "2026-01-01", periodEnd: "2026-01-31" },
        ],
      }),
    );
    // 15 days × 100 from the entry + 16 runs × 10 per-run
    expect(r.costRunning).toBe(1_500 + 160);
  });
});

describe("missing baseline", () => {
  it("returns zero value, low confidence and an explanation", () => {
    const r = calculateRoi(
      input({
        baseline: null,
        runs: dailyRuns("2026-01-01", "2026-01-31", 3),
        costEntries: [
          { category: "build", isOneOff: true, amount: 50_000, periodStart: "2025-12-01", periodEnd: "2025-12-01" },
        ],
      }),
    );
    expect(r.valueTotal).toBe(0);
    expect(r.confidence).toBe("low");
    expect(r.net).toBe(-50_000);
    expect(r.volumeRatio).toBeNull();
    expect(r.explain.value_total.notes.join(" ")).toMatch(/No baseline/);
  });
});

describe("zero runs", () => {
  it("falls back to baseline volume, lowers confidence and leaves rates empty", () => {
    const r = calculateRoi(input({ asOf: "2026-01-28" })); // 4 full weeks
    expect(r.runCounts.total).toBe(0);
    expect(r.coverage).toBe(0);
    expect(r.confidence).toBe("low");
    expect(r.successRate).toBeNull();
    expect(r.humanTouchRate).toBeNull();
    expect(r.costPerSuccessfulRun).toBeNull();
    expect(r.roi).toBeNull(); // no cost
    expect(r.volumeRatio).toBeNull(); // kill rule can't fire on missing data
    // 28 days × 300 / (365.25/12) tasks × 1,000
    expect(r.valueTotal).toBeCloseTo((28 * 300 * 12 * 1000) / 365.25, 0);
  });

  it("is flagged watch and has no payback when nothing has happened", () => {
    const r = calculateRoi(input({ baseline: null }));
    expect(r.valueTotal).toBe(0);
    expect(r.costTotal).toBe(0);
    expect(r.paybackDate).toBeNull();
    expect(r.flag).toBe("watch");
  });

  it("estimates only the weeks without run data", () => {
    const r = calculateRoi(
      input({ asOf: "2026-01-14", runs: dailyRuns("2026-01-01", "2026-01-07", 10) }),
    );
    expect(r.coverage).toBe(0.5);
    expect(r.inputs.fallback_days).toBe(7);
    const estimated = (7 * 300 * 12) / 365.25;
    expect(r.valueTotal).toBeCloseTo(70_000 + estimated * 1000, 0);
  });
});

describe("payback", () => {
  it("finds the actual crossover date", () => {
    const r = calculateRoi(
      input({
        runs: dailyRuns("2026-01-01", "2026-01-31", 1),
        costEntries: [
          { category: "build", isOneOff: true, amount: 10_000, periodStart: "2026-01-01", periodEnd: "2026-01-01" },
        ],
      }),
    );
    expect(r.paybackDate).toBe("2026-01-10"); // 10 runs × 1,000 = 10,000
    expect(r.paybackProjected).toBe(false);
  });

  it("projects from the trailing 30-day net rate when not reached", () => {
    const r = calculateRoi(
      input({
        runs: dailyRuns("2026-01-01", "2026-01-31", 1),
        costEntries: [
          { category: "build", isOneOff: true, amount: 100_000, periodStart: "2025-12-15", periodEnd: "2025-12-15" },
        ],
      }),
    );
    // net = 31,000 − 100,000 = −69,000; trailing 30 days earn 1,000/day → 69 days
    expect(r.net).toBe(-69_000);
    expect(r.paybackProjected).toBe(true);
    expect(r.paybackDate).toBe(fromDay(toDay("2026-01-31") + 69));
  });

  it("returns no payback when the trailing rate is not positive", () => {
    const r = calculateRoi(
      input({
        baseline: null,
        costEntries: [
          { category: "hosting", isOneOff: false, amount: 3_100, periodStart: "2026-01-01", periodEnd: "2026-01-31" },
        ],
      }),
    );
    expect(r.paybackDate).toBeNull();
    expect(r.paybackProjected).toBe(false);
  });
});

describe("mixed one-off and recurring costs", () => {
  it("counts one-offs in full and prorates recurring to as-of", () => {
    const r = calculateRoi(
      input({
        asOf: "2026-01-15",
        costEntries: [
          { category: "build", isOneOff: true, amount: 1_000, periodStart: "2026-01-02", periodEnd: "2026-03-31" },
          { category: "hosting", isOneOff: false, amount: 310, periodStart: "2026-01-01", periodEnd: "2026-01-31" },
          { category: "licence", isOneOff: false, amount: 999, periodStart: "2026-02-01", periodEnd: "2026-02-28" },
        ],
      }),
    );
    expect(r.costOneOff).toBe(1_000);
    expect(r.costRunning).toBe(150); // 15/31 of 310; February not started
    expect(r.costTotal).toBe(1_150);
  });

  it("includes pre-go-live build costs in the series", () => {
    const r = calculateRoi(
      input({
        costEntries: [
          { category: "build", isOneOff: true, amount: 500, periodStart: "2025-12-01", periodEnd: "2025-12-01" },
        ],
      }),
    );
    expect(r.series[0]).toMatchObject({ date: "2025-12-01", cumCost: 500 });
    expect(r.daysLive).toBe(31);
  });
});

describe("proration across partial months", () => {
  it("splits an entry that straddles a month boundary by day", () => {
    const r = calculateRoi(
      input({
        asOf: "2026-02-05",
        costEntries: [
          // 31-day period, 10/day; 12 days in Jan + 5 in Feb counted
          { category: "hosting", isOneOff: false, amount: 310, periodStart: "2026-01-20", periodEnd: "2026-02-19" },
        ],
      }),
    );
    expect(r.costRunning).toBe(170);
  });

  it("prorates human time logs that run past as-of", () => {
    const r = calculateRoi(
      input({
        asOf: "2026-01-03",
        humanTime: [
          { periodStart: "2026-01-01", periodEnd: "2026-01-06", minutes: 360, hourlyRate: 600 },
        ],
      }),
    );
    expect(r.costHuman).toBe(1_800); // half of 360 min × 600/h
  });
});

describe("currency rounding", () => {
  it("rounds half away from zero without float drift", () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(-1.005, 2)).toBe(-1.01);
    expect(roundTo(0.1 + 0.2, 2)).toBe(0.3);
    expect(roundMoney(1234.5, "JPY")).toBe(1235);
    expect(roundMoney(1234.565, "NGN")).toBe(1234.57);
  });

  it("rounds totals only at output so sub-unit run costs add up", () => {
    const r = calculateRoi(
      input({ baseline: null, runs: dailyRuns("2026-01-01", "2026-01-30", 10, { tokenCost: 0.0035 }) }),
    );
    expect(r.costRunning).toBe(1.05); // 300 × 0.0035, not 300 × 0.00
    expect(r.costTotal).toBe(1.05);
  });
});

describe("confidence", () => {
  it("is medium with a measured baseline and full coverage", () => {
    const r = calculateRoi(input({ runs: dailyRuns("2026-01-01", "2026-01-31", 1) }));
    expect(r.coverage).toBe(1);
    expect(r.confidence).toBe("medium");
  });

  it("is low with a reconstructed baseline even with full coverage", () => {
    const r = calculateRoi(
      input({
        baseline: { ...baseline, source: "reconstructed" },
        runs: dailyRuns("2026-01-01", "2026-01-31", 1),
      }),
    );
    expect(r.confidence).toBe("low");
  });
});

describe("error impact", () => {
  it("adds avoided errors × cost per error when both rates are known", () => {
    const r = calculateRoi(
      input({
        baseline: { ...baseline, errorRate: 0.1, aiErrorRate: 0.02, costPerError: 5_000 },
        runs: dailyRuns("2026-01-01", "2026-01-10", 1),
        asOf: "2026-01-10",
      }),
    );
    // per task: 1,000 + 0.08 × 5,000 = 1,400
    expect(r.valueTotal).toBe(14_000);
  });
});

describe("flags", () => {
  const base = {
    isLive: true,
    roi: 0.5,
    net: 1_000,
    daysLive: 120,
    humanTouchRate: 0.05,
    volumeRatio: 1,
    realisedMonthlyValue: 100,
    predictedMonthlyValue: 100,
  };
  const t = DEFAULT_THRESHOLDS;

  it("scales when ROI > 1 and realised ≥ predicted", () => {
    expect(decideFlag({ ...base, roi: 1.5 }, t).flag).toBe("scale");
    expect(decideFlag({ ...base, roi: 1.5, realisedMonthlyValue: 90 }, t).flag).toBe("watch");
  });

  it("fixes on high human touch or negative net with healthy volume", () => {
    expect(decideFlag({ ...base, roi: 2, humanTouchRate: 0.25 }, t).flag).toBe("fix");
    expect(decideFlag({ ...base, net: -1, roi: -0.1, volumeRatio: 0.8 }, t).flag).toBe("fix");
  });

  it("kills after 90 days with negative net and low volume", () => {
    expect(decideFlag({ ...base, net: -1, roi: -0.5, volumeRatio: 0.2 }, t).flag).toBe("kill");
    expect(decideFlag({ ...base, net: -1, roi: -0.5, volumeRatio: 0.2, daysLive: 60 }, t).flag).toBe("watch");
  });

  it("respects org threshold overrides", () => {
    const r = calculateRoi(
      input({
        org: { currency: "NGN", defaultLoadedHourlyRate: 0, flagThresholds: { fix_max_human_touch_rate: 0.6 } },
        runs: dailyRuns("2026-01-01", "2026-01-31", 1, { status: "needs_human" }),
      }),
    );
    expect(r.humanTouchRate).toBe(1);
    expect(r.flag).toBe("fix");
    const relaxed = calculateRoi(
      input({
        org: { currency: "NGN", defaultLoadedHourlyRate: 0, flagThresholds: { fix_max_human_touch_rate: 1 } },
        runs: dailyRuns("2026-01-01", "2026-01-31", 1, { status: "needs_human" }),
      }),
    );
    expect(relaxed.flag).not.toBe("fix");
  });

  it("only watches deployments that are not live", () => {
    const r = calculateRoi(
      input({ deployment: { status: "planned", goLiveDate: null, predictedMonthlyValue: null, predictedMonthlyCost: null } }),
    );
    expect(r.flag).toBe("watch");
  });
});

describe("series", () => {
  it("cumulative totals match the KPI totals", () => {
    const r = calculateRoi(
      input({
        runs: dailyRuns("2026-01-01", "2026-01-31", 2, { tokenCost: 1.234 }),
        costEntries: [
          { category: "build", isOneOff: true, amount: 20_000, periodStart: "2025-12-10", periodEnd: "2025-12-10" },
          { category: "hosting", isOneOff: false, amount: 3_000, periodStart: "2026-01-01", periodEnd: "2026-01-31" },
        ],
        humanTime: [{ periodStart: "2026-01-01", periodEnd: "2026-01-07", minutes: 90, hourlyRate: null }],
      }),
    );
    const last = r.series.at(-1)!;
    expect(last.cumCost).toBe(r.costTotal);
    expect(last.cumValue).toBe(r.valueTotal);
  });
});
