/**
 * Manage the environment's shared MCP servers and how each provider instance
 * receives them.
 *
 * Servers are defined once here (persisted on `ServerSettings.sharedAgentResources`)
 * and delivered to every instance whose driver can carry the transport. Each
 * instance can be switched off entirely or exclude individual servers. The
 * per-driver transport support comes from `@t3tools/shared/providerResources`,
 * the same matrix the server's resolve step uses, so the UI never claims a
 * delivery the adapter cannot make.
 */
import {
  AuthProvidersManageScope,
  defaultInstanceIdForDriver,
  type EnvironmentId,
  ProviderDriverKind,
  type ProviderInstanceConfig,
  type ProviderInstanceId,
  type SharedMcpServer,
  type SharedMcpServerMap,
  type SharedMcpTransport,
  type SharedResourceId,
  type SharedResourceVariable,
} from "@t3tools/contracts";
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
import {
  DRIVER_KINDS,
  TRANSPORT_LABELS,
  driverLabel,
  draftFromServer,
  emptyDraft,
  serverFromDraft,
  serverTargetSummary,
  sharedServerSupportBadges,
  type ServerDraft,
} from "./SharedAgentResourcesSettings.logic";

interface VariableDraftRow extends SharedResourceVariable {
  readonly rowId: string;
}

let variableRowId = 0;
const nextVariableRowId = () => `shared-variable-${variableRowId++}`;

function toVariableRows(variables: ReadonlyArray<SharedResourceVariable>): VariableDraftRow[] {
  return variables.map((variable) => ({ ...variable, rowId: nextVariableRowId() }));
}

/** A name/value/sensitive editor for a server's `env` or `headers`. */
function VariableRows(props: {
  readonly title: string;
  readonly description: string;
  readonly variables: ReadonlyArray<SharedResourceVariable>;
  readonly onChange: (next: ReadonlyArray<SharedResourceVariable>) => void;
  readonly disabled: boolean;
}) {
  const [rows, setRows] = useState<VariableDraftRow[]>(() => toVariableRows(props.variables));

  const publish = (next: VariableDraftRow[]) => {
    setRows(next);
    props.onChange(
      next
        .filter((row) => row.name.trim().length > 0)
        .map(({ rowId: _rowId, ...variable }) => ({ ...variable, name: variable.name.trim() })),
    );
  };

  return (
    <SettingsRow
      title={props.title}
      description={props.description}
      control={
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={props.disabled}
          onClick={() =>
            publish([...rows, { rowId: nextVariableRowId(), name: "", value: "", sensitive: true }])
          }
        >
          <PlusIcon className="size-3" />
          Add
        </Button>
      }
    >
      {rows.length > 0 ? (
        <div className="mt-3 min-w-0 space-y-2 pb-2">
          {rows.map((variable, index) => (
            <div key={variable.rowId} className="flex min-w-0 flex-wrap items-center gap-1.5">
              <DraftInput
                size="sm"
                font="mono"
                className="w-full min-w-0 sm:w-44 sm:shrink-0"
                value={variable.name}
                disabled={props.disabled}
                onCommit={(name) =>
                  publish(
                    rows.map((row) => (row.rowId === variable.rowId ? { ...row, name } : row)),
                  )
                }
                placeholder="NAME"
                spellCheck={false}
                aria-label={`${props.title} name ${index + 1}`}
              />
              <DraftInput
                size="sm"
                font="mono"
                className="min-w-0 flex-1"
                value={variable.valueRedacted ? "" : variable.value}
                disabled={props.disabled}
                onCommit={(value) =>
                  publish(
                    rows.map((row) =>
                      row.rowId === variable.rowId ? { ...row, value, valueRedacted: false } : row,
                    ),
                  )
                }
                type={variable.sensitive ? "password" : undefined}
                autoComplete="off"
                placeholder={variable.valueRedacted ? "Stored secret" : "value"}
                spellCheck={false}
                aria-label={`${props.title} value ${index + 1}`}
              />
              <Button
                type="button"
                size="icon-micro"
                variant="ghost-muted"
                aria-pressed={variable.sensitive}
                aria-label={`Mark ${variable.name || index + 1} as sensitive`}
                disabled={props.disabled}
                onClick={() =>
                  publish(
                    rows.map((row) =>
                      row.rowId === variable.rowId
                        ? { ...row, sensitive: !row.sensitive, valueRedacted: false }
                        : row,
                    ),
                  )
                }
              >
                {variable.sensitive ? "🔒" : "🔓"}
              </Button>
              <Button
                type="button"
                size="icon-micro"
                variant="ghost-destructive"
                aria-label={`Remove ${variable.name || index + 1}`}
                disabled={props.disabled}
                onClick={() => publish(rows.filter((row) => row.rowId !== variable.rowId))}
              >
                <XIcon className="size-3" />
              </Button>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Sensitive values are stored in the server's secret store and never returned to the app.
          </p>
        </div>
      ) : null}
    </SettingsRow>
  );
}

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
          {DRIVER_KINDS.map((driver) => {
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
                {driverLabel(driver)}
              </Button>
            );
          })}
        </div>
      }
    />
  );
}

function McpServerEditor(props: {
  readonly draft: ServerDraft;
  readonly onChange: (draft: ServerDraft) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
  readonly readOnly: boolean;
}) {
  const { draft } = props;
  const isRemote = draft.transport !== "stdio";
  const canSave = serverFromDraft(draft) !== undefined;

  return (
    <div className="space-y-1 bg-muted/20">
      <SettingsRow
        title="Name"
        description="Key for this server. Reserved: t3-code."
        control={
          <DraftInput
            size="sm"
            className="w-full sm:w-56"
            value={draft.id}
            disabled={props.readOnly || draft.originalId !== null}
            onCommit={(id) => props.onChange({ ...draft, id })}
            placeholder="my-server"
            spellCheck={false}
          />
        }
      />
      <SettingsRow
        title="Transport"
        description="How the provider reaches this server."
        control={
          <Select
            value={draft.transport}
            onValueChange={(next) => {
              if (next === "stdio" || next === "http" || next === "sse") {
                props.onChange({ ...draft, transport: next });
              }
            }}
          >
            <SelectTrigger size="sm" className="w-full sm:w-56" aria-label="Transport">
              <SelectValue>{TRANSPORT_LABELS[draft.transport]}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {(Object.keys(TRANSPORT_LABELS) as SharedMcpTransport[]).map((transport) => (
                <SelectItem key={transport} value={transport}>
                  {TRANSPORT_LABELS[transport]}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      />
      {isRemote ? (
        <SettingsRow
          title="URL"
          description="The remote MCP endpoint."
          control={
            <DraftInput
              size="sm"
              className="w-full sm:w-56"
              value={draft.url}
              disabled={props.readOnly}
              onCommit={(url) => props.onChange({ ...draft, url })}
              placeholder="https://example.com/mcp"
              spellCheck={false}
            />
          }
        />
      ) : (
        <>
          <SettingsRow
            title="Command"
            description="Program to run."
            control={
              <DraftInput
                size="sm"
                font="mono"
                className="w-full sm:w-56"
                value={draft.command}
                disabled={props.readOnly}
                onCommit={(command) => props.onChange({ ...draft, command })}
                placeholder="npx"
                spellCheck={false}
              />
            }
          />
          <SettingsRow
            title="Arguments"
            description="Space-separated. Shown in the launch preview below."
            control={
              <DraftInput
                size="sm"
                font="mono"
                className="w-full sm:w-56"
                value={draft.args}
                disabled={props.readOnly}
                onCommit={(args) => props.onChange({ ...draft, args })}
                placeholder="-y @modelcontextprotocol/server-everything"
                spellCheck={false}
              />
            }
          />
        </>
      )}
      {isRemote ? (
        <VariableRows
          title="Headers"
          description="Optional static headers, e.g. an Authorization token."
          variables={draft.headers}
          disabled={props.readOnly}
          onChange={(headers) => props.onChange({ ...draft, headers })}
        />
      ) : (
        <VariableRows
          title="Environment"
          description="Variables passed to the command."
          variables={draft.env}
          disabled={props.readOnly}
          onChange={(env) => props.onChange({ ...draft, env })}
        />
      )}
      <DriverChips
        title="Deliver to drivers"
        description="Empty means every driver that supports the transport."
        selected={draft.drivers}
        disabled={props.readOnly}
        onToggle={(driver, selected) =>
          props.onChange({
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
        disabled={props.readOnly}
        onToggle={(driver, selected) =>
          props.onChange({
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
            <Button type="button" size="sm" variant="ghost-muted" onClick={props.onCancel}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={!canSave} onClick={props.onSave}>
              Save server
            </Button>
          </div>
        }
      />
    </div>
  );
}

function InstanceSharedRow(props: {
  readonly instanceId: ProviderInstanceId;
  readonly instance: ProviderInstanceConfig;
  readonly serverIds: ReadonlyArray<string>;
  readonly excluded: (id: string) => boolean;
  readonly disabled: boolean;
  readonly onToggleEnabled: (enabled: boolean) => void;
  readonly onToggleExcluded: (id: string, excluded: boolean) => void;
}) {
  const enabled = props.instance.shared?.enabled !== false;
  return (
    <SettingsRow
      title={props.instance.displayName ?? driverLabel(props.instance.driver)}
      description={driverLabel(props.instance.driver)}
      control={
        <Switch
          checked={enabled}
          disabled={props.disabled}
          onCheckedChange={(checked) => props.onToggleEnabled(checked)}
          aria-label={`Deliver shared servers to ${props.instanceId}`}
        />
      }
    >
      {enabled && props.serverIds.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1 pb-2">
          {props.serverIds.map((id) => {
            const isExcluded = props.excluded(id);
            return (
              <Button
                key={id}
                type="button"
                size="xs"
                variant={isExcluded ? "ghost-muted" : "secondary"}
                aria-pressed={!isExcluded}
                disabled={props.disabled}
                onClick={() => props.onToggleExcluded(id, !isExcluded)}
              >
                {id}
              </Button>
            );
          })}
        </div>
      ) : null}
    </SettingsRow>
  );
}

export function SharedAgentResourcesSettings({
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

  const servers = settings.sharedAgentResources.mcpServers;
  const entries = useMemo(
    () => Object.entries(servers).sort(([a], [b]) => a.localeCompare(b)),
    [servers],
  );
  const instances = settings.providerInstances ?? {};
  // Only the instances the Providers list already shows: the configured ones,
  // plus the two implicit defaults. Steering any other driver would create a
  // provider entry the user never asked for.
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
  const [draft, setDraft] = useState<ServerDraft | null>(null);

  const saveDraft = () => {
    if (draft === null) return;
    const server = serverFromDraft(draft);
    if (server === undefined) return;
    const next: Record<string, SharedMcpServer> = { ...servers };
    if (draft.originalId !== null && draft.originalId !== draft.id.trim()) {
      delete next[draft.originalId];
    }
    next[draft.id.trim()] = server;
    setDraft(null);
    void updateSettings({ sharedAgentResources: { mcpServers: next as SharedMcpServerMap } });
  };

  const removeServer = (id: string) => {
    const next: Record<string, SharedMcpServer> = { ...servers };
    delete next[id];
    if (draft?.originalId === id) setDraft(null);
    void updateSettings({ sharedAgentResources: { mcpServers: next as SharedMcpServerMap } });
  };

  const updateInstanceShared = (
    instanceId: ProviderInstanceId,
    instance: ProviderInstanceConfig,
    mutate: (
      shared: NonNullable<ProviderInstanceConfig["shared"]>,
    ) => NonNullable<ProviderInstanceConfig["shared"]>,
  ) => {
    const nextInstance: ProviderInstanceConfig = {
      ...instance,
      shared: mutate(instance.shared ?? {}),
    };
    void persistInstance({ operation: "upsert", instanceId, instance: nextInstance });
  };

  return (
    <SettingsSection
      title="Shared MCP servers"
      titleAction={
        editable ? (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost-muted"
            aria-label="Add shared MCP server"
            onClick={() => setDraft(emptyDraft())}
          >
            <PlusIcon />
          </Button>
        ) : null
      }
      headerAction={
        <span className="text-xs text-muted-foreground">
          Defined once, delivered to every instance that can carry it
        </span>
      }
    >
      {readOnly || !canManage ? (
        <SettingsRow
          title="Limited permissions"
          description={
            canManage
              ? "Shared MCP servers are read-only in this session."
              : "This connection lacks permission to manage shared MCP servers."
          }
        />
      ) : null}

      {entries.length === 0 && draft === null ? (
        <SettingsRow
          title="No shared servers"
          description="Add an MCP server once and every capable provider instance receives it."
        />
      ) : null}

      {entries.map(([id, server]) => (
        <SettingsRow
          key={id}
          title={id}
          description={`${server.transport} · ${serverTargetSummary(server)}`}
          control={
            <div className="flex flex-wrap items-center justify-end gap-1">
              {sharedServerSupportBadges(server).map(({ driver, support }) => (
                <Badge
                  key={driver}
                  size="sm"
                  variant={
                    support === "supported"
                      ? "success"
                      : support === "unreliable"
                        ? "warning"
                        : "outline"
                  }
                >
                  {driverLabel(driver)}
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
                  onClick={() => setDraft(draftFromServer(id, server))}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost-destructive"
                  aria-label={`Delete ${id}`}
                  onClick={() => removeServer(id)}
                >
                  <XIcon />
                </Button>
              </div>
            ) : null
          }
        />
      ))}

      {draft !== null ? (
        <McpServerEditor
          draft={draft}
          onChange={setDraft}
          onSave={saveDraft}
          onCancel={() => setDraft(null)}
          readOnly={!editable}
        />
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
        return (
          <InstanceSharedRow
            key={rawId}
            instanceId={instanceId}
            instance={instance}
            serverIds={entries.map(([id]) => id)}
            excluded={(id) => disabledIds.some((candidate) => String(candidate) === id)}
            disabled={!editable}
            onToggleEnabled={(enabled) =>
              updateInstanceShared(instanceId, instance, (shared) => ({ ...shared, enabled }))
            }
            onToggleExcluded={(id, excluded) =>
              updateInstanceShared(instanceId, instance, (shared) => {
                const current = shared.disabledResourceIds ?? [];
                const without = current.filter((candidate) => String(candidate) !== id);
                return {
                  ...shared,
                  disabledResourceIds: excluded ? [...without, id as SharedResourceId] : without,
                };
              })
            }
          />
        );
      })}
    </SettingsSection>
  );
}
