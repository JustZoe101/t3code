/**
 * Run an environment's shared hooks for one lifecycle event.
 *
 * Hooks are T3-side: the command runs directly (no shell), bounded by a
 * timeout, with output captured and truncated. A hook that fails or times out
 * never fails the turn — it is logged and reported instead.
 *
 * @module server/agentResources/HookRunner
 */
import type { SharedHookEvent } from "@t3tools/contracts";
import type { ResolvedSharedHook } from "@t3tools/provider-core/server/sharedAgentResources";
import * as Cause from "effect/Cause";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

import { ProcessRunner } from "../processRunner.ts";

export interface SharedHookRunResult {
  readonly id: string;
  readonly event: SharedHookEvent;
  readonly status: "completed" | "failed" | "timed-out";
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 64 * 1024;

export const runSharedHooks = Effect.fn("runSharedHooks")(function* (input: {
  readonly runner: ProcessRunner["Service"];
  readonly hooks: ReadonlyArray<ResolvedSharedHook>;
  readonly event: SharedHookEvent;
  readonly cwd?: string | undefined;
}) {
  const runner = input.runner;
  const results: SharedHookRunResult[] = [];

  for (const { id, hook } of input.hooks) {
    if (hook.event !== input.event) continue;
    const env = Object.fromEntries(
      (hook.env ?? []).map((variable) => [variable.name, variable.value]),
    );
    const outcome = yield* runner
      .run({
        command: hook.command,
        args: hook.args ?? [],
        ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
        ...(Object.keys(env).length > 0 ? { env } : {}),
        timeout: Duration.millis(hook.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        timeoutBehavior: "timedOutResult",
        outputMode: "truncate",
        maxOutputBytes: MAX_OUTPUT_BYTES,
      })
      .pipe(
        Effect.map((output): SharedHookRunResult => ({
          id,
          event: input.event,
          status: output.timedOut ? "timed-out" : output.code === 0 ? "completed" : "failed",
          exitCode: output.code,
          stdout: output.stdout,
          stderr: output.stderr,
        })),
        Effect.catchCause((cause) =>
          Effect.succeed<SharedHookRunResult>({
            id,
            event: input.event,
            status: "failed",
            exitCode: null,
            stdout: "",
            stderr: Cause.pretty(cause),
          }),
        ),
      );
    results.push(outcome);
    if (outcome.status !== "completed") {
      yield* Effect.logWarning(`Shared hook '${id}' ${outcome.status}.`, {
        hookId: id,
        event: input.event,
        stderr: outcome.stderr.slice(0, 400),
      });
    }
  }

  return results;
});
