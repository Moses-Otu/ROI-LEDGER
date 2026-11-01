import { describe, expect, it } from "vitest";
import type { SnapshotChange } from "@/lib/ledger/recalculate";
import { eventsForChange } from "./events";
import { signPayload, verifySignature } from "./sign";

function change(overrides: Record<string, unknown> = {}, previousFlag = "watch"): SnapshotChange {
  return {
    deploymentId: "d1",
    orgId: "o1",
    name: "Procurement assistant",
    currency: "NGN",
    previous: { flag: previousFlag, as_of: "2026-10-31", cost_per_successful_run: 100 },
    result: {
      asOf: "2026-11-01",
      flag: "watch",
      weeklyCostPerRun: { current: 100, previous: 100 },
      explain: { flag: { notes: [] } },
      ...overrides,
    } as unknown as SnapshotChange["result"],
  };
}

describe("webhook events", () => {
  it("fires flag_changed only when the flag changes", () => {
    expect(eventsForChange(change(), 0.25)).toEqual([]);
    const [ev] = eventsForChange(change({ flag: "fix" }), 0.25);
    expect(ev.event).toBe("deployment.flag_changed");
    expect(ev.data.previous_flag).toBe("watch");
  });

  it("fires a spike only above the week-on-week threshold", () => {
    expect(eventsForChange(change({ weeklyCostPerRun: { current: 125, previous: 100 } }), 0.25)).toEqual([]);
    const [ev] = eventsForChange(change({ weeklyCostPerRun: { current: 126, previous: 100 } }), 0.25);
    expect(ev.event).toBe("deployment.cost_per_run_spike");
    expect(ev.data.change_pct).toBe(26);
  });
});

describe("signatures", () => {
  it("verifies HMAC-SHA256 and rejects tampering", () => {
    const body = JSON.stringify({ a: 1 });
    const sig = signPayload("s3cret", body);
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifySignature("s3cret", body, sig)).toBe(true);
    expect(verifySignature("s3cret", `${body} `, sig)).toBe(false);
    expect(verifySignature("other", body, sig)).toBe(false);
  });
});
