/**
 * Pure helpers for the shared MCP server editor, shared by the web and mobile
 * settings surfaces. Kept in `client-runtime` (not a UI package) so the
 * draft → schema conversion and the per-driver support view stay testable and
 * identical wherever the editor is rendered.
 */
import {
  PROVIDER_DISPLAY_NAMES,
  type ProviderDriverKind,
  type SharedHook,
  type SharedHookEvent,
  type SharedMcpServer,
  type SharedMcpTransport,
  type SharedResourceVariable,
  type SharedSkill,
} from "@t3tools/contracts";
import {
  PROVIDER_MCP_TRANSPORT_SUPPORT,
  mcpTransportSupport,
  skillSupportForDriver,
  type SkillSupport,
} from "@t3tools/shared/providerResources";

export const SHARED_MCP_DRIVER_KINDS = Object.keys(
  PROVIDER_MCP_TRANSPORT_SUPPORT,
) as ProviderDriverKind[];

export const SHARED_MCP_TRANSPORT_LABELS: Record<SharedMcpTransport, string> = {
  stdio: "stdio — local command",
  http: "http — remote URL",
  sse: "sse — remote URL",
};

export function sharedMcpDriverLabel(driver: ProviderDriverKind): string {
  return PROVIDER_DISPLAY_NAMES[driver] ?? driver;
}

export function sharedMcpServerTargetSummary(server: SharedMcpServer): string {
  if (server.transport === "stdio") {
    return [server.command ?? "", ...(server.args ?? [])].filter(Boolean).join(" ");
  }
  return server.url ?? "";
}

export interface SharedServerSupport {
  readonly driver: ProviderDriverKind;
  readonly support: ReturnType<typeof mcpTransportSupport>;
}

export function sharedServerSupportBadges(
  server: SharedMcpServer,
): ReadonlyArray<SharedServerSupport> {
  return SHARED_MCP_DRIVER_KINDS.map((driver) => ({
    driver,
    support: mcpTransportSupport(driver, server.transport),
  }));
}

export interface SharedMcpServerDraft {
  readonly originalId: string | null;
  readonly id: string;
  readonly transport: SharedMcpTransport;
  readonly command: string;
  readonly args: string;
  readonly url: string;
  readonly env: ReadonlyArray<SharedResourceVariable>;
  readonly headers: ReadonlyArray<SharedResourceVariable>;
  readonly drivers: ReadonlyArray<ProviderDriverKind>;
  readonly excludeDrivers: ReadonlyArray<ProviderDriverKind>;
}

export function draftFromSharedMcpServer(
  id: string,
  server: SharedMcpServer,
): SharedMcpServerDraft {
  return {
    originalId: id,
    id,
    transport: server.transport,
    command: server.command ?? "",
    args: (server.args ?? []).join(" "),
    url: server.url ?? "",
    env: server.env ?? [],
    headers: server.headers ?? [],
    drivers: [...(server.targeting?.drivers ?? [])] as unknown as ReadonlyArray<ProviderDriverKind>,
    excludeDrivers: [
      ...(server.targeting?.excludeDrivers ?? []),
    ] as unknown as ReadonlyArray<ProviderDriverKind>,
  };
}

export function emptySharedMcpServerDraft(): SharedMcpServerDraft {
  return {
    originalId: null,
    id: "",
    transport: "stdio",
    command: "",
    args: "",
    url: "",
    env: [],
    headers: [],
    drivers: [],
    excludeDrivers: [],
  };
}

/** `undefined` when the draft is incomplete; a form refuses to save then. */
export function sharedMcpServerFromDraft(draft: SharedMcpServerDraft): SharedMcpServer | undefined {
  const id = draft.id.trim();
  if (id.length === 0) return undefined;
  const targeting = {
    ...(draft.drivers.length > 0 ? { drivers: draft.drivers } : {}),
    ...(draft.excludeDrivers.length > 0 ? { excludeDrivers: draft.excludeDrivers } : {}),
  };
  if (draft.transport === "stdio") {
    const command = draft.command.trim();
    if (command.length === 0) return undefined;
    const args = draft.args.trim().length > 0 ? draft.args.trim().split(/\s+/) : [];
    return {
      transport: "stdio",
      command,
      ...(args.length > 0 ? { args } : {}),
      ...(draft.env.length > 0 ? { env: [...draft.env] } : {}),
      targeting,
    } as unknown as SharedMcpServer;
  }
  const url = draft.url.trim();
  if (url.length === 0) return undefined;
  return {
    transport: draft.transport,
    url,
    ...(draft.headers.length > 0 ? { headers: [...draft.headers] } : {}),
    targeting,
  } as unknown as SharedMcpServer;
}

export interface SharedSkillSupport {
  readonly driver: ProviderDriverKind;
  readonly support: SkillSupport;
}

/** Per-driver skill support. Skills have no transport axis, so this is flat. */
export function sharedSkillDriverSupport(): ReadonlyArray<SharedSkillSupport> {
  return SHARED_MCP_DRIVER_KINDS.map((driver) => ({
    driver,
    support: skillSupportForDriver(driver),
  }));
}

export interface SharedSkillDraft {
  readonly originalId: string | null;
  readonly id: string;
  readonly source: string;
  readonly drivers: ReadonlyArray<ProviderDriverKind>;
  readonly excludeDrivers: ReadonlyArray<ProviderDriverKind>;
}

export function draftFromSharedSkill(id: string, skill: SharedSkill): SharedSkillDraft {
  return {
    originalId: id,
    id,
    source: skill.source,
    drivers: [...(skill.targeting?.drivers ?? [])] as unknown as ReadonlyArray<ProviderDriverKind>,
    excludeDrivers: [
      ...(skill.targeting?.excludeDrivers ?? []),
    ] as unknown as ReadonlyArray<ProviderDriverKind>,
  };
}

export function emptySharedSkillDraft(): SharedSkillDraft {
  return { originalId: null, id: "", source: "", drivers: [], excludeDrivers: [] };
}

/** `undefined` when the draft is incomplete; a form refuses to save then. */
export function sharedSkillFromDraft(draft: SharedSkillDraft): SharedSkill | undefined {
  const id = draft.id.trim();
  const source = draft.source.trim();
  if (id.length === 0 || source.length === 0) return undefined;
  const targeting = {
    ...(draft.drivers.length > 0 ? { drivers: draft.drivers } : {}),
    ...(draft.excludeDrivers.length > 0 ? { excludeDrivers: draft.excludeDrivers } : {}),
  };
  return { source, targeting } as unknown as SharedSkill;
}

export const SHARED_HOOK_EVENTS: ReadonlyArray<SharedHookEvent> = [
  "session-start",
  "turn-end",
  "tool-call",
];

export const SHARED_HOOK_EVENT_LABELS: Record<SharedHookEvent, string> = {
  "session-start": "Session start",
  "turn-end": "Turn end",
  "tool-call": "Tool call",
};

export interface SharedHookDraft {
  readonly originalId: string | null;
  readonly id: string;
  readonly event: SharedHookEvent;
  readonly command: string;
  readonly args: string;
  /** Milliseconds as a string, so the field can be empty for the default. */
  readonly timeoutMs: string;
  readonly env: ReadonlyArray<SharedResourceVariable>;
  readonly drivers: ReadonlyArray<ProviderDriverKind>;
  readonly excludeDrivers: ReadonlyArray<ProviderDriverKind>;
}

export function draftFromSharedHook(id: string, hook: SharedHook): SharedHookDraft {
  return {
    originalId: id,
    id,
    event: hook.event,
    command: hook.command,
    args: (hook.args ?? []).join(" "),
    timeoutMs: hook.timeoutMs === undefined ? "" : String(hook.timeoutMs),
    env: hook.env ?? [],
    drivers: [...(hook.targeting?.drivers ?? [])] as unknown as ReadonlyArray<ProviderDriverKind>,
    excludeDrivers: [
      ...(hook.targeting?.excludeDrivers ?? []),
    ] as unknown as ReadonlyArray<ProviderDriverKind>,
  };
}

export function emptySharedHookDraft(): SharedHookDraft {
  return {
    originalId: null,
    id: "",
    event: "turn-end",
    command: "",
    args: "",
    timeoutMs: "",
    env: [],
    drivers: [],
    excludeDrivers: [],
  };
}

/** `undefined` when the draft is incomplete; a form refuses to save then. */
export function sharedHookFromDraft(draft: SharedHookDraft): SharedHook | undefined {
  const id = draft.id.trim();
  const command = draft.command.trim();
  if (id.length === 0 || command.length === 0) return undefined;
  const timeout = draft.timeoutMs.trim();
  const timeoutMs = timeout.length > 0 ? Number.parseInt(timeout, 10) : undefined;
  if (timeout.length > 0 && (!Number.isFinite(timeoutMs) || (timeoutMs ?? 0) < 1)) return undefined;
  const args = draft.args.trim().length > 0 ? draft.args.trim().split(/\s+/) : [];
  const targeting = {
    ...(draft.drivers.length > 0 ? { drivers: draft.drivers } : {}),
    ...(draft.excludeDrivers.length > 0 ? { excludeDrivers: draft.excludeDrivers } : {}),
  };
  return {
    event: draft.event,
    command,
    ...(args.length > 0 ? { args } : {}),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(draft.env.length > 0 ? { env: [...draft.env] } : {}),
    targeting,
  } as unknown as SharedHook;
}
