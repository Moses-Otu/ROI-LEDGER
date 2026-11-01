export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * GET/POST JSON with exponential backoff on 429 and 5xx (honours Retry-After).
 * Error messages never include request headers, so credentials don't leak into logs.
 */
export async function fetchJson<T>(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit = {},
  { retries = 4, baseDelayMs = 500, sleep = defaultSleep }: RetryOptions = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(url, { ...init, headers: { accept: "application/json", ...init.headers } });
    } catch (e) {
      if (attempt >= retries) throw new HttpError(0, `Network error calling ${redact(url)}: ${(e as Error).message}`);
      await sleep(baseDelayMs * 2 ** attempt);
      continue;
    }
    if (res.ok) return (await res.json()) as T;
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < retries) {
      const after = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 60_000) : baseDelayMs * 2 ** attempt);
      continue;
    }
    const body = (await res.text().catch(() => "")).slice(0, 300);
    throw new HttpError(res.status, `${res.status} from ${redact(url)}${body ? `: ${body}` : ""}`);
  }
}

function redact(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "upstream";
  }
}

export function joinUrl(base: string, path: string, query: Record<string, string | undefined> = {}): string {
  const u = new URL(path.replace(/^\//, ""), base.endsWith("/") ? base : `${base}/`);
  for (const [k, v] of Object.entries(query)) if (v !== undefined) u.searchParams.set(k, v);
  return u.toString();
}
