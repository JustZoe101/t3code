/**
 * Environment-wide agent resources — MCP servers now, skills/plugins/hooks in
 * later phases — defined once on `ServerSettings.sharedAgentResources` and
 * delivered to provider instances, steerable per instance through
 * `ProviderInstanceConfig.shared`.
 *
 * Resolve rule (implemented server-side in SharedAgentResourcesService):
 * `environment entries (filtered by targeting + instance overrides) ∪
 * instance-local entries`.
 *
 * This module is intentionally self-contained (imports only baseSchemas) so it
 * can be imported by both settings.ts and providerInstance.ts without cycles.
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { TrimmedNonEmptyString, TrimmedString } from "./baseSchemas.ts";

/** User-chosen key for a shared resource, e.g. `my-db-tools`. `t3-code` is reserved. */
export const SharedResourceId = TrimmedNonEmptyString.pipe(Schema.brand("SharedResourceId"));
export type SharedResourceId = typeof SharedResourceId.Type;

export const SharedMcpTransport = Schema.Literals(["stdio", "http", "sse"]);
export type SharedMcpTransport = typeof SharedMcpTransport.Type;

/**
 * Driver kind a shared resource runs on. Uses the same slug rules as
 * `ProviderDriverKind`; the server compares by string value against
 * `instance.driver` (which is runtime-validated by the driver registry).
 */
export const SharedDriverKind = TrimmedNonEmptyString.pipe(Schema.brand("SharedDriverKind"));
export type SharedDriverKind = typeof SharedDriverKind.Type;

/**
 * Which provider drivers receive this resource. An empty `drivers` array
 * selects every driver that supports the resource's transport.
 */
export const SharedResourceTargeting = Schema.Struct({
  drivers: Schema.optionalKey(Schema.Array(SharedDriverKind)),
  excludeDrivers: Schema.optionalKey(Schema.Array(SharedDriverKind)),
});
export type SharedResourceTargeting = typeof SharedResourceTargeting.Type;

/**
 * One name/value/sensitivity slot inside a shared server's `env` or `headers`.
 * Mirrors `ProviderInstanceEnvironmentVariable` so the server's existing
 * redaction + secret-store materialization paths apply structurally.
 */
export const SharedResourceVariableName = TrimmedNonEmptyString.check(
  Schema.isMaxLength(128),
  Schema.isPattern(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
);
export type SharedResourceVariableName = typeof SharedResourceVariableName.Type;

export const SharedResourceVariable = Schema.Struct({
  name: SharedResourceVariableName,
  value: Schema.String.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  sensitive: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  valueRedacted: Schema.optionalKey(Schema.Boolean),
});
export type SharedResourceVariable = typeof SharedResourceVariable.Type;

/**
 * A user-defined MCP server delivered to provider instances. `stdio` servers
 * run locally (`command`/`args`/`env`); `http`/`sse` servers are contacted at
 * `url`, optionally with static `headers`. The source schema is transport
 * agnostic; per-provider capability checks happen at resolve time against the
 * driver transport matrix, so an unsupported combination surfaces as a
 * readable `unsupported` reason instead of a schema error.
 */
export const SharedMcpServer = Schema.Struct({
  transport: SharedMcpTransport,
  command: Schema.optional(TrimmedNonEmptyString),
  args: Schema.optionalKey(Schema.Array(TrimmedString)),
  env: Schema.optionalKey(Schema.Array(SharedResourceVariable)),
  url: Schema.optional(TrimmedNonEmptyString),
  headers: Schema.optionalKey(Schema.Array(SharedResourceVariable)),
  targeting: SharedResourceTargeting.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type SharedMcpServer = typeof SharedMcpServer.Type;

export const SharedMcpServerMap = Schema.Record(SharedResourceId, SharedMcpServer);
export type SharedMcpServerMap = typeof SharedMcpServerMap.Type;

/**
 * A shared agent skill. `source` is the user's own skill directory (the one
 * holding `SKILL.md`); T3 links it into a provider's skill root and removes
 * that link on teardown, so a provider-owned or user-owned directory is never
 * overwritten.
 */
export const SharedSkill = Schema.Struct({
  source: TrimmedNonEmptyString,
  targeting: SharedResourceTargeting.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type SharedSkill = typeof SharedSkill.Type;

export const SharedSkillMap = Schema.Record(SharedResourceId, SharedSkill);
export type SharedSkillMap = typeof SharedSkillMap.Type;

/**
 * When a shared hook runs. Deliberately three bounded events: T3 runs these
 * itself, so the surface never becomes arbitrary shell injection driven by an
 * agent prompt.
 */
export const SharedHookEvent = Schema.Literals(["session-start", "turn-end", "tool-call"]);
export type SharedHookEvent = typeof SharedHookEvent.Type;

/**
 * A command T3 runs on a lifecycle event. `command`/`args` are executed
 * directly (no shell); `env` values marked sensitive come from the secret
 * store like every other shared variable.
 */
export const SharedHook = Schema.Struct({
  event: SharedHookEvent,
  command: TrimmedNonEmptyString,
  args: Schema.optionalKey(Schema.Array(TrimmedString)),
  env: Schema.optionalKey(Schema.Array(SharedResourceVariable)),
  timeoutMs: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 600_000 })),
  ),
  targeting: SharedResourceTargeting.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type SharedHook = typeof SharedHook.Type;

export const SharedHookMap = Schema.Record(SharedResourceId, SharedHook);
export type SharedHookMap = typeof SharedHookMap.Type;

/**
 * Environment-level shared agent resources. Grows a key per later phase
 * (`plugins`).
 */
export const SharedAgentResources = Schema.Struct({
  mcpServers: SharedMcpServerMap.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
  skills: SharedSkillMap.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
  hooks: SharedHookMap.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type SharedAgentResources = typeof SharedAgentResources.Type;

/** Defaults for fields that clone upstream for round-trip: empty everything. */
export const EMPTY_SHARED_AGENT_RESOURCES: SharedAgentResources = Schema.decodeSync(
  SharedAgentResources,
)({});
