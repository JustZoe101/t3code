/**
 * Manage the environment's shared skills and how each provider instance
 * receives them.
 *
 * A skill is the user's own directory (holding `SKILL.md`); T3 links it into a
 * provider's managed home. The per-driver support comes from
 * `@t3tools/shared/providerResources`, the same matrix the server resolves
 * against, so the UI never claims a delivery the server will not make.
 */
import {
  AuthProvidersManageScope,
  defaultInstanceIdForDriver,
  ProviderDriverKind,
  type EnvironmentId,
  type ProviderInstanceConfig,
  type ProviderInstanceId,
  type SharedResourceId,
  type SharedSkill,
  type SharedSkillMap,
} from "@t3tools/contracts";
import {
  draftFromSharedSkill,
  emptySharedSkillDraft,
  sharedMcpDriverLabel,
  sharedSkillDriverSupport,
  sharedSkillFromDraft,
  type SharedSkillDraft,
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

function DriverChips(props: {
  readonly title: string;
  readonly description: string;
  readonly selected: ReadonlyArray<ProviderDriverKind>;
  readonly disabled: boolean;
  readonly onToggle: (driver: ProviderDriverKind, selected: boolean) => void;
}) {
  return (
    <SettingsRow
      title={props.title}
      description={props.description}
      control={
        <div className="flex flex-wrap justify-end gap-1">
          {sharedSkillDriverSupport().map(({ driver }) => {
            const isSelected = props.selected.includes(driver);
            return (
              <Button
                key={driver}
                type="button"
                size="xs"
                variant={isSelected ? "secondary" : "ghost-muted"}
                aria-pressed={isSelected}
                disabled={props.disabled}
                onClick={() => props.onToggle(driver, !isSelected)}
              >
                {sharedMcpDriverLabel(driver)}
              </Button>
            );
          })}
        </div>
      }
    />
  );
}

export function SharedSkillsSettings({
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

  const skills = settings.sharedAgentResources.skills;
  const entries = useMemo(
    () => Object.entries(skills).sort(([a], [b]) => a.localeCompare(b)),
    [skills],
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

  const [draft, setDraft] = useState<SharedSkillDraft | null>(null);

  const saveDraft = () => {
    if (draft === null) return;
    const skill = sharedSkillFromDraft(draft);
    if (skill === undefined) return;
    const next: Record<string, SharedSkill> = { ...skills };
    if (draft.originalId !== null && draft.originalId !== draft.id.trim()) {
      delete next[draft.originalId];
    }
    next[draft.id.trim()] = skill;
    setDraft(null);
    void updateSettings({ sharedAgentResources: { skills: next as SharedSkillMap } });
  };

  const removeSkill = (id: string) => {
    const next: Record<string, SharedSkill> = { ...skills };
    delete next[id];
    if (draft?.originalId === id) setDraft(null);
    void updateSettings({ sharedAgentResources: { skills: next as SharedSkillMap } });
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
      title="Shared skills"
      titleAction={
        editable ? (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost-muted"
            aria-label="Add shared skill"
            onClick={() => setDraft(emptySharedSkillDraft())}
          >
            <PlusIcon />
          </Button>
        ) : null
      }
      headerAction={
        <span className="text-xs text-muted-foreground">
          Linked into a provider's managed home; the user's real home is never written
        </span>
      }
    >
      {entries.length === 0 && draft === null ? (
        <SettingsRow
          title="No shared skills"
          description="Point at a skill directory and every capable provider instance receives it."
        />
      ) : null}

      {entries.map(([id, skill]) => (
        <SettingsRow
          key={id}
          title={id}
          description={skill.source}
          control={
            <div className="flex flex-wrap items-center justify-end gap-1">
              {sharedSkillDriverSupport().map(({ driver, support }) => (
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
                  onClick={() => setDraft(draftFromSharedSkill(id, skill))}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost-destructive"
                  aria-label={`Delete ${id}`}
                  onClick={() => removeSkill(id)}
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
            description="Key for this skill."
            control={
              <DraftInput
                size="sm"
                className="w-full sm:w-56"
                value={draft.id}
                disabled={!editable || draft.originalId !== null}
                onCommit={(id) => setDraft({ ...draft, id })}
                placeholder="my-skill"
                spellCheck={false}
              />
            }
          />
          <SettingsRow
            title="Source directory"
            description="Absolute path to the skill directory (the one with SKILL.md)."
            control={
              <DraftInput
                size="sm"
                font="mono"
                className="w-full sm:w-56"
                value={draft.source}
                disabled={!editable}
                onCommit={(source) => setDraft({ ...draft, source })}
                placeholder="~/skills/my-skill"
                spellCheck={false}
              />
            }
          />
          <DriverChips
            title="Deliver to drivers"
            description="Empty means every driver that supports shared skills."
            selected={draft.drivers}
            disabled={!editable}
            onToggle={(driver, selected) =>
              setDraft({
                ...draft,
                drivers: selected
                  ? [...draft.drivers, driver]
                  : draft.drivers.filter((candidate) => candidate !== driver),
              })
            }
          />
          <DriverChips
            title="Never deliver to"
            description="Wins over the delivery list."
            selected={draft.excludeDrivers}
            disabled={!editable}
            onToggle={(driver, selected) =>
              setDraft({
                ...draft,
                excludeDrivers: selected
                  ? [...draft.excludeDrivers, driver]
                  : draft.excludeDrivers.filter((candidate) => candidate !== driver),
              })
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
                  disabled={sharedSkillFromDraft(draft) === undefined}
                  onClick={saveDraft}
                >
                  Save skill
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
                aria-label={`Deliver shared skills to ${instanceId}`}
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
