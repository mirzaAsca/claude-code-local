# Plugins, Skills, and MCP Architecture

## Scope
This document covers the extension surface for the CLI snapshot:

- `plugins/` and `utils/plugins/`
- `skills/`
- `services/mcp/`
- MCP-facing tools in `tools/*Mcp*` and `tools/MCPTool/*`
- CLI management handlers in `cli/handlers/plugins.ts` and `cli/handlers/mcp.tsx`

It focuses on lifecycle and boundaries:

- discovery
- load and validation
- auth and trust
- execution and runtime wiring
- resource listing and reading
- policy checks and allowlists
- extension model for future additions

## Big Picture
The extension system is split into three related layers:

- Plugins are user-toggleable bundles that can contribute commands, agents, hooks, and MCP servers.
- Skills are prompt-shaped commands that can come from filesystem folders, bundled startup registrations, plugin content, or MCP-provisioned sources.
- MCP is the transport and capability layer that exposes tools, prompts, resources, and auth-driven server connections.

The important architectural choice is separation of concerns:

- plugin discovery and persistence live in `utils/plugins/*`
- skill parsing and command synthesis live in `skills/*`
- MCP connection, auth, and policy live in `services/mcp/*`
- user-facing tool surfaces are defined in `tools/*`

> Inference: the codebase treats these as one extension ecosystem, but the trust boundaries are different. Skills are prompt content, plugins are installable packages, and MCP servers are live remote integrations.

## Folder Map

| Area | Responsibility | Representative files |
| --- | --- | --- |
| `plugins/` | Built-in plugin registry and built-in plugin initialization | `plugins/builtinPlugins.ts`, `plugins/bundled/index.ts` |
| `skills/` | Filesystem skills, bundled skills, MCP skill bridge | `skills/loadSkillsDir.ts`, `skills/bundled/index.ts`, `skills/mcpSkillBuilders.ts` |
| `services/mcp/` | Connection lifecycle, auth, config, policy, string normalization, channels | `services/mcp/client.ts`, `services/mcp/auth.ts`, `services/mcp/config.ts`, `services/mcp/utils.ts` |
| `utils/plugins/` | Plugin loading, caches, manifests, install state, directories, MCP integration | `utils/plugins/pluginLoader.ts`, `utils/plugins/installedPluginsManager.ts`, `utils/plugins/loadPluginCommands.ts`, `utils/plugins/loadPluginAgents.ts`, `utils/plugins/mcpPluginIntegration.ts` |
| `tools/` | MCP tools and wrappers exposed to the model | `tools/MCPTool/MCPTool.ts`, `tools/ListMcpResourcesTool/ListMcpResourcesTool.ts`, `tools/ReadMcpResourceTool/ReadMcpResourceTool.ts`, `tools/McpAuthTool/McpAuthTool.ts` |
| `cli/handlers/` | Non-interactive management commands | `cli/handlers/plugins.ts`, `cli/handlers/mcp.tsx` |

## Plugin Model

### What A Plugin Can Contain
Plugin manifests and directories can contribute several component types:

- slash commands
- agent definitions
- hook definitions
- MCP server definitions

The loader comments and integration code show that a plugin can also carry user config, data directories, and versioned caches. `utils/plugins/pluginLoader.ts` is the main discovery and validation entry point.

### Plugin Identity
Plugins are identified using `name@marketplace` style IDs. `utils/plugins/pluginIdentifier.ts` maps plugin IDs to setting scopes and vice versa.

- `userSettings` maps to `user`
- `projectSettings` maps to `project`
- `localSettings` maps to `local`
- `policySettings` maps to `managed`
- `flagSettings` maps to session-only `flag`

Marketplace names can be official or third-party. Official marketplaces are special-cased for telemetry and trust handling.

### Built-In Plugins
`plugins/builtinPlugins.ts` is the registry for built-in plugins that ship with the CLI and can be toggled by users.

- Built-in plugins are represented as `name@builtin`.
- They appear in the plugin UI and can be enabled or disabled.
- They can contribute skills, hooks, and MCP servers.
- Their enabled state is stored in settings, while install state is modeled separately.

`plugins/bundled/index.ts` is currently scaffolding only.

> Inference: built-in plugin support exists as a stable extension point, but this snapshot does not yet register any built-in plugins in `plugins/bundled/index.ts`.

## Plugin Lifecycle

### Discovery
Plugin discovery has two primary sources:

- installed marketplace plugins
- session-only inline plugins from `--plugin-dir` or SDK plugin options

The loader comments also indicate that npm packages are supported through marketplace entries rather than direct top-level plugin installation.

Discovery and cache roots are controlled by `utils/plugins/pluginDirectories.ts`:

- default root is under the Claude config home
- `CLAUDE_CODE_PLUGIN_CACHE_DIR` overrides the base directory
- `CLAUDE_CODE_USE_COWORK_PLUGINS` or `--cowork` switches between `plugins` and `cowork_plugins`
- `CLAUDE_CODE_PLUGIN_SEED_DIR` can provide read-only seed layers

### Install And Cache
Installed plugins are tracked in `installed_plugins.json` through `utils/plugins/installedPluginsManager.ts`.

- plugin installation metadata is versioned
- legacy formats are migrated on startup
- cache directories can be versioned or legacy flat directories
- ZIP cache mode is supported
- per-plugin data directories live separately from install caches

`utils/plugins/pluginLoader.ts` resolves versioned cache paths, legacy cache paths, seed caches, and copy paths. It also contains the logic that copies plugin source trees into cache and strips `.git` from cached content.

### Validation
Validation happens at several levels:

- manifest parsing and schema validation
- hook schema validation
- duplicate path detection
- plugin policy checks
- marketplace/source allowlist checks
- dependency resolution and reverse dependency reporting

The core plugin operations in `services/plugins/pluginOperations.ts` are deliberately pure library functions. CLI side effects live in `services/plugins/pluginCliCommands.ts`.

### Runtime Load
At runtime, plugin content is loaded into several separate channels:

- `utils/plugins/loadPluginCommands.ts` turns markdown command files into `Command` objects
- `utils/plugins/loadPluginAgents.ts` turns agent files into `AgentDefinition` objects
- `utils/plugins/mcpPluginIntegration.ts` turns plugin MCP config into server configs
- `utils/plugins/pluginLoader.ts` coordinates manifest, settings, marketplace, and cache state

This separation matters because a plugin may contribute only one kind of content, and the runtime should not load unrelated surfaces unnecessarily.

### Enablement And Disablement
Plugin enablement is a settings concern, not just an install concern.

- install state lives in plugin metadata
- enabled/disabled state lives in settings
- plugin operations can install, uninstall, enable, disable, and update
- install/update scopes include `user`, `project`, and `local`

`cli/handlers/plugins.ts` exposes the user-facing management commands and logs telemetry for each operation.

### Persistent Plugin Data
`utils/plugins/pluginDirectories.ts` provides a persistent per-plugin data directory exposed to plugins as `${CLAUDE_PLUGIN_DATA}`.

- it survives plugin updates
- it is removed on last-scope uninstall
- it is created lazily when needed

This is distinct from `${CLAUDE_PLUGIN_ROOT}`, which is version-scoped and can be orphaned or garbage-collected on update.

## Plugin Content Surfaces

### Commands
`utils/plugins/loadPluginCommands.ts` walks plugin markdown files and converts them into slash commands.

- skill-style directories use `SKILL.md`
- regular markdown files become commands by filename
- command names are namespaced with the plugin name and any nested directory path
- path traversal is rejected
- plugin markdown can load shell commands, prompt text, and other frontmatter-driven metadata

### Agents
`utils/plugins/loadPluginAgents.ts` loads agent definitions from plugin markdown.

- agent names are namespaced with the plugin name
- `memory` is supported as an agent frontmatter field
- auto-memory can inject file tools when enabled
- plugin agents intentionally ignore `permissionMode`, `hooks`, and `mcpServers` in frontmatter

That restriction is a trust boundary: plugin agents should not silently escalate themselves beyond the plugin installation envelope.

### Hooks
Plugin hooks are validated through the shared hooks schema in `schemas/hooks.ts`.

- command hooks
- prompt hooks
- agent hooks
- http hooks

The `AgentHook` transform is intentionally avoided in persisted settings because it can break round-tripping.

### MCP Servers
Plugin-provided MCP servers are loaded through `utils/plugins/mcpPluginIntegration.ts`.

- plugin manifests may point at `.mcp.json`, a JSON file, an MCPB package, inline configs, or a direct config object
- string specs can resolve to MCPB or JSON source
- plugin MCP servers are merged with manually configured servers
- duplicate signatures are deduped
- plugin MCP server names are namespaced so they do not collide with manual servers

> Inference: plugin MCP support is intentionally treated as a first-class plugin component, not a separate integration path. That makes MCP a plugin capability rather than a standalone subsystem.

## Skill Model

### Filesystem Skills
Filesystem skills are loaded by `skills/loadSkillsDir.ts`.

Supported roots include:

- user skills under the Claude config home
- managed skills under the managed file path
- project-local `.claude/skills`
- legacy markdown under `/commands`

The loader supports directory-style skill packages where each skill lives in `skill-name/SKILL.md`.

### Skill Frontmatter
The skill frontmatter parser supports a large set of metadata:

- `name`
- `description`
- `when_to_use`
- `allowed-tools`
- `argument-hint`
- `arguments`
- `version`
- `model`
- `disable-model-invocation`
- `user-invocable`
- `hooks`
- `context`
- `agent`
- `effort`
- `shell`
- `paths`

`createSkillCommand()` turns those fields into a `Command` object with prompt behavior.

### Prompt Expansion
Skill prompt generation does several things:

- substitutes arguments into markdown
- injects `${CLAUDE_SKILL_DIR}` for skills that have a backing directory
- injects `${CLAUDE_SESSION_ID}`
- optionally executes shell fragments in the prompt body

Security matters here:

- MCP-backed skills do not execute inline shell commands from their markdown body
- plugin skills are untrusted relative to user-authored local skills

### Bundled Skills
Bundled skills live under `skills/bundled/` and are registered at startup through `skills/bundled/index.ts`.

- they are compiled into the CLI
- they can be auto-enabled by feature flags or runtime predicates
- they can extract support files to disk on first use so the model can read them
- extraction is lazy and memoized

Examples include update/configuration helpers, debugging helpers, simplification helpers, verification helpers, and feature-gated assistant workflows.

### MCP Skills
`skills/mcpSkillBuilders.ts` exists to break import cycles between the skill loader and MCP skill discovery.

- it is a write-once registry for the shared skill-building functions
- the MCP client can use those builders to materialize skills from remote MCP-provided content

> Inference: the runtime references an MCP skill loader through `skills/mcpSkills.js`, but that source file is not present in this snapshot. The builder registry makes the intended bridge explicit even if the implementation is split out of tree.

## MCP Model

### Server Types
`services/mcp/types.ts` defines the transport and configuration model.

Supported config types include:

- `stdio`
- `sse`
- `http`
- `ws`
- `sdk`
- `claudeai-proxy`

There are also internal IDE variants for specialized connections.

Supported config scopes include:

- `local`
- `user`
- `project`
- `dynamic`
- `enterprise`
- `claudeai`
- `managed`

### Config Sources
`services/mcp/config.ts` and `services/mcp/utils.ts` define the file locations and policy resolution rules.

- user config comes from the global Claude config
- project config comes from `.mcp.json`
- local config is project-specific user config
- enterprise config comes from the managed file path
- claude.ai config comes from org-backed connector fetches

### Policy And Trust
MCP servers are not all treated equally.

- project-scoped servers can require approval
- settings can explicitly approve or reject project servers
- bypass mode can auto-approve only under controlled conditions
- non-interactive mode can auto-approve project servers because the user explicitly chose a trusted batch mode

`services/mcp/utils.ts` centralizes the project approval logic through `getProjectMcpServerStatus()`.

### Server Discovery
`services/mcp/officialRegistry.ts` prefetches the official MCP registry and caches normalized URLs.

- registry fetch is best-effort
- non-essential traffic can disable the fetch
- the registry is used as a trust and classification aid

> Inference: the official registry lookup is primarily a classification layer, not a hard security boundary.

## MCP Auth And Connection Lifecycle

### OAuth Discovery And Tokens
`services/mcp/auth.ts` owns OAuth discovery and token lifecycle.

Important behaviors:

- supports auth server metadata discovery
- handles RFC 9728 and RFC 8414 discovery flows
- supports a configured metadata URL when present
- normalizes non-standard OAuth errors into standard invalid-grant behavior
- stores credentials in secure storage
- revocation is best-effort and follows RFC 7009 semantics when possible

The auth path also supports XAA and claude.ai-specific flows.

### Auth Caching
`services/mcp/client.ts` caches "needs auth" state so repeated connection attempts do not spam the same failing server.

- auth cache TTL is 15 minutes
- cache writes are serialized
- cache is invalidated when auth changes

This keeps the connection manager from repeatedly reconnecting to servers that clearly need user action.

### Connector Categories
`services/mcp/claudeai.ts` fetches MCP servers from Claude.ai org config when the user has the right OAuth scope.

- eligibility requires OAuth tokens
- eligibility requires the `user:mcp_servers` scope
- fetched servers are normalized to avoid name collisions
- results are memoized for the session

> Inference: Claude.ai-provided MCP servers are treated as organization-managed connectors and are kept separate from local `.mcp.json` and user-managed server config.

### Connection Management
`services/mcp/useManageMCPConnections.ts` is the runtime hook that keeps the MCP connection graph synchronized with app state.

- initializes client connections
- batches state updates
- reconnects on transport changes
- clears stale plugin clients when plugin configs change
- handles prompt, resource, and tool list change notifications
- integrates channel permission relay state when enabled

`services/mcp/client.ts` is the main transport engine behind the hook and supports:

- `stdio`
- `sse`
- `http`
- `ws`
- SDK control transport
- in-process transport paths

It also manages connection timeouts, request timeouts, and transport-specific fetch wrappers.

### Auth Pseudo-Tool
`tools/McpAuthTool/McpAuthTool.ts` exposes a pseudo-tool that lets the model start an OAuth flow for a server that is installed but not authenticated.

- it returns an authorization URL when browser-based auth is needed
- it can complete silently when cached or step-up auth succeeds
- once auth completes, the server reconnects and the pseudo-tool is removed by prefix replacement

This is the bridge between "server exists" and "server tools are available".

## MCP Tooling

### Base Tool Wrapper
`tools/MCPTool/MCPTool.ts` is the generic tool wrapper for MCP calls.

- it is marked as MCP-specific
- it acts as the base definition before server-specific overriding
- actual MCP tool names and prompts are injected at runtime

### Resource Listing
`tools/ListMcpResourcesTool/ListMcpResourcesTool.ts` lists resources from connected MCP servers.

- it can target a specific server or all servers
- it is read-only and concurrency-safe
- it uses the MCP client cache so reconnects are cheap when servers are healthy
- it returns JSON output with server, URI, MIME type, and description

### Resource Reading
`tools/ReadMcpResourceTool/ReadMcpResourceTool.ts` reads a single resource from a connected MCP server.

- it validates that the server exists and supports resources
- binary blob content is persisted to disk rather than inlined
- text content is returned directly
- output rendering keeps the tool result bounded and structured

This avoids blowing up prompt context with base64 blobs.

### Tool Namespace
MCP server tools are namespaced as `mcp__<server>__<tool>`.

- `services/mcp/mcpStringUtils.ts` parses and formats this namespace
- `services/mcp/normalization.ts` sanitizes server names for MCP-safe identifiers
- `services/mcp/utils.ts` uses this namespace to filter tools, commands, and resources by server

### Search And Collapse
MCP tools also feed search and collapse logic:

- `services/mcp/client.ts` classifies tool outputs for truncation and collapse
- `tools/MCPTool/classifyForCollapse.ts` helps decide whether a tool output should be summarized

## Policy Checks

### Plugin Policy
Plugin and marketplace policy is enforced before content is loaded.

- plugin operations can be blocked by policy
- marketplace source filtering is centralized
- plugin install/update/uninstall paths are scope-aware
- plugin telemetry distinguishes official and third-party identifiers

### MCP Policy
MCP policy spans several layers:

- server status in project settings
- `--channels` allowlist for channel-aware servers
- official registry URL classification
- disable flags for non-essential traffic and unmanaged servers
- auth cache for servers that need user action

### Channel Relay Policy
`services/mcp/channelAllowlist.ts` and `services/mcp/channelPermissions.ts` implement a separate, high-trust relay path for permission prompts.

- channel servers must be connected and explicitly allowlisted
- permission relay can be disabled by GrowthBook
- the server must declare explicit experimental capabilities before it can relay permission prompts

That is intentionally narrower than normal MCP connectivity.

### Safety In Plugin Agents
Plugin agents cannot silently smuggle in dangerous escalation surfaces.

- `permissionMode` is ignored in plugin agent frontmatter
- `hooks` are ignored in plugin agent frontmatter
- `mcpServers` are ignored in plugin agent frontmatter

The user must configure those higher-risk capabilities in user-authored local config instead.

### Safety In Skills
Skills are prompt content, so their trust level depends on source:

- local user skills are trusted by the user’s own filesystem boundary
- bundled skills are trusted by shipping code
- plugin skills are third-party and should be treated as untrusted prompt content
- MCP skills are remote and untrusted

`skills/loadSkillsDir.ts` enforces this by skipping inline shell execution for MCP-backed skills.

## Extension Model

### Add A Plugin
To add a new plugin capability:

1. Define the plugin manifest and content layout.
2. Register it in the plugin loader or built-in plugin registry.
3. Decide whether it ships commands, agents, hooks, MCP servers, or a combination.
4. Ensure install/enable/disable/update flows are wired through `services/plugins/*`.
5. Ensure telemetry uses the PII-safe fields when the source is third-party.

### Add A Skill
To add a new skill:

1. Create a `SKILL.md` skill package under a skill directory, or register a bundled skill in `skills/bundled/`.
2. Provide frontmatter for `when_to_use`, `allowed-tools`, `model`, and any other supported metadata.
3. Decide whether the skill should be user-invocable or hidden.
4. If the skill is plugin- or MCP-backed, respect the corresponding trust boundary.

### Add An MCP Server
To add a new MCP server:

1. Extend the config schema in `services/mcp/types.ts` if a new transport is needed.
2. Teach the config loader to accept the server source.
3. Add any required auth flow in `services/mcp/auth.ts`.
4. Ensure `useManageMCPConnections` can manage the lifecycle.
5. Expose the server through the `mcp__<server>__<tool>` namespace.

### Add A New MCP Surface
To add a new MCP-facing surface:

- create a dedicated tool under `tools/`
- define input and output schemas
- implement result truncation and rendering
- make it concurrency and permission aware
- route server-specific caching through `services/mcp/client.ts`

## Practical Reading Order

If you are tracing the extension stack in source order, read these files first:

1. `utils/plugins/pluginLoader.ts`
2. `utils/plugins/installedPluginsManager.ts`
3. `utils/plugins/loadPluginCommands.ts`
4. `utils/plugins/loadPluginAgents.ts`
5. `utils/plugins/mcpPluginIntegration.ts`
6. `skills/loadSkillsDir.ts`
7. `skills/bundled/index.ts`
8. `skills/mcpSkillBuilders.ts`
9. `services/mcp/types.ts`
10. `services/mcp/config.ts`
11. `services/mcp/auth.ts`
12. `services/mcp/client.ts`
13. `services/mcp/useManageMCPConnections.ts`
14. `tools/MCPTool/MCPTool.ts`
15. `tools/ListMcpResourcesTool/ListMcpResourcesTool.ts`
16. `tools/ReadMcpResourceTool/ReadMcpResourceTool.ts`
17. `tools/McpAuthTool/McpAuthTool.ts`
18. `cli/handlers/plugins.ts`
19. `cli/handlers/mcp.tsx`

## Known Gaps

- `skills/mcpSkills.js` is referenced by the runtime, but the corresponding source file is not present in this snapshot. That loader path is therefore documented as an inference.
- `plugins/bundled/index.ts` currently contains scaffolding only, so built-in plugin registration is not yet populated.
- Some marketplace and plugin package behaviors are documented from loader comments and code paths rather than from a single canonical manifest spec.

The extension ecosystem is still coherent despite those gaps: plugins, skills, and MCP servers all converge through the same command, tool, and state-management primitives.
