import * as NodeChildProcessSpawner from "@effect/platform-node/NodeChildProcessSpawner";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import type { ResolvedSharedHook } from "@t3tools/provider-core/server/sharedAgentResources";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { layer as processRunnerLayer, ProcessRunner } from "../processRunner.ts";
import { runSharedHooks } from "./HookRunner.ts";

const layerTest = processRunnerLayer.pipe(
  Layer.provide(NodeChildProcessSpawner.layer.pipe(Layer.provide(NodeServices.layer))),
);

const hook = (
  id: string,
  command: string,
  args: ReadonlyArray<string> = [],
  timeoutMs?: number,
): ResolvedSharedHook =>
  ({
    id,
    hook: {
      event: "turn-end",
      command,
      args,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
      targeting: {},
    },
  }) as unknown as ResolvedSharedHook;

it.effect("reports completed and failed hooks without failing the turn", () =>
  Effect.gen(function* () {
    const runner = yield* ProcessRunner;
    const results = yield* runSharedHooks({
      runner,
      event: "turn-end",
      hooks: [hook("ok", "true"), hook("bad", "false")],
    });
    const byId = Object.fromEntries(results.map((result) => [result.id, result.status]));
    assert.equal(byId.ok, "completed");
    assert.equal(byId.bad, "failed");
  }).pipe(Effect.provide(layerTest)),
);

it.effect("only runs hooks for the event being fired", () =>
  Effect.gen(function* () {
    const runner = yield* ProcessRunner;
    const results = yield* runSharedHooks({
      runner,
      event: "session-start",
      hooks: [hook("ok", "true")],
    });
    assert.deepEqual(results, []);
  }).pipe(Effect.provide(layerTest)),
);
