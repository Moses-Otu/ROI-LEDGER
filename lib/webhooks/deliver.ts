import "server-only";
import { randomUUID } from "node:crypto";
import { decryptSecret } from "@/lib/crypto/aes-gcm";
import type { AdminClient } from "@/lib/supabase/admin";
import type { PendingEvent } from "./events";
import { signPayload } from "./sign";

const MAX_RETRIES = 3;
const TIMEOUT_MS = 10_000;
/** The same alert to the same webhook is not repeated within this window. */
const DEDUPE_WINDOW_DAYS = 7;

export interface WebhookRow {
  id: string;
  url: string;
  /** Encrypted with ENCRYPTION_KEY; decrypted only to sign. */
  secret: string;
  events: string[];
}

type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Sends one event to every active webhook of its org that subscribes to it. */
export async function dispatchEvent(db: AdminClient, ev: PendingEvent, sleep: Sleep = realSleep): Promise<void> {
  const { data: hooks } = await db
    .from("webhooks")
    .select("id, url, secret, events")
    .eq("org_id", ev.orgId)
    .eq("active", true)
    .contains("events", [ev.event]);

  for (const hook of (hooks ?? []) as WebhookRow[]) {
    if (ev.dedupeKey && (await alreadySent(db, hook.id, ev))) continue;
    await deliver(db, hook, ev, sleep);
  }
}

async function alreadySent(db: AdminClient, webhookId: string, ev: PendingEvent): Promise<boolean> {
  const since = new Date(Date.now() - DEDUPE_WINDOW_DAYS * 86_400_000).toISOString();
  const { count } = await db
    .from("webhook_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("webhook_id", webhookId)
    .eq("event", ev.event)
    .eq("payload->>dedupe_key", ev.dedupeKey!)
    .gte("attempted_at", since)
    .gte("status_code", 200)
    .lt("status_code", 300);
  return (count ?? 0) > 0;
}

/** POSTs with an HMAC signature: 1 attempt plus up to 3 retries, each logged. */
export async function deliver(
  db: AdminClient,
  hook: WebhookRow,
  ev: PendingEvent,
  sleep: Sleep = realSleep,
): Promise<boolean> {
  const payload = {
    id: randomUUID(),
    event: ev.event,
    created_at: new Date().toISOString(),
    dedupe_key: ev.dedupeKey ?? null,
    data: ev.data,
  };
  const body = JSON.stringify(payload);
  const secret = decryptSecret(hook.secret);

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    let status: number | null = null;
    let error: string | null = null;
    try {
      const res = await fetch(hook.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-signature": signPayload(secret, body),
          "x-event": ev.event,
          "x-delivery-id": payload.id,
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "manual",
      });
      status = res.status;
    } catch (e) {
      error = (e as Error).message.slice(0, 500);
    }
    await db.from("webhook_deliveries").insert({
      webhook_id: hook.id,
      event: ev.event,
      payload,
      status_code: status,
      attempt,
      error,
    });
    if (status !== null && status >= 200 && status < 300) return true;
    if (attempt <= MAX_RETRIES) await sleep(1000 * 2 ** (attempt - 1));
  }
  return false;
}
