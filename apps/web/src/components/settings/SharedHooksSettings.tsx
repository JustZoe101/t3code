/**
 * Manage the environment's shared hooks and how each provider instance
 * receives them.
 *
 * A hook is a command T3 runs itself on a lifecycle event (session start, turn
 * end, tool call), bounded by a timeout. Hooks are universal, so every driver
 * is eligible; the per-instance switch and the exclude chips are the way out.
 */
import {
  AuthProvidersManageScope,
  defaultInstanceIdForDriver,
  ProviderDriverKind,
  type EnvironmentId,
  type ProviderInstanceConfig,
  type ProviderInstanceId,
  type SharedHook,
  type SharedHookMap,
  type SharedResourceId,
} from "@t3tools/contracts";
import {
  SHARED_HOOK_EVENTS,
  SHARED_HOOK_EVENT_LABELS,
  draftFromSharedHook,
  emptySharedHookDraft,
  sharedHookFromDraft,
  sharedMcpDriverLabel,
  sharedSkillDriverSupport,
  type SharedHookDraft,
} from "@t3tools/client-runtime/state/shared-agent-resources";
import { PlusIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";

import {
  useEnvironmentSettings,
  usePersistEnvironmentProviderInstanceMutation,
  useUpdateEnvironmentSettings,
} from "../../hooks/useSettings";
import { useEnvironmentScope } from "../../state/session";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { DraftInput } from "../ui/draft-input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { SettingsRow, SettingsSection } from "./settingsLayout";

export function SharedHooksSettings({
  environmentId,
  readOnly = false,
}: {
  readonly environmentId: EnvironmentId;
  readonly readOnly?: boolean;
}) {
  const settings = useEnvironmentSettings(environmentId);
  const updateSettings = useUpdateEnvironmentSettings(environmentId);
  const persistInstance = usePersistEnvironmentProviderInstanceMutation(environmentId);
  const canManage = useEnvironmentScope(environmentId, AuthProvidersManageScope);
  const editable = !readOnly && canManage;

  const hooks = settings.sharedAgentResources.hooks;
  const entries = useMemo(
    () => Object.entries(hooks).sort(([a], [b]) => a.localeCompare(b)),
    [hooks],
  );
  const instances = settings.providerInstances ?? {};
  const instanceEntries = useMemo(() => {
    const map = new Map<string, ProviderInstanceConfig>(
      Object.entries(instances).map(([id, instance]) => [id, instance]),
    );
    for (const driver of [
      ProviderDriverKind.make("codex"),
      ProviderDriverKind.make("claudeAgent"),
    ]) {
      const defaultId = String(defaultInstanceIdForDriver(driver));
      if (!map.has(defaultId)) map.set(defaultId, { driver });
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [instances]);

  const [draft, setDraft] = useState<SharedHookDraft | null>(null);

  const saveDraft = () => {
    if (draft === null) return;
    const hook = sharedHookFromDraft(draft);
    if (hook === undefined) return;
    const next: Record<string, SharedHook> = { ...hooks };
    if (draft.originalId !== null && draft.originalId !== draft.id.trim()) {
      delete next[draft.originalId];
    }
    next[draft.id.trim()] = hook;
    setDraft(null);
    void updateSettings({ sharedAgentResources: { hooks: next as SharedHookMap } });
  };

  const removeHook = (id: string) => {
    const next: Record<string, SharedHook> = { ...hooks };
    delete next[id];
    if (draft?.originalId === id) setDraft(null);
    void updateSettings({ sharedAgentResources: { hooks: next as SharedHookMap } });
  };

  const updateInstanceShared = (
    instanceId: ProviderInstanceId,
    instance: ProviderInstanceConfig,
    mutate: (
      shared: NonNullable<ProviderInstanceConfig["shared"]>,
    ) => NonNullable<ProviderInstanceConfig["shared"]>,
  ) => {
    void persistInstance({
      operation: "upsert",
      instanceId,
      instance: { ...instance, shared: mutate(instance.shared ?? {}) },
    });
  };

  return (
    <SettingsSection
      title="Shared hooks"
      titleAction={
        editable ? (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost-muted"
            aria-label="Add shared hook"
            onClick={() => setDraft(emptySharedHookDraft())}
          >
            <PlusIcon />
          </Button>
        ) : null
      }
      headerAction={
        <span className="text-xs text-muted-foreground">
          Run by T3 on a lifecycle event, bounded by a timeout
        </span>
      }
    >
      {entries.length === 0 && draft === null ? (
        <SettingsRow
          title="No shared hooks"
          description="Run a command when a session starts or a turn ends."
        />
      ) : null}

      {entries.map(([id, hook]) => (
        <SettingsRow
          key={id}
          title={id}
          description={`${SHARED_HOOK_EVENT_LABELS[hook.event]} · ${[hook.command, ...(hook.args ?? [])].join(" ")}`}
          control={
            <Badge size="sm" variant="outline">
              {SHARED_HOOK_EVENT_LABELS[hook.event]}
            </Badge>
          }
          resetAction={
            editable ? (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => setDraft(draftFromSharedHook(id, hook))}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost-destructive"
                  aria-label={`Delete ${id}`}
                  onClick={() => removeHook(id)}
                >
                  <XIcon />
                </Button>
              </div>
            ) : null
          }
        />
      ))}

      {draft !== null ? (
        <div className="space-y-1 bg-muted/20">
          <SettingsRow
            title="Name"
            description="Key for this hook."
            control={
              <DraftInput
                size="sm"
                className="w-full sm:w-56"
                value={draft.id}
                disabled={!editable || draft.originalId !== null}
                onCommit={(id) => setDraft({ ...draft, id })}
                placeholder="my-hook"
                spellCheck={false}
              />
            }
          />
          <SettingsRow
            title="Event"
            description="When T3 runs the command."
            control={
              <Select
                value={draft.event}
                onValueChange={(next) => {
                  const event = SHARED_HOOK_EVENTS.find((candidate) => candidate === next);
                  if (event !== undefined) setDraft({ ...draft, event });
                }}
              >
                <SelectTrigger size="sm" className="w-full sm:w-56" aria-label="Hook event">
                  <SelectValue>{SHARED_HOOK_EVENT_LABELS[draft.event]}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  {SHARED_HOOK_EVENTS.map((event) => (
                    <SelectItem key={event} value={event}>
                      {SHARED_HOOK_EVENT_LABELS[event]}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            }
          />
          <SettingsRow
            title="Command"
            description="Program to run (no shell)."
            control={
              <DraftInput
                size="sm"
                font="mono"
                className="w-full sm:w-56"
                value={draft.command}
                disabled={!editable}
                onCommit={(command) => setDraft({ ...draft, command })}
                placeholder="npx"
                spellCheck={false}
              />
            }
          />
          <SettingsRow
            title="Arguments"
            description="Space-separated."
            control={
              <DraftInput
                size="sm"
                font="mono"
                className="w-full sm:w-56"
                value={draft.args}
                disabled={!editable}
                onCommit={(args) => setDraft({ ...draft, args })}
                placeholder="lint --fix"
                spellCheck={false}
              />
            }
          />
          <SettingsRow
            title="Timeout"
            description="Milliseconds. Empty uses 30s."
            control={
              <DraftInput
                size="sm"
                className="w-full sm:w-56"
                value={draft.timeoutMs}
                disabled={!editable}
                onCommit={(timeoutMs) => setDraft({ ...draft, timeoutMs })}
                placeholder="30000"
                spellCheck={false}
              />
            }
          />
          <SettingsRow
            title="Deliver to drivers"
            description="Empty means every driver (hooks are universal)."
            control={
              <div className="flex flex-wrap justify-end gap-1">
                {sharedSkillDriverSupport().map(({ driver }) => {
                  const selected = draft.drivers.includes(driver);
                  return (
                    <Button
                      key={driver}
                      type="button"
                      size="xs"
                      variant={selected ? "secondary" : "ghost-muted"}
                      aria-pressed={selected}
                      disabled={!editable}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          drivers: selected
                            ? draft.drivers.filter((candidate) => candidate !== driver)
                            : [...draft.drivers, driver],
                        })
                      }
                    >
                      {sharedMcpDriverLabel(driver)}
                    </Button>
                  );
                })}
              </div>
            }
          />
          <SettingsRow
            title="Save"
            control={
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost-muted"
                  onClick={() => setDraft(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={sharedHookFromDraft(draft) === undefined}
                  onClick={saveDraft}
                >
                  Save hook
                </Button>
              </div>
            }
          />
        </div>
      ) : null}

      {instanceEntries.length > 0 ? (
        <div className="border-t border-border/60 pt-1">
          <div className="px-3 py-2 text-xs text-muted-foreground sm:px-4">
            Per provider instance
          </div>
        </div>
      ) : null}

      {instanceEntries.map(([rawId, instance]) => {
        const instanceId = rawId as ProviderInstanceId;
        const disabledIds = instance.shared?.disabledResourceIds ?? [];
        const enabled = instance.shared?.enabled !== false;
        return (
          <SettingsRow
            key={rawId}
            title={instance.displayName ?? sharedMcpDriverLabel(instance.driver)}
            description={sharedMcpDriverLabel(instance.driver)}
            control={
              <Switch
                checked={enabled}
                disabled={!editable}
                onCheckedChange={(checked) =>
                  updateInstanceShared(instanceId, instance, (shared) => ({
                    ...shared,
                    enabled: checked,
                  }))
                }
                aria-label={`Deliver shared hooks to ${instanceId}`}
              />
            }
          >
            {enabled && entries.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1 pb-2">
                {entries.map(([id]) => {
                  const excluded = disabledIds.some((candidate) => String(candidate) === id);
                  return (
                    <Button
                      key={id}
                      type="button"
                      size="xs"
                      variant={excluded ? "ghost-muted" : "secondary"}
                      aria-pressed={!excluded}
                      disabled={!editable}
                      onClick={() =>
                        updateInstanceShared(instanceId, instance, (shared) => {
                          const current = shared.disabledResourceIds ?? [];
                          const without = current.filter((candidate) => String(candidate) !== id);
                          return {
                            ...shared,
                            disabledResourceIds: excluded
                              ? [...without, id as SharedResourceId]
                              : without,
                          };
                        })
                      }
                    >
                      {id}
                    </Button>
                  );
                })}
              </div>
            ) : null}
          </SettingsRow>
        );
      })}
    </SettingsSection>
  );
}
