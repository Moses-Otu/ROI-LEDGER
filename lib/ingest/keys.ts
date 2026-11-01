import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const PREFIX = "rlk_";

/** Returns the plain key (shown once) and what we store. */
export function generateIngestKey(): { key: string; prefix: string; hash: string } {
  const key = PREFIX + randomBytes(32).toString("base64url");
  return { key, prefix: key.slice(0, PREFIX.length + 6), hash: hashIngestKey(key) };
}

export function hashIngestKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
