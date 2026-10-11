/**
 * Per-driver support for shared agent resources. Kept in one place so the
 * resolve service and the web UI agree on what a driver accepts, instead of
 * the UI re-deriving (and drifting from) the adapters.
 *
 * Evidence for each cell lives in the adapter codec that handles it; the
 * transport shapes were verified against the pinned SDKs (Claude
 * `@anthropic-ai/claude-agent-sdk`, Cursor `@cursor/sdk`, OpenCode
 * `@opencode-ai/sdk` / `@opencode/schema`, and the Codex `config.toml`
 * schema in the vendored app server).
 */

export const MCP_TRANSPORTS = ["stdio", "http", "sse"] as const;
export type McpTransport = (typeof MCP_TRANSPORTS)[number];

/**
 * `supported` — the adapter injects it and the provider honors it.
 * `unreliable` — the provider advertises it but routinely drops or misroutes
 *   it (ACP-based agents with injected HTTP servers); surfaced as a warning.
 * `unsupported` — the transport has no route on this driver; surfaced as a
 *   reason.
 */
export type McpTransportSupport = "supported" | "unreliable" | "unsupported";

export type McpDriverSupport = Readonly<Record<McpTransport, McpTransportSupport>>;

const ALL_UNSUPPORTED: McpDriverSupport = {
  stdio: "unsupported",
  http: "unsupported",
  sse: "unsupported",
};

/**
 * Driver kind (string) to MCP transport support. A driver missing here is
 * treated as fully unsupported, so a new driver never silently receives
 * resources it cannot handle.
 */
export const PROVIDER_MCP_TRANSPORT_SUPPORT: Readonly<Record<string, McpDriverSupport>> = {
  claudeAgent: { stdio: "supported", http: "supported", sse: "supported" },
  codex: { stdio: "supported", http: "supported", sse: "unsupported" },
  cursor: { stdio: "supported", http: "supported", sse: "supported" },
  // ACP agents: T3 always injects stdio (its bridge); injected HTTP servers
  // are routinely dropped (see provider-acp adapter).
  grok: { stdio: "supported", http: "unreliable", sse: "unreliable" },
  antigravity: { stdio: "supported", http: "unreliable", sse: "unreliable" },
  acpRegistry: { stdio: "supported", http: "unreliable", sse: "unreliable" },
  // Both the 1.x and 2.x adapters bind `command: string[]` and a `remote`
  // transport; neither exposes SSE.
  opencode: { stdio: "supported", http: "supported", sse: "unsupported" },
  // Muse's session config only accepts `streamableHttp`.
  muse: { stdio: "unsupported", http: "supported", sse: "unsupported" },
  // Pi receives only T3's own HTTP server, through a generated T3 extension
  // that reads T3's endpoint from the environment. Injecting a *user* server
  // needs Pi's extension `registerMcpServer` route, which is not verified yet,
  // so Pi carries no shared servers for now.
  pi: { stdio: "unsupported", http: "unsupported", sse: "unsupported" },
};

export function mcpSupportForDriver(driver: string): McpDriverSupport {
  return PROVIDER_MCP_TRANSPORT_SUPPORT[driver] ?? ALL_UNSUPPORTED;
}

export function mcpTransportSupport(driver: string, transport: McpTransport): McpTransportSupport {
  return mcpSupportForDriver(driver)[transport];
}

/**
 * Per-driver support for shared skills. There is one axis, not a transport:
 * whether T3 can materialize a skill into a location the provider reads
 * *without* writing into a directory the user owns. Claude (managed home) and
 * Codex (shadow home / explicit home) qualify; the rest need a project seed or
 * a user-home write and are not delivered yet.
 */
export type SkillSupport = "supported" | "unsupported";

export const PROVIDER_SKILL_SUPPORT: Readonly<Record<string, SkillSupport>> = {
  claudeAgent: "supported",
  codex: "supported",
  antigravity: "unsupported",
  cursor: "unsupported",
  grok: "unsupported",
  opencode: "unsupported",
  muse: "unsupported",
  pi: "unsupported",
  acpRegistry: "unsupported",
};

export function skillSupportForDriver(driver: string): SkillSupport {
  return PROVIDER_SKILL_SUPPORT[driver] ?? "unsupported";
}
