/**
 * Materialize shared skills into a provider's skill root.
 *
 * A shared skill is the user's own directory; T3 links it in as
 * `<root>/<id>` and records which ids it created in a manifest beside them.
 * Teardown removes only ids the manifest names, and only when the entry is
 * still a symlink — a real directory (the user's own skill) is never touched.
 *
 * @module provider-core/server/sharedSkillSeeding
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import type { ResolvedSharedSkill } from "./sharedAgentResources.ts";
import { expandHomePath } from "./pathExpansion.ts";
import { skillSupportForDriver } from "@t3tools/shared/providerResources";

export const SHARED_SKILL_MANIFEST_FILENAME = ".t3-shared-skills.json";

/**
 * The home whose `skills` directory T3 may write into for an instance, or
 * `undefined` when the instance has no managed home. Both supported drivers
 * read `<homePath>/skills`; without an explicit `homePath` the root would be
 * the user's real `~/.claude` or `~/.codex`, which T3 never writes.
 */
export function managedSkillsHomePath(input: {
  readonly driver: string;
  readonly config: unknown;
  readonly home: string;
}): string | undefined {
  if (skillSupportForDriver(input.driver) !== "supported") return undefined;
  const raw =
    input.config !== null &&
    typeof input.config === "object" &&
    typeof (input.config as { homePath?: unknown }).homePath === "string"
      ? (input.config as { homePath: string }).homePath.trim()
      : "";
  if (raw.length === 0) return undefined;
  return expandHomePath(raw, input.home);
}

const Manifest = Schema.fromJsonString(Schema.Array(Schema.String));
const decodeManifest = Schema.decodeUnknownEffect(Manifest);
const encodeManifest = Schema.encodeEffect(Manifest);

export interface SeededSharedSkills {
  /** Skill ids linked into the root, in resolved order. */
  readonly seeded: ReadonlyArray<string>;
  /** Ids T3 could not link, with a reason for the UI/logs. */
  readonly skipped: ReadonlyArray<{ readonly id: string; readonly reason: string }>;
}

const readManifest = (
  fileSystem: FileSystem.FileSystem,
  manifestPath: string,
): Effect.Effect<ReadonlyArray<string>> =>
  fileSystem.readFileString(manifestPath).pipe(
    Effect.flatMap((raw) =>
      decodeManifest(raw).pipe(Effect.orElseSucceed((): ReadonlyArray<string> => [])),
    ),
    Effect.orElseSucceed((): ReadonlyArray<string> => []),
  );

/** Whether `path` currently exists as a symlink. */
const isSymlink = (fileSystem: FileSystem.FileSystem, path: string): Effect.Effect<boolean> =>
  fileSystem.readLink(path).pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  );

export const seedSharedSkills = Effect.fn("seedSharedSkills")(function* (input: {
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly root: string;
  readonly skills: ReadonlyArray<ResolvedSharedSkill>;
}) {
  const fileSystem = input.fileSystem;
  const path = input.path;
  const manifestPath = path.join(input.root, SHARED_SKILL_MANIFEST_FILENAME);

  yield* fileSystem
    .makeDirectory(input.root, { recursive: true })
    .pipe(Effect.orElseSucceed(() => undefined));

  const previous = yield* readManifest(fileSystem, manifestPath);
  const desiredIds = input.skills.map(({ id }) => id);

  // Steady state (the common per-turn call): the manifest already names exactly
  // these ids and every link is still ours. Nothing to touch.
  if (previous.length === desiredIds.length && previous.every((id) => desiredIds.includes(id))) {
    let intact = true;
    for (const id of desiredIds) {
      if (!(yield* isSymlink(fileSystem, path.join(input.root, id)))) {
        intact = false;
        break;
      }
    }
    if (intact) return { seeded: desiredIds, skipped: [] } satisfies SeededSharedSkills;
  }

  const seeded: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const { id, skill } of input.skills) {
    const linkPath = path.join(input.root, id);
    const alreadyLinked = yield* isSymlink(fileSystem, linkPath);
    if (!alreadyLinked) {
      // A real file or directory with this name belongs to the user.
      const exists = yield* fileSystem.stat(linkPath).pipe(
        Effect.as(true),
        Effect.orElseSucceed(() => false),
      );
      if (exists) {
        skipped.push({ id, reason: `${linkPath} already exists and is not a symlink.` });
        continue;
      }
    } else {
      yield* fileSystem.remove(linkPath).pipe(Effect.orElseSucceed(() => undefined));
    }
    const linked = yield* fileSystem.symlink(skill.source, linkPath).pipe(
      Effect.as(true),
      Effect.orElseSucceed(() => false),
    );
    if (linked) seeded.push(id);
    else skipped.push({ id, reason: `Could not link ${linkPath}.` });
  }

  // Remove only ids this manifest created and that are still our symlinks.
  const wanted = new Set(seeded);
  for (const staleId of previous) {
    if (wanted.has(staleId)) continue;
    const stalePath = path.join(input.root, staleId);
    if (!(yield* isSymlink(fileSystem, stalePath))) continue;
    yield* fileSystem.remove(stalePath).pipe(Effect.orElseSucceed(() => undefined));
  }

  const encoded = yield* encodeManifest(seeded);
  yield* fileSystem
    .writeFileString(manifestPath, `${encoded}\n`)
    .pipe(Effect.orElseSucceed(() => undefined));

  return { seeded, skipped } satisfies SeededSharedSkills;
});
