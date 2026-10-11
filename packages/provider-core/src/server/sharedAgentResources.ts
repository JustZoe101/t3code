/**
 * Resolve the effective shared MCP servers for one provider instance.
 *
 * Input is environment-wide `SharedAgentResources` plus the instance's
 * `ProviderInstanceConfig.shared` steering. Output is the list of servers the
 * adapter should inject, plus the ones that were configured but are not
 * deliverable on this driver (a transport the provider cannot carry), so a
 * misconfiguration surfaces in the UI instead of silently vanishing.
 *
 * The server resolves this once per session prepare and hands the result to
 * adapters through `McpProviderSessionConfig.sharedMcpServers`.
 *
 * @module provider-core/server/sharedAgentResources
 */
import type {
  ProviderInstanceSharedConfig,
  SharedAgentResources,
  SharedMcpServer,
  SharedResourceTargeting,
} from "@t3tools/contracts";
import { mcpTransportSupport, type McpTransport } from "@t3tools/shared/providerResources";

export interface ResolvedSharedMcpServer {
  /** The map key in `SharedAgentResources.mcpServers`. */
  readonly id: string;
  readonly transport: McpTransport;
  readonly server: SharedMcpServer;
}

export interface RejectedSharedMcpServer {
  readonly id: string;
  /** Human-readable reason the server is not delivered on this driver. */
  readonly reason: string;
}

export interface SharedMcpResolution {
  readonly servers: ReadonlyArray<ResolvedSharedMcpServer>;
  readonly rejected: ReadonlyArray<RejectedSharedMcpServer>;
}

/** T3 owns this id; user configuration may not shadow it. */
export const RESERVED_SHARED_RESOURCE_IDS: ReadonlySet<string> = new Set(["t3-code"]);

/** A shared server's `env` as the record provider configs expect. */
export function sharedMcpEnvRecord(server: SharedMcpServer): Record<string, string> {
  return Object.fromEntries((server.env ?? []).map((variable) => [variable.name, variable.value]));
}

/** A shared server's `headers` as the record provider configs expect. */
export function sharedMcpHeaderRecord(server: SharedMcpServer): Record<string, string> {
  return Object.fromEntries(
    (server.headers ?? []).map((variable) => [variable.name, variable.value]),
  );
}

const matchesTargeting = (
  targeting: SharedResourceTargeting | undefined,
  driver: string,
): boolean => {
  if (targeting === undefined) return true;
  if (targeting.excludeDrivers?.some((kind) => kind === driver)) return false;
  if (targeting.drivers !== undefined && targeting.drivers.length > 0) {
    return targeting.drivers.some((kind) => kind === driver);
  }
  return true;
};

export function resolveSharedMcpServers(input: {
  readonly resources: SharedAgentResources;
  readonly instance: {
    readonly driver: string;
    readonly shared?: ProviderInstanceSharedConfig | undefined;
  };
}): SharedMcpResolution {
  const { instance } = input;
  if (instance.shared?.enabled === false) return { servers: [], rejected: [] };
  const disabled = new Set<string>(instance.shared?.disabledResourceIds ?? []);

  // Effective set = environment entries ∪ instance-local entries, the
  // instance-local one winning on an id collision (an override, not a merge).
  const merged = new Map<string, SharedMcpServer>();
  for (const [id, server] of Object.entries(input.resources.mcpServers)) {
    if (RESERVED_SHARED_RESOURCE_IDS.has(id)) continue;
    if (disabled.has(id)) continue;
    if (!matchesTargeting(server.targeting, instance.driver)) continue;
    merged.set(id, server);
  }
  for (const [id, server] of Object.entries(instance.shared?.mcpServers ?? {})) {
    if (RESERVED_SHARED_RESOURCE_IDS.has(id)) continue;
    if (!matchesTargeting(server.targeting, instance.driver)) continue;
    merged.set(id, server);
  }

  const servers: ResolvedSharedMcpServer[] = [];
  const rejected: RejectedSharedMcpServer[] = [];
  for (const [id, server] of [...merged.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const support = mcpTransportSupport(instance.driver, server.transport);
    if (support === "supported") {
      servers.push({ id, transport: server.transport, server });
      continue;
    }
    rejected.push({
      id,
      reason:
        support === "unreliable"
          ? `${instance.driver} does not reliably accept ${server.transport} MCP servers.`
          : `${instance.driver} does not accept ${server.transport} MCP servers.`,
    });
  }
  return { servers, rejected };
}
