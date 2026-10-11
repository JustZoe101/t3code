/**
 * Manage the environment's shared plugins and how each provider instance
 * receives them.
 *
 * A plugin is the user's own directory in the Agent-Plugins form; T3 links it
 * into a provider's managed plugin root. Only Codex exposes one today, so the
 * per-driver badges show the rest as unsupported rather than pretending.
 */
import {
  AuthProvidersManageScope,
  defaultInstanceIdForDriver,
  ProviderDriverKind,
  type EnvironmentId,
  type ProviderInstanceConfig,
  type ProviderInstanceId,
  type SharedPlugin,
  type SharedPluginMap,
  type SharedResourceId,
} from "@t3tools/contracts";
import {
  draftFromSharedPlugin,
  emptySharedPluginDraft,
  sharedMcpDriverLabel,
  sharedPluginDriverSupport,
  sharedPluginFromDraft,
  type SharedPluginDraft,
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
import { Switch } from "../ui/switch";
import { SettingsRow, SettingsSection } from "./settingsLayout";

export function SharedPluginsSettings({
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

  const plugins = settings.sharedAgentResources.plugins;
  const entries = useMemo(
    () => Object.entries(plugins).sort(([a], [b]) => a.localeCompare(b)),
    [plugins],
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

  const [draft, setDraft] = useState<SharedPluginDraft | null>(null);

  const saveDraft = () => {
    if (draft === null) return;
    const plugin = sharedPluginFromDraft(draft);
    if (plugin === undefined) return;
    const next: Record<string, SharedPlugin> = { ...plugins };
    if (draft.originalId !== null && draft.originalId !== draft.id.trim()) {
      delete next[draft.originalId];
    }
    next[draft.id.trim()] = plugin;
    setDraft(null);
    void updateSettings({ sharedAgentResources: { plugins: next as SharedPluginMap } });
  };

  const removePlugin = (id: string) => {
    const next: Record<string, SharedPlugin> = { ...plugins };
    delete next[id];
    if (draft?.originalId === id) setDraft(null);
    void updateSettings({ sharedAgentResources: { plugins: next as SharedPluginMap } });
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
      title="Shared plugins"
      titleAction={
        editable ? (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost-muted"
            aria-label="Add shared plugin"
            onClick={() => setDraft(emptySharedPluginDraft())}
          >
            <PlusIcon />
          </Button>
        ) : null
      }
      headerAction={
        <span className="text-xs text-muted-foreground">
          Linked into a provider's managed plugin root; only Codex exposes one today
        </span>
      }
    >
      {entries.length === 0 && draft === null ? (
        <SettingsRow
          title="No shared plugins"
          description="Point at a plugin directory and every capable provider instance receives it."
        />
      ) : null}

      {entries.map(([id, plugin]) => (
        <SettingsRow
          key={id}
          title={id}
          description={plugin.source}
          control={
            <div className="flex flex-wrap items-center justify-end gap-1">
              {sharedPluginDriverSupport().map(({ driver, support }) => (
                <Badge
                  key={driver}
                  size="sm"
                  variant={support === "supported" ? "success" : "outline"}
                >
                  {sharedMcpDriverLabel(driver)}
                </Badge>
              ))}
            </div>
          }
          resetAction={
            editable ? (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => setDraft(draftFromSharedPlugin(id, plugin))}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost-destructive"
                  aria-label={`Delete ${id}`}
                  onClick={() => removePlugin(id)}
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
            description="Key for this plugin."
            control={
              <DraftInput
                size="sm"
                className="w-full sm:w-56"
                value={draft.id}
                disabled={!editable || draft.originalId !== null}
                onCommit={(id) => setDraft({ ...draft, id })}
                placeholder="my-plugin"
                spellCheck={false}
              />
            }
          />
          <SettingsRow
            title="Source directory"
            description="Absolute path to the plugin directory (the one with plugin.json)."
            control={
              <DraftInput
                size="sm"
                font="mono"
                className="w-full sm:w-56"
                value={draft.source}
                disabled={!editable}
                onCommit={(source) => setDraft({ ...draft, source })}
                placeholder="~/plugins/my-plugin"
                spellCheck={false}
              />
            }
          />
          <SettingsRow
            title="Deliver to drivers"
            description="Empty means every driver with a managed plugin root."
            control={
              <div className="flex flex-wrap justify-end gap-1">
                {sharedPluginDriverSupport().map(({ driver }) => {
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
                  disabled={sharedPluginFromDraft(draft) === undefined}
                  onClick={saveDraft}
                >
                  Save plugin
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
                aria-label={`Deliver shared plugins to ${instanceId}`}
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
