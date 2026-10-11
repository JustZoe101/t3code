import { describe, expect, it } from "vite-plus/test";
import type { ProviderDriverKind } from "@t3tools/contracts";

import {
  emptySharedMcpServerDraft,
  sharedMcpServerFromDraft,
  sharedServerSupportBadges,
} from "./sharedAgentResources.ts";

const supportFor = (server: NonNullable<ReturnType<typeof sharedMcpServerFromDraft>>) =>
  Object.fromEntries(
    sharedServerSupportBadges(server).map(({ driver, support }) => [driver, support]),
  );

describe("shared MCP server draft", () => {
  it("requires a name, and a command or url for the chosen transport", () => {
    expect(sharedMcpServerFromDraft({ ...emptySharedMcpServerDraft(), id: "" })).toBeUndefined();
    expect(sharedMcpServerFromDraft({ ...emptySharedMcpServerDraft(), id: "x" })).toBeUndefined();
    expect(
      sharedMcpServerFromDraft({ ...emptySharedMcpServerDraft(), id: "x", command: "npx" }),
    ).toBeDefined();
    expect(
      sharedMcpServerFromDraft({ ...emptySharedMcpServerDraft(), id: "x", transport: "http" }),
    ).toBeUndefined();
    expect(
      sharedMcpServerFromDraft({
        ...emptySharedMcpServerDraft(),
        id: "x",
        transport: "http",
        url: "https://x/mcp",
      }),
    ).toBeDefined();
  });

  it("splits stdio arguments and carries targeting through", () => {
    const server = sharedMcpServerFromDraft({
      ...emptySharedMcpServerDraft(),
      id: "demo",
      command: "npx",
      args: "-y  some-server",
      drivers: ["codex" as ProviderDriverKind],
      excludeDrivers: ["cursor" as ProviderDriverKind],
    });
    expect(server?.args).toEqual(["-y", "some-server"]);
    expect(server?.targeting?.drivers).toEqual(["codex"]);
    expect(server?.targeting?.excludeDrivers).toEqual(["cursor"]);
  });

  it("reports the per-driver transport support the resolve step uses", () => {
    const stdio = sharedMcpServerFromDraft({
      ...emptySharedMcpServerDraft(),
      id: "x",
      command: "npx",
    })!;
    const stdioSupport = supportFor(stdio);
    expect(stdioSupport.claudeAgent).toBe("supported");
    expect(stdioSupport.muse).toBe("unsupported");
    expect(stdioSupport.pi).toBe("unsupported");

    const remote = sharedMcpServerFromDraft({
      ...emptySharedMcpServerDraft(),
      id: "x",
      transport: "http",
      url: "https://x/mcp",
    })!;
    const remoteSupport = supportFor(remote);
    expect(remoteSupport.muse).toBe("supported");
    expect(remoteSupport.codex).toBe("supported");
    // ACP agents drop injected HTTP servers, so those read as unreliable.
    expect(remoteSupport.grok).toBe("unreliable");
  });
});
