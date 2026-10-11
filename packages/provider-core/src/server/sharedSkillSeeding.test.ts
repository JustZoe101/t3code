import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import type { ResolvedSharedSkill } from "./sharedAgentResources.ts";
import { SHARED_SKILL_MANIFEST_FILENAME, seedSharedSkills } from "./sharedSkillSeeding.ts";

const resolved = (id: string, source: string): ResolvedSharedSkill =>
  ({ id, skill: { source } }) as unknown as ResolvedSharedSkill;

it.effect("links skills, drops stale links, and never overwrites a real directory", () => {
  const base = "/tmp/opencode/t3-skills-test";
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.remove(base, { recursive: true }).pipe(Effect.orElseSucceed(() => undefined));
    const root = path.join(base, "skills");
    const sourceA = path.join(base, "src-a");
    const sourceB = path.join(base, "src-b");
    yield* fs.makeDirectory(sourceA, { recursive: true });
    yield* fs.makeDirectory(sourceB, { recursive: true });

    const first = yield* seedSharedSkills({
      fileSystem: fs,
      path,
      root,
      skills: [resolved("a", sourceA), resolved("b", sourceB)],
    });
    assert.deepEqual(first.seeded, ["a", "b"]);
    assert.equal(yield* fs.readLink(path.join(root, "a")), sourceA);

    // A real directory the user owns is reported, not replaced.
    const userDir = path.join(root, "c");
    yield* fs.makeDirectory(userDir, { recursive: true });
    const second = yield* seedSharedSkills({
      fileSystem: fs,
      path,
      root,
      skills: [resolved("a", sourceA), resolved("c", sourceB)],
    });
    assert.deepEqual(second.seeded, ["a"]);
    assert.equal(second.skipped.length, 1);
    assert.equal((yield* fs.stat(userDir)).type, "Directory");

    // "b" is no longer wanted and its link is gone; the manifest records only
    // what T3 seeded.
    assert.isFalse(yield* fs.exists(path.join(root, "b")));
    assert.equal(
      yield* fs.readFileString(path.join(root, SHARED_SKILL_MANIFEST_FILENAME)),
      '["a"]\n',
    );

    yield* fs.remove(base, { recursive: true }).pipe(Effect.orElseSucceed(() => undefined));
  }).pipe(Effect.provide(NodeServices.layer));
});
