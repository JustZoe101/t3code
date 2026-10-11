/**
 * Mobile parity for the shared skills surface: list an environment's skills
 * with per-driver support, add/edit/remove them, and steer each provider
 * instance with a master switch and per-skill include/exclude chips.
 */
import {
  AuthProvidersManageScope,
  defaultInstanceIdForDriver,
  ProviderDriverKind,
  type ProviderInstanceConfig,
  type ProviderInstanceId,
  type ServerSettingsPatch,
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
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/AppText";
import { ScreenScrollView } from "../../components/ScreenScrollView";
import { cn } from "../../lib/cn";
import { readEnvironmentScope } from "../../state/session";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { SettingsActionRow } from "./components/SettingsActionRow";
import {
  AndroidSettingsEnvironmentFilter,
  SettingsEnvironmentFilterHeader,
} from "./components/SettingsEnvironmentFilterHeader";
import { SettingsScreen } from "./components/SettingsScreen";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsSwitchRow } from "./components/SettingsSwitchRow";
import { useSettingsEnvironmentFilter, type SettingsTarget } from "./settings-environment-filter";

export function SettingsSharedSkillsRouteScreen() {
  const { selectedTargets } = useSettingsEnvironmentFilter();
  const insets = useSafeAreaInsets();
  return (
    <>
      <SettingsEnvironmentFilterHeader />
      <SettingsScreen title="Shared skills" trailing={<AndroidSettingsEnvironmentFilter />}>
        <ScreenScrollView
          className="flex-1"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerClassName="gap-6 px-5 pt-4"
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
        >
          {selectedTargets.length === 0 ? (
            <Text className="px-2 text-base text-foreground-muted">
              Use the filter above to select a connected environment.
            </Text>
          ) : (
            selectedTargets.map((environment) => (
              <SharedSkillsEnvironment key={environment.environmentId} environment={environment} />
            ))
          )}
        </ScreenScrollView>
      </SettingsScreen>
    </>
  );
}

function SharedSkillsEnvironment({ environment }: { readonly environment: SettingsTarget }) {
  const settings = environment.serverConfig.settings;
  const canManage = readEnvironmentScope(environment.environmentId, AuthProvidersManageScope);
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: "shared skills update",
    reportFailure: true,
  });
  const [draft, setDraft] = useState<SharedSkillDraft | null>(null);

  const skills = settings.sharedAgentResources.skills;
  const entries = Object.entries(skills).sort(([a], [b]) => a.localeCompare(b));
  const instances = settings.providerInstances ?? {};
  const instanceEntries: Array<[ProviderInstanceId, ProviderInstanceConfig]> = [];
  for (const [id, instance] of Object.entries(instances)) {
    instanceEntries.push([id as ProviderInstanceId, instance]);
  }
  for (const driver of [ProviderDriverKind.make("codex"), ProviderDriverKind.make("claudeAgent")]) {
    const defaultId = defaultInstanceIdForDriver(driver);
    if (!instanceEntries.some(([id]) => id === defaultId)) {
      instanceEntries.push([defaultId, { driver }]);
    }
  }
  instanceEntries.sort(([a], [b]) => a.localeCompare(b));

  const patch = (next: Record<string, SharedSkill>) =>
    void updateSettings({
      environmentId: environment.environmentId,
      input: { patch: { sharedAgentResources: { skills: next as SharedSkillMap } } },
    });

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
    patch(next);
  };

  const removeSkill = (id: string) => {
    const next: Record<string, SharedSkill> = { ...skills };
    delete next[id];
    if (draft?.originalId === id) setDraft(null);
    patch(next);
  };

  const saveInstance = (instanceId: ProviderInstanceId, instance: ProviderInstanceConfig) => {
    void updateSettings({
      environmentId: environment.environmentId,
      input: {
        patch: {} as ServerSettingsPatch,
        providerInstanceMutation: { operation: "upsert", instanceId, instance },
      },
    });
  };

  return (
    <>
      <SettingsSection title={environment.label}>
        {entries.length === 0 ? (
          <Text className="p-4 text-foreground-muted">
            No shared skills. Point at a skill directory and every capable provider receives it.
          </Text>
        ) : null}
        {entries.map(([id, skill]) => (
          <View key={id} className="gap-2 border-b border-border-subtle p-4">
            <Text className="text-lg font-semibold text-foreground">{id}</Text>
            <Text className="text-sm text-foreground-muted">{skill.source}</Text>
            <View className="flex-row flex-wrap gap-x-3 gap-y-1">
              {sharedSkillDriverSupport().map(({ driver, support }) => (
                <Text
                  key={driver}
                  className={cn(
                    "text-xs",
                    support === "supported"
                      ? "text-foreground-muted"
                      : "text-foreground-muted opacity-60",
                  )}
                >
                  {sharedMcpDriverLabel(driver)}
                  {support === "supported" ? "" : " ✕"}
                </Text>
              ))}
            </View>
            {canManage ? (
              <View className="flex-row gap-4 pt-1">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${id}`}
                  onPress={() => setDraft(draftFromSharedSkill(id, skill))}
                >
                  <Text className="text-sm text-primary">Edit</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${id}`}
                  onPress={() => removeSkill(id)}
                >
                  <Text className="text-sm text-danger-foreground">Delete</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ))}
        {canManage ? (
          <SettingsActionRow
            icon="plus"
            label="Add skill"
            onPress={() => setDraft(emptySharedSkillDraft())}
          />
        ) : (
          <Text className="p-4 text-foreground-muted">
            This connection can view shared skills but not change them.
          </Text>
        )}
      </SettingsSection>

      {draft !== null ? (
        <SettingsSection
          title={draft.originalId === null ? "New skill" : `Edit ${draft.originalId}`}
        >
          <View>
            <View className="gap-1 border-b border-border-subtle p-4">
              <Text className="text-sm text-foreground-muted">Name</Text>
              <TextInput
                accessibilityLabel="Skill name"
                className="rounded-lg border border-border-subtle px-3 py-2 text-base text-foreground"
                placeholderTextColorClassName="accent-foreground-muted"
                placeholder="my-skill"
                value={draft.id}
                editable={canManage && draft.originalId === null}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(id) => setDraft({ ...draft, id })}
              />
            </View>
            <View className="gap-1 border-b border-border-subtle p-4">
              <Text className="text-sm text-foreground-muted">Source directory</Text>
              <TextInput
                accessibilityLabel="Skill source directory"
                className="rounded-lg border border-border-subtle px-3 py-2 text-base text-foreground"
                placeholderTextColorClassName="accent-foreground-muted"
                placeholder="~/skills/my-skill"
                value={draft.source}
                editable={canManage}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(source) => setDraft({ ...draft, source })}
              />
            </View>
            <DriverChips
              title="Deliver to drivers (empty = all that support skills)"
              selected={draft.drivers}
              disabled={!canManage}
              onToggle={(driver, on) =>
                setDraft({
                  ...draft,
                  drivers: on
                    ? [...draft.drivers, driver]
                    : draft.drivers.filter((candidate) => candidate !== driver),
                })
              }
            />
            <DriverChips
              title="Never deliver to"
              selected={draft.excludeDrivers}
              disabled={!canManage}
              onToggle={(driver, on) =>
                setDraft({
                  ...draft,
                  excludeDrivers: on
                    ? [...draft.excludeDrivers, driver]
                    : draft.excludeDrivers.filter((candidate) => candidate !== driver),
                })
              }
            />
            <SettingsActionRow
              icon="checkmark"
              label="Save skill"
              disabled={sharedSkillFromDraft(draft) === undefined}
              onPress={saveDraft}
            />
            <SettingsActionRow icon="xmark" label="Cancel" onPress={() => setDraft(null)} />
          </View>
        </SettingsSection>
      ) : null}

      <SettingsSection title="Per provider instance">
        {instanceEntries.map(([instanceId, instance]) => {
          const enabled = instance.shared?.enabled !== false;
          const disabledIds = instance.shared?.disabledResourceIds ?? [];
          return (
            <View key={String(instanceId)} className="border-b border-border-subtle">
              <SettingsSwitchRow
                icon="server.rack"
                label={instance.displayName ?? sharedMcpDriverLabel(instance.driver)}
                subtitle={instance.displayName ? sharedMcpDriverLabel(instance.driver) : undefined}
                value={enabled}
                disabled={!canManage}
                onValueChange={(next) =>
                  saveInstance(instanceId, {
                    ...instance,
                    shared: { ...instance.shared, enabled: next },
                  })
                }
              />
              {enabled && entries.length > 0 ? (
                <View className="flex-row flex-wrap gap-2 px-4 pb-3">
                  {entries.map(([id]) => {
                    const excluded = disabledIds.some((candidate) => String(candidate) === id);
                    return (
                      <Pressable
                        key={id}
                        accessibilityRole="button"
                        accessibilityLabel={`${excluded ? "Include" : "Exclude"} skill ${id} for ${instanceId}`}
                        disabled={!canManage}
                        onPress={() =>
                          saveInstance(instanceId, {
                            ...instance,
                            shared: {
                              ...instance.shared,
                              disabledResourceIds: excluded
                                ? disabledIds.filter((candidate) => String(candidate) !== id)
                                : [...disabledIds, id as SharedResourceId],
                            },
                          })
                        }
                        className={cn(
                          "rounded-full border px-3 py-1",
                          excluded
                            ? "border-border-subtle opacity-60"
                            : "border-primary bg-primary/10",
                        )}
                      >
                        <Text className={excluded ? "text-foreground-muted" : "text-primary"}>
                          {id}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}
      </SettingsSection>
    </>
  );
}

function DriverChips(props: {
  readonly title: string;
  readonly selected: ReadonlyArray<ProviderDriverKind>;
  readonly disabled: boolean;
  readonly onToggle: (driver: ProviderDriverKind, selected: boolean) => void;
}) {
  return (
    <View className="gap-2 border-b border-border-subtle p-4">
      <Text className="text-sm text-foreground-muted">{props.title}</Text>
      <View className="flex-row flex-wrap gap-2">
        {sharedSkillDriverSupport().map(({ driver }) => {
          const on = props.selected.includes(driver);
          return (
            <Pressable
              key={driver}
              accessibilityRole="button"
              accessibilityLabel={`${props.title}: ${sharedMcpDriverLabel(driver)}`}
              accessibilityState={{ selected: on }}
              disabled={props.disabled}
              onPress={() => props.onToggle(driver, !on)}
              className={cn(
                "rounded-full border px-3 py-1",
                on ? "border-primary bg-primary/10" : "border-border-subtle",
              )}
            >
              <Text className={on ? "text-primary" : "text-foreground-muted"}>
                {sharedMcpDriverLabel(driver)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
