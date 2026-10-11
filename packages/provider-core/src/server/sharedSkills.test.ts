import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { SharedAgentResources, type SharedSkillMap } from "@t3tools/contracts";

import { resolveSharedSkills } from "./sharedAgentResources.ts";
import { managedSkillsHomePath } from "./sharedSkillSeeding.ts";

const decodeResources = Schema.decodeUnknownSync(SharedAgentResources);
const skill = (source: string) => ({ source });

describe("resolveSharedSkills", () => {
  it("delivers skills to supported drivers and rejects the rest", () => {
    const resources = decodeResources({ skills: { "team-style": skill("/skills/team-style") } });

    const claude = resolveSharedSkills({ resources, instance: { driver: "claudeAgent" } });
    expect(claude.skills.map(({ id }) => id)).toEqual(["team-style"]);
    expect(claude.rejected).toEqual([]);

    const grok = resolveSharedSkills({ resources, instance: { driver: "grok" } });
    expect(grok.skills).toEqual([]);
    expect(grok.rejected.map(({ id }) => id)).toEqual(["team-style"]);
  });

  it("honours the instance switch and lets an instance-local skill override one", () => {
    const resources = decodeResources({ skills: { shared: skill("/s/shared") } });

    expect(
      resolveSharedSkills({
        resources,
        instance: { driver: "codex", shared: { enabled: false } },
      }),
    ).toEqual({ skills: [], rejected: [] });

    const merged = resolveSharedSkills({
      resources,
      instance: {
        driver: "codex",
        shared: {
          skills: {
            shared: skill("/s/override"),
            local: skill("/s/local"),
          } as unknown as SharedSkillMap,
        },
      },
    });
    expect(merged.skills.map(({ id, skill: entry }) => ({ id, source: entry.source }))).toEqual([
      { id: "local", source: "/s/local" },
      { id: "shared", source: "/s/override" },
    ]);
  });
});

describe("managedSkillsHomePath", () => {
  it("returns an expanded managed home only for supported drivers with a homePath", () => {
    expect(
      managedSkillsHomePath({
        driver: "claudeAgent",
        config: { homePath: "~/.claude-t3" },
        home: "/home/me",
      }),
    ).toBe("/home/me/.claude-t3");
    expect(managedSkillsHomePath({ driver: "claudeAgent", config: {}, home: "/home/me" })).toBe(
      undefined,
    );
    expect(
      managedSkillsHomePath({ driver: "grok", config: { homePath: "~/.grok" }, home: "/home/me" }),
    ).toBeUndefined();
  });
});
