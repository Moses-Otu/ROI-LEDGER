import { langfuseConnector } from "./langfuse";
import { n8nConnector } from "./n8n";
import { openRouterConnector } from "./openrouter";
import type { Connector, ConnectorContext, ConnectorType } from "./types";

export { CONNECTOR_TYPES } from "./catalog";

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
