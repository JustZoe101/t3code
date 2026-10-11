# Shared agent resources

Define MCP servers and skills once per environment and deliver them to your
provider instances, instead of configuring each agent by hand.

Open **Settings → Providers**. Two sections sit below the provider list:

- **Shared MCP servers** — MCP servers every capable provider instance receives.
- **Shared skills** — skill directories linked into a provider's managed home.

Both are stored on the environment (its `settings.json`), not on your machine,
so every client of that environment sees the same set.

## MCP servers

Add a server with a name, a transport, and its target:

- **stdio** — a command and its arguments, plus optional environment variables.
- **http** / **sse** — a URL, plus optional headers.

The badges next to each server show which drivers can carry it. A driver that
cannot accept the transport (or accepts it unreliably, as ACP agents do with
injected HTTP servers) is marked, and the server is not sent to it.

Values marked **sensitive** are kept in the server's secret store, never in
`settings.json` and never returned to the app. They are delivered to the
provider when it starts.

## Skills

A skill is your own directory containing `SKILL.md`. Give it a name and point
at the directory; T3 links it into the provider's managed home so the agent
discovers it the same way it discovers its own skills.

Delivery only happens when the instance has an explicit **home path** (Claude's
`homePath`, Codex's `CODEX_HOME`/`homePath`). Without one, T3 would have to
write into your real `~/.claude` or `~/.codex`, so it does nothing instead.
The link T3 creates is recorded, and turning the skill off removes only that
link — a directory you own is never deleted or overwritten.

## Per provider instance

Under each section, every provider instance has a switch and, per resource, an
include/exclude chip. Turn an instance off to withhold all shared resources
from it, or exclude a single one. This is the "way out" for a provider that
should keep its own configuration.

## Hooks

A hook is a command T3 runs itself on a lifecycle event — **session start**,
**turn end**, or **tool call**. Give it a name, the event, a command and its
arguments, and an optional timeout (default 30 s). The command runs directly,
not through a shell, and its output is captured; a hook that fails or times out
is logged and never fails the turn.

Hooks are universal: T3 runs them for every provider, so the driver badges do
not apply. Use the per-instance switch and the exclude chips to withhold a hook
from one instance.

## Not supported everywhere

Some drivers have no safe delivery path yet (project-seeded skills, user-home
symlinks) and are shown as unsupported rather than silently skipped. Delivery
also depends on the connection: without `providers:manage` on the environment,
the sections are read-only.
