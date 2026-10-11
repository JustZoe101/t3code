/**
 * Mobile parity for the shared MCP servers surface.
 *
 * An environment defines MCP servers once; this screen lists them with the
 * per-driver transport support the server resolves against, lets them be
 * added/edited/removed, and steers each provider instance with a master switch
 * and per-server include/exclude chips.
 */
import {
  AuthProvidersManageScope,
  defaultInstanceIdForDriver,
  ProviderDriverKind,
  type ProviderInstanceConfig,
  type ProviderInstanceId,
  type ServerSettingsPatch,
  type SharedMcpServer,
  type SharedMcpServerMap,
  type SharedMcpTransport,
  type SharedResourceId,
  type SharedResourceVariable,
} from "@t3tools/contracts";
import {
  SHARED_MCP_DRIVER_KINDS,
  SHARED_MCP_TRANSPORT_LABELS,
  draftFromSharedMcpServer,
  emptySharedMcpServerDraft,
  sharedMcpDriverLabel,
  sharedMcpServerFromDraft,
  sharedMcpServerTargetSummary,
  sharedServerSupportBadges,
  type SharedMcpServerDraft,
  type SharedServerSupport,
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
import { SettingsChoiceRow } from "./components/SettingsChoiceRow";
import {
  AndroidSettingsEnvironmentFilter,
  SettingsEnvironmentFilterHeader,
} from "./components/SettingsEnvironmentFilterHeader";
import { SettingsScreen } from "./components/SettingsScreen";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsSwitchRow } from "./components/SettingsSwitchRow";
import { useSettingsEnvironmentFilter, type SettingsTarget } from "./settings-environment-filter";

const TRANSPORTS: ReadonlyArray<SharedMcpTransport> = ["stdio", "http", "sse"];

function supportClassName(support: SharedServerSupport["support"]): string {
  return support === "supported"
    ? "text-foreground-muted"
    : support === "unreliable"
      ? "text-warning-foreground"
      : "text-foreground-muted opacity-60";
}

export function SettingsSharedMcpRouteScreen() {
  const { selectedTargets } = useSettingsEnvironmentFilter();
  const insets = useSafeAreaInsets();
  return (
    <>
      <SettingsEnvironmentFilterHeader />
      <SettingsScreen title="Shared MCP servers" trailing={<AndroidSettingsEnvironmentFilter />}>
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
              <SharedMcpEnvironment key={environment.environmentId} environment={environment} />
            ))
          )}
        </ScreenScrollView>
      </SettingsScreen>
    </>
  );
}

function SharedMcpEnvironment({ environment }: { readonly environment: SettingsTarget }) {
  const settings = environment.serverConfig.settings;
  const canManage = readEnvironmentScope(environment.environmentId, AuthProvidersManageScope);
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: "shared MCP servers update",
    reportFailure: true,
  });
  const [draft, setDraft] = useState<SharedMcpServerDraft | null>(null);

  const servers = settings.sharedAgentResources.mcpServers;
  const entries = Object.entries(servers).sort(([a], [b]) => a.localeCompare(b));
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

  const patch = (next: Record<string, SharedMcpServer>) =>
    void updateSettings({
      environmentId: environment.environmentId,
      input: { patch: { sharedAgentResources: { mcpServers: next as SharedMcpServerMap } } },
    });

  const saveDraft = () => {
    if (draft === null) return;
    const server = sharedMcpServerFromDraft(draft);
    if (server === undefined) return;
    const next: Record<string, SharedMcpServer> = { ...servers };
    if (draft.originalId !== null && draft.originalId !== draft.id.trim()) {
      delete next[draft.originalId];
    }
    next[draft.id.trim()] = server;
    setDraft(null);
    patch(next);
  };

  const removeServer = (id: string) => {
    const next: Record<string, SharedMcpServer> = { ...servers };
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
            No shared servers. Add one and every capable provider receives it.
          </Text>
        ) : null}
        {entries.map(([id, server]) => (
          <View key={id} className="gap-2 border-b border-border-subtle p-4">
            <Text className="text-lg font-semibold text-foreground">{id}</Text>
            <Text className="text-sm text-foreground-muted">
              {server.transport} · {sharedMcpServerTargetSummary(server)}
            </Text>
            <View className="flex-row flex-wrap gap-x-3 gap-y-1">
              {sharedServerSupportBadges(server).map(({ driver, support }) => (
                <Text key={driver} className={cn("text-xs", supportClassName(support))}>
                  {sharedMcpDriverLabel(driver)}
                  {support === "unreliable" ? " ~" : support === "unsupported" ? " ✕" : ""}
                </Text>
              ))}
            </View>
            {canManage ? (
              <View className="flex-row gap-4 pt-1">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${id}`}
                  onPress={() => setDraft(draftFromSharedMcpServer(id, server))}
                >
                  <Text className="text-sm text-primary">Edit</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${id}`}
                  onPress={() => removeServer(id)}
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
            label="Add server"
            onPress={() => setDraft(emptySharedMcpServerDraft())}
          />
        ) : (
          <Text className="p-4 text-foreground-muted">
            This connection can view shared MCP servers but not change them.
          </Text>
        )}
      </SettingsSection>

      {draft !== null ? (
        <SettingsSection
          title={draft.originalId === null ? "New server" : `Edit ${draft.originalId}`}
        >
          <SharedMcpEditor
            draft={draft}
            disabled={!canManage}
            onChange={setDraft}
            onSave={saveDraft}
            onCancel={() => setDraft(null)}
          />
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
                        accessibilityLabel={`${excluded ? "Include" : "Exclude"} ${id} for ${instanceId}`}
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

function Field(props: {
  readonly label: string;
  readonly value: string;
  readonly disabled?: boolean;
  readonly secure?: boolean;
  readonly placeholder?: string;
  readonly onChangeText: (value: string) => void;
}) {
  return (
    <View className="gap-1 border-b border-border-subtle p-4">
      <Text className="text-sm text-foreground-muted">{props.label}</Text>
      <TextInput
        accessibilityLabel={props.label}
        className="rounded-lg border border-border-subtle px-3 py-2 text-base text-foreground"
        placeholderTextColorClassName="accent-foreground-muted"
        placeholder={props.placeholder ?? props.label}
        value={props.value}
        editable={!props.disabled}
        secureTextEntry={props.secure}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={props.onChangeText}
      />
    </View>
  );
}

interface VariableRow {
  readonly id: string;
  readonly variable: SharedResourceVariable;
}

let variableRowCounter = 0;
const nextVariableRowId = () => `shared-mcp-variable-${variableRowCounter++}`;

function VariableEditor(props: {
  readonly title: string;
  readonly variables: ReadonlyArray<SharedResourceVariable>;
  readonly disabled: boolean;
  readonly onChange: (next: ReadonlyArray<SharedResourceVariable>) => void;
}) {
  const [rows, setRows] = useState<VariableRow[]>(() =>
    props.variables.map((variable) => ({ id: nextVariableRowId(), variable })),
  );
  const publish = (next: VariableRow[]) => {
    setRows(next);
    props.onChange(next.map((row) => row.variable));
  };
  const setAt = (id: string, variable: SharedResourceVariable) =>
    publish(rows.map((row) => (row.id === id ? { ...row, variable } : row)));
  return (
    <View className="border-b border-border-subtle">
      <Text className="px-4 pt-3 text-sm text-foreground-muted">{props.title}</Text>
      {rows.map((row, index) => (
        <View key={row.id} className="gap-2 p-4">
          <TextInput
            accessibilityLabel={`${props.title} name ${index + 1}`}
            className="rounded-lg border border-border-subtle px-3 py-2 text-base text-foreground"
            placeholderTextColorClassName="accent-foreground-muted"
            placeholder="NAME"
            value={row.variable.name}
            editable={!props.disabled}
            autoCapitalize="characters"
            autoCorrect={false}
            onChangeText={(name) => setAt(row.id, { ...row.variable, name })}
          />
          <TextInput
            accessibilityLabel={`${props.title} value ${index + 1}`}
            className="rounded-lg border border-border-subtle px-3 py-2 text-base text-foreground"
            placeholderTextColorClassName="accent-foreground-muted"
            placeholder={row.variable.valueRedacted ? "Stored secret" : "value"}
            value={row.variable.valueRedacted ? "" : row.variable.value}
            editable={!props.disabled}
            secureTextEntry={row.variable.sensitive}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(value) =>
              setAt(row.id, { ...row.variable, value, valueRedacted: false })
            }
          />
          <View className="flex-row items-center gap-4">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Mark ${props.title} ${index + 1} sensitive`}
              disabled={props.disabled}
              onPress={() =>
                setAt(row.id, {
                  ...row.variable,
                  sensitive: !row.variable.sensitive,
                  valueRedacted: false,
                })
              }
            >
              <Text className="text-sm text-primary">
                {row.variable.sensitive ? "Sensitive" : "Plain text"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${props.title} ${index + 1}`}
              disabled={props.disabled}
              onPress={() => publish(rows.filter((candidate) => candidate.id !== row.id))}
            >
              <Text className="text-sm text-danger-foreground">Remove</Text>
            </Pressable>
          </View>
        </View>
      ))}
      <SettingsActionRow
        icon="plus"
        label={`Add ${props.title.toLowerCase()}`}
        disabled={props.disabled}
        onPress={() =>
          publish([
            ...rows,
            { id: nextVariableRowId(), variable: { name: "", value: "", sensitive: true } },
          ])
        }
      />
    </View>
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
        {SHARED_MCP_DRIVER_KINDS.map((driver) => {
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

function SharedMcpEditor(props: {
  readonly draft: SharedMcpServerDraft;
  readonly disabled: boolean;
  readonly onChange: (draft: SharedMcpServerDraft) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}) {
  const { draft } = props;
  const isRemote = draft.transport !== "stdio";
  const canSave = sharedMcpServerFromDraft(draft) !== undefined;
  const set = (partial: Partial<SharedMcpServerDraft>) => props.onChange({ ...draft, ...partial });

  return (
    <View>
      <Field
        label="Name"
        value={draft.id}
        disabled={props.disabled || draft.originalId !== null}
        placeholder="my-server"
        onChangeText={(id) => set({ id })}
      />
      {TRANSPORTS.map((transport) => (
        <SettingsChoiceRow
          key={transport}
          label={SHARED_MCP_TRANSPORT_LABELS[transport]}
          description=""
          selected={draft.transport === transport}
          separated
          disabled={props.disabled}
          onPress={() => set({ transport })}
        />
      ))}
      {isRemote ? (
        <Field
          label="URL"
          value={draft.url}
          disabled={props.disabled}
          placeholder="https://example.com/mcp"
          onChangeText={(url) => set({ url })}
        />
      ) : (
        <>
          <Field
            label="Command"
            value={draft.command}
            disabled={props.disabled}
            placeholder="npx"
            onChangeText={(command) => set({ command })}
          />
          <Field
            label="Arguments"
            value={draft.args}
            disabled={props.disabled}
            placeholder="-y @modelcontextprotocol/server-everything"
            onChangeText={(args) => set({ args })}
          />
        </>
      )}
      {isRemote ? (
        <VariableEditor
          title="Headers"
          variables={draft.headers}
          disabled={props.disabled}
          onChange={(headers) => set({ headers })}
        />
      ) : (
        <VariableEditor
          title="Environment"
          variables={draft.env}
          disabled={props.disabled}
          onChange={(env) => set({ env })}
        />
      )}
      <DriverChips
        title="Deliver to drivers (empty = all that support the transport)"
        selected={draft.drivers}
        disabled={props.disabled}
        onToggle={(driver, on) =>
          set({
            drivers: on
              ? [...draft.drivers, driver]
              : draft.drivers.filter((candidate) => candidate !== driver),
          })
        }
      />
      <DriverChips
        title="Never deliver to"
        selected={draft.excludeDrivers}
        disabled={props.disabled}
        onToggle={(driver, on) =>
          set({
            excludeDrivers: on
              ? [...draft.excludeDrivers, driver]
              : draft.excludeDrivers.filter((candidate) => candidate !== driver),
          })
        }
      />
      <SettingsActionRow
        icon="checkmark"
        label="Save server"
        disabled={!canSave}
        onPress={props.onSave}
      />
      <SettingsActionRow icon="xmark" label="Cancel" onPress={props.onCancel} />
    </View>
  );
}
