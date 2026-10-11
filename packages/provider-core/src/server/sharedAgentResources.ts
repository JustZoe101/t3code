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
  SharedHook,
  SharedMcpServer,
  SharedPlugin,
  SharedResourceTargeting,
  SharedSkill,
} from "@t3tools/contracts";
import {
  mcpTransportSupport,
  pluginSupportForDriver,
  skillSupportForDriver,
  type McpTransport,
} from "@t3tools/shared/providerResources";

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

export interface ResolvedSharedSkill {
  /** The map key in `SharedAgentResources.skills`. */
  readonly id: string;
  readonly skill: SharedSkill;
}

export interface RejectedSharedSkill {
  readonly id: string;
  readonly reason: string;
}

export interface SharedSkillResolution {
  readonly skills: ReadonlyArray<ResolvedSharedSkill>;
  readonly rejected: ReadonlyArray<RejectedSharedSkill>;
}

/**
 * Effective shared skills for one provider instance: environment entries
 * filtered by targeting and the instance's steering, plus instance-local
 * skills (which win on an id collision). Skills have no transport, so the only
 * capability gate is whether T3 can deliver into this driver at all.
 */
export function resolveSharedSkills(input: {
  readonly resources: SharedAgentResources;
  readonly instance: {
    readonly driver: string;
    readonly shared?: ProviderInstanceSharedConfig | undefined;
  };
}): SharedSkillResolution {
  const { instance } = input;
  if (instance.shared?.enabled === false) return { skills: [], rejected: [] };
  const disabled = new Set<string>(instance.shared?.disabledResourceIds ?? []);

  const merged = new Map<string, SharedSkill>();
  for (const [id, skill] of Object.entries(input.resources.skills)) {
    if (disabled.has(id)) continue;
    if (!matchesTargeting(skill.targeting, instance.driver)) continue;
    merged.set(id, skill);
  }
  for (const [id, skill] of Object.entries(instance.shared?.skills ?? {})) {
    if (!matchesTargeting(skill.targeting, instance.driver)) continue;
    merged.set(id, skill);
  }

  const skills: ResolvedSharedSkill[] = [];
  const rejected: RejectedSharedSkill[] = [];
  for (const [id, skill] of [...merged.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (skillSupportForDriver(instance.driver) === "supported") {
      skills.push({ id, skill });
      continue;
    }
    rejected.push({
      id,
      reason: `${instance.driver} does not receive shared skills yet.`,
    });
  }
  return { skills, rejected };
}

export interface ResolvedSharedHook {
  /** The map key in `SharedAgentResources.hooks`. */
  readonly id: string;
  readonly hook: SharedHook;
}

export interface SharedHookResolution {
  readonly hooks: ReadonlyArray<ResolvedSharedHook>;
  readonly rejected: ReadonlyArray<{ readonly id: string; readonly reason: string }>;
}

/**
 * Effective shared hooks for one provider instance. Hooks are universal: T3
 * runs the command itself on the lifecycle event, so there is no per-driver
 * delivery to gate. Steering still applies (instance switch, disabled ids,
 * targeting, instance-local hooks).
 */
export function resolveSharedHooks(input: {
  readonly resources: SharedAgentResources;
  readonly instance: {
    readonly driver: string;
    readonly shared?: ProviderInstanceSharedConfig | undefined;
  };
}): SharedHookResolution {
  const { instance } = input;
  if (instance.shared?.enabled === false) return { hooks: [], rejected: [] };
  const disabled = new Set<string>(instance.shared?.disabledResourceIds ?? []);

  const merged = new Map<string, SharedHook>();
  for (const [id, hook] of Object.entries(input.resources.hooks)) {
    if (disabled.has(id)) continue;
    if (!matchesTargeting(hook.targeting, instance.driver)) continue;
    merged.set(id, hook);
  }
  for (const [id, hook] of Object.entries(instance.shared?.hooks ?? {})) {
    if (!matchesTargeting(hook.targeting, instance.driver)) continue;
    merged.set(id, hook);
  }

  return {
    hooks: [...merged.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, hook]) => ({ id, hook })),
    rejected: [],
  };
}

export interface ResolvedSharedPlugin {
  /** The map key in `SharedAgentResources.plugins`. */
  readonly id: string;
  readonly plugin: SharedPlugin;
}

export interface SharedPluginResolution {
  readonly plugins: ReadonlyArray<ResolvedSharedPlugin>;
  readonly rejected: ReadonlyArray<{ readonly id: string; readonly reason: string }>;
}

/**
 * Effective shared plugins for one provider instance. Delivery is gated on a
 * managed plugin root, so a driver without one is reported rather than
 * silently skipped.
 */
export function resolveSharedPlugins(input: {
  readonly resources: SharedAgentResources;
  readonly instance: {
    readonly driver: string;
    readonly shared?: ProviderInstanceSharedConfig | undefined;
  };
}): SharedPluginResolution {
  const { instance } = input;
  if (instance.shared?.enabled === false) return { plugins: [], rejected: [] };
  const disabled = new Set<string>(instance.shared?.disabledResourceIds ?? []);

  const merged = new Map<string, SharedPlugin>();
  for (const [id, plugin] of Object.entries(input.resources.plugins)) {
    if (disabled.has(id)) continue;
    if (!matchesTargeting(plugin.targeting, instance.driver)) continue;
    merged.set(id, plugin);
  }
  for (const [id, plugin] of Object.entries(instance.shared?.plugins ?? {})) {
    if (!matchesTargeting(plugin.targeting, instance.driver)) continue;
    merged.set(id, plugin);
  }

  const plugins: ResolvedSharedPlugin[] = [];
  const rejected: Array<{ id: string; reason: string }> = [];
  for (const [id, plugin] of [...merged.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (pluginSupportForDriver(instance.driver) === "supported") {
      plugins.push({ id, plugin });
      continue;
    }
    rejected.push({
      id,
      reason: `${instance.driver} installs plugins through its own marketplace, not a managed root.`,
    });
  }
  return { plugins, rejected };
}
