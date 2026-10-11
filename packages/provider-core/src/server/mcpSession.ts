import type { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import type { ResolvedSharedMcpServer, ResolvedSharedSkill } from "./sharedAgentResources.ts";

export interface McpProviderSessionConfig {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly providerSessionId: string;
  readonly providerInstanceId: ProviderInstanceId;
  readonly endpoint: string;
  readonly authorizationHeader: string;
  /**
   * Whether this credential includes the "preview" capability. Adapters read
   * it to keep developer instructions truthful: when the user withholds agent
   * browser access, the prompt must not advertise `preview_*` tools that every
   * call would reject.
   */
  readonly browserToolsAvailable: boolean;
  /** Capabilities the credential grants ("preview", "device"). */
  readonly capabilities?: ReadonlySet<string>;
  /**
   * Set when the session may drive devices. Adapters spread this into the
   * provider subprocess environment so the `agent-device` CLI is on PATH and
   * already pointed at the server's daemon; the agent never handles a token.
   */
  readonly agentDeviceEnvironment?: Readonly<Record<string, string>>;
  /**
   * User-configured MCP servers this instance should also carry, resolved from
   * `ServerSettings.sharedAgentResources` and the instance's `shared` steering
   * when the session is prepared. Values are already materialized from the
   * secret store, so adapters only translate them into provider config.
   */
  readonly sharedMcpServers?: ReadonlyArray<ResolvedSharedMcpServer>;
  /**
   * User-configured shared skills this instance should also carry, resolved the
   * same way. Each entry's `skill.source` is the user's own skill directory;
   * adapters link it into a provider skill root and remove stale links.
   */
  readonly sharedSkills?: ReadonlyArray<ResolvedSharedSkill>;
}

/** Provider env with the device variables applied over `base`, or `base` untouched. */
export function withAgentDeviceEnvironment(
  base: NodeJS.ProcessEnv,
  config: Pick<McpProviderSessionConfig, "agentDeviceEnvironment"> | undefined,
): NodeJS.ProcessEnv {
  const extra = config?.agentDeviceEnvironment;
  if (!extra) return base;
  const separator = extra.PATH_SEPARATOR ?? ":";
  const basePath = base.PATH ?? base.Path;
  const { PATH: shimDir, PATH_SEPARATOR: _separator, ...rest } = extra;
  return {
    ...base,
    ...rest,
    ...(shimDir ? { PATH: basePath ? `${shimDir}${separator}${basePath}` : shimDir } : {}),
  };
}
