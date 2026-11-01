import { createHash } from "node:crypto";

/**
 * Deterministic external_id for records sent without one, so re-sending the
 * same cost or human-time row (or re-importing the same CSV) never duplicates.
 */
export function contentId(prefix: string, parts: unknown[]): string {
  const h = createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
  return `${prefix}:${h}`;
}
