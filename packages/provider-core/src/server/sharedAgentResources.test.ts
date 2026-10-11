import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import {
  SharedAgentResources,
  type SharedMcpServerMap,
  type SharedResourceId,
} from "@t3tools/contracts";

import { resolveSharedMcpServers } from "./sharedAgentResources.ts";

const decodeResources = Schema.decodeUnknownSync(SharedAgentResources);

/** The maps are keyed by a branded id; a plain literal needs the cast in tests. */
const asMap = (servers: Record<string, unknown>) => servers as unknown as SharedMcpServerMap;

const stdio = (command: string) => ({ transport: "stdio" as const, command });
const http = (url: string) => ({ transport: "http" as const, url });

describe("resolveSharedMcpServers", () => {
  it("delivers environment servers the driver can carry", () => {
    const resources = decodeResources({
      mcpServers: {
        "alpha-db": { ...stdio("alpha-mcp"), args: ["--read-only"] },
        "beta-api": http("https://beta.example/mcp"),
      },
    });

    const { servers, rejected } = resolveSharedMcpServers({
      resources,
      instance: { driver: "claudeAgent" },
    });

    expect(servers.map(({ id, transport }) => ({ id, transport }))).toEqual([
      { id: "alpha-db", transport: "stdio" },
      { id: "beta-api", transport: "http" },
    ]);
    expect(rejected).toEqual([]);
  });

  it("rejects a transport the driver cannot carry, and warns on an unreliable one", () => {
    const resources = decodeResources({
      mcpServers: {
        remote: http("https://remote.example/mcp"),
        "sse-only": { transport: "sse", url: "https://sse.example/mcp" },
      },
    });

    const muse = resolveSharedMcpServers({
      resources,
      instance: { driver: "muse" }, // streamable HTTP only
    });
    expect(muse.servers.map(({ id }) => id)).toEqual(["remote"]);
    expect(muse.rejected.map(({ id }) => id)).toEqual(["sse-only"]);

    const grok = resolveSharedMcpServers({
      resources,
      instance: { driver: "grok" }, // ACP: injected HTTP is unreliable
    });
    expect(grok.servers).toEqual([]);
    expect(grok.rejected.map(({ id }) => id).sort()).toEqual(["remote", "sse-only"]);
  });

  it("filters by targeting, with exclude winning over an explicit allow", () => {
    const resources = decodeResources({
      mcpServers: {
        "codex-only": { ...stdio("codex-mcp"), targeting: { drivers: ["codex"] } },
        "not-codex": { ...stdio("other-mcp"), targeting: { excludeDrivers: ["codex"] } },
      },
    });

    const codex = resolveSharedMcpServers({ resources, instance: { driver: "codex" } });
    expect(codex.servers.map(({ id }) => id)).toEqual(["codex-only"]);

    const claude = resolveSharedMcpServers({ resources, instance: { driver: "claudeAgent" } });
    expect(claude.servers.map(({ id }) => id)).toEqual(["not-codex"]);
  });

  it("lets an instance disable everything, or specific environment servers", () => {
    const resources = decodeResources({
      mcpServers: { alpha: stdio("alpha-mcp"), beta: stdio("beta-mcp") },
    });

    const off = resolveSharedMcpServers({
      resources,
      instance: { driver: "codex", shared: { enabled: false } },
    });
    expect(off).toEqual({ servers: [], rejected: [] });

    const selective = resolveSharedMcpServers({
      resources,
      instance: { driver: "codex", shared: { disabledResourceIds: ["alpha" as SharedResourceId] } },
    });
    expect(selective.servers.map(({ id }) => id)).toEqual(["beta"]);
  });

  it("merges instance-local servers, an instance-local id overriding the environment's", () => {
    const resources = decodeResources({
      mcpServers: { shared: stdio("environment-mcp") },
    });

    const { servers } = resolveSharedMcpServers({
      resources,
      instance: {
        driver: "codex",
        shared: {
          mcpServers: asMap({ shared: stdio("instance-mcp"), "local-only": stdio("local-mcp") }),
        },
      },
    });

    expect(servers.map(({ id, server }) => ({ id, command: server.command }))).toEqual([
      { id: "local-only", command: "local-mcp" },
      { id: "shared", command: "instance-mcp" },
    ]);
  });

  it("never lets configuration shadow T3's own server id", () => {
    const resources = decodeResources({
      mcpServers: { "t3-code": stdio("impostor") },
    });
    const { servers, rejected } = resolveSharedMcpServers({
      resources,
      instance: { driver: "codex" },
    });
    expect(servers).toEqual([]);
    expect(rejected).toEqual([]);
  });
});
