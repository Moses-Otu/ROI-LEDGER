import { langfuseConnector } from "./langfuse";
import { n8nConnector } from "./n8n";
import { openRouterConnector } from "./openrouter";
import type { Connector, ConnectorContext, ConnectorType } from "./types";

export const CONNECTOR_TYPES: Record<
  ConnectorType,
  { label: string; credentials: { key: string; label: string }[]; config: { key: string; label: string; placeholder?: string }[] }
> = {
  langfuse: {
    label: "Langfuse",
    credentials: [
      { key: "public_key", label: "Public key" },
      { key: "secret_key", label: "Secret key" },
    ],
    config: [
      { key: "base_url", label: "Base URL", placeholder: "https://cloud.langfuse.com" },
      { key: "execution_id_key", label: "Metadata key holding the n8n execution id", placeholder: "n8n_execution_id" },
      { key: "default_deployment_id", label: "Deployment for untagged traces (optional)" },
      { key: "usd_rate", label: "USD → org currency rate", placeholder: "1550" },
    ],
  },
  openrouter: {
    label: "OpenRouter",
    credentials: [{ key: "management_key", label: "Management API key" }],
    config: [{ key: "usd_rate", label: "USD → org currency rate", placeholder: "1550" }],
  },
  n8n: {
    label: "n8n",
    credentials: [{ key: "api_key", label: "API key" }],
    config: [{ key: "base_url", label: "Instance URL", placeholder: "https://yourname.app.n8n.cloud" }],
  },
};

export function createConnector(type: ConnectorType, ctx: ConnectorContext): Connector {
  switch (type) {
    case "langfuse":
      return langfuseConnector(ctx);
    case "openrouter":
      return openRouterConnector(ctx);
    case "n8n":
      return n8nConnector(ctx);
  }
}

/** How far each sync re-reads behind the last cursor, to catch late-arriving data. */
export const SYNC_OVERLAP_MS: Record<ConnectorType, number> = {
  langfuse: 2 * 3600_000,
  n8n: 2 * 3600_000,
  openrouter: 48 * 3600_000,
};

export type { Connector, ConnectorContext, ConnectorType } from "./types";
