import { createHmac, timingSafeEqual } from "node:crypto";

/** `x-signature: sha256=<hex HMAC-SHA256 of the raw body>` */
export function signPayload(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

export function verifySignature(secret: string, body: string, header: string | null): boolean {
  if (!header) return false;
  const expected = Buffer.from(signPayload(secret, body));
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
