# System Overview

## Scope
This project is a Bun-based, TypeScript-heavy CLI application with a terminal UI, a large tool ecosystem, local session persistence, and multiple remote/control-plane paths. The primary user-facing runtime is the interactive REPL launched from `main.tsx`, while `entrypoints/cli.tsx` provides a fast bootstrap wrapper for flags like `--version` and selected special modes. The app also exposes SDK-oriented entrypoints under `entrypoints/`, and it contains a substantial collection of commands, tools, services, and utilities that are wired together at startup and during each query turn.

This document covers the system as it exists in source, with emphasis on:
- startup and runtime entrypoints,
- major subsystems and module boundaries,
- high-level request/query flow,
- persistence and session storage,
- cross-cutting concerns such as feature flags, telemetry, permissions, and compaction,
- observed risks and gaps.

## Architectural Style
The architecture is a layered CLI orchestration model rather than a classic web app or service API. The main process performs startup bootstrap, environment/config loading, feature gating, command discovery, and UI initialization before entering the REPL. Query execution is handled as an async generator-driven loop that streams model events, runs tools, applies compaction/collapse strategies, and writes session state to append-only transcript files.

A few patterns stand out:
- A central runtime state store in `bootstrap/state.ts` carries session-scoped values across modules.
- Feature flags via `feature('...')` and environment checks are used heavily to include or exclude code paths at build/runtime.
- The codebase uses lazy imports and `require()` in several places to break cycles and reduce startup cost.
- Persistence is file-based and append-oriented, centered on `.jsonl` transcript files rather than a SQL database. `history.jsonl` is also used for shell history. This is an inference from the source files, but it is strongly supported by `utils/sessionStorage.ts`, `history.ts`, and related helpers.
- Tool execution is policy-aware and concurrency-aware. Read-only tools may run in parallel, while stateful tools are serialized.

## Core Layers

### 1. Bootstrap and Entrypoints
The boot sequence begins in `entrypoints/cli.tsx` and `main.tsx`.

- `entrypoints/cli.tsx` handles ultra-fast paths like `--version`, special mode dispatch, and feature-gated subcommands before loading the heavier runtime.
- `main.tsx` is the primary application entrypoint. It performs early profiling, MDM/keychain prefetch, configuration setup, plugin/skill initialization, command discovery, setup dialogs, and finally REPL launch.
- `entrypoints/init.ts` contains the core initialization routine that enables config, applies safe environment variables, sets up shutdown handling, configures network/proxy/mTLS behavior, and prepares telemetry and remote settings loading.

Source anchors:
- `entrypoints/cli.tsx:33`
- `main.tsx:12`, `main.tsx:585`, `main.tsx:1919`, `main.tsx:2239`, `main.tsx:3134`
- `entrypoints/init.ts:1`, `entrypoints/init.ts:47`, `entrypoints/init.ts:247`

### 2. Command Registry
The slash-command and subcommand surface is centralized in `commands.ts`, which imports individual command modules and filters them based on feature flags, subscriber state, and runtime conditions.

Responsibilities visible in source:
- assemble the command list,
- apply availability and entitlement gating,
- expose built-in command names,
- support remote mode filtering.

This registry is not just a menu; it is a runtime capability map used during setup and in the REPL.

Source anchors:
- `commands.ts:225`
- `commands.ts:348`
- `commands.ts:417`
- `commands.ts:476`

### 3. Tool System
The tool layer is defined in `tools.ts` and implemented through many per-tool subfolders under `tools/`.

Responsibilities:
- define the complete built-in tool pool,
- filter tools by permission context,
- assemble tool pools with MCP tools,
- gate tools by environment, mode, and feature flags,
- expose concurrency-safe tool batching.

The top-level registry includes core file/system tools, agent orchestration, task tools, MCP resource tools, and a large set of optional tools enabled by environment flags or feature gates.

Source anchors:
- `tools.ts:193`
- `tools.ts:271`
- `tools.ts:345`

### 4. Query and Orchestration
`query.ts` is the heart of the agent loop. It is an async generator that emits stream events, runs compaction, applies context transforms, executes tools, and advances the conversation.

The query loop:
- snapshots runtime config,
- prefetches relevant memory and skill data,
- applies token-budget and content-replacement limits,
- optionally runs history snipping, microcompact, context collapse, and auto-compact,
- streams assistant output and tool calls,
- delegates tool execution to `services/tools/toolOrchestration.ts`,
- records lifecycle and analytics events.

Source anchors:
- `query.ts:181`
- `query.ts:219`
- `query.ts:241`
- `query.ts:293`
- `query.ts:396`
- `query.ts:449`
- `query.ts:551`
- `services/tools/toolOrchestration.ts:19`

### 5. API and Model Access
The external model/API integration sits under `services/api/`.

- `services/api/claude.ts` is the low-level request/streaming integration for the Anthropic API. It imports the SDK message types, prepares headers and beta flags, handles model capability checks, and bridges internal message/tool structures to API payloads.
- `services/api/bootstrap.ts` fetches bootstrap metadata and caches it in global config. It prefers OAuth when available and falls back to API key auth for first-party flows.

Source anchors:
- `services/api/claude.ts:1`
- `services/api/claude.ts:109`
- `services/api/bootstrap.ts:42`
- `services/api/bootstrap.ts:114`

### 6. State and Persistence
`bootstrap/state.ts` stores the active session, cwd, model overrides, permission/session flags, and other runtime-scoped state.

Persistence is mostly file-backed:
- `utils/sessionStorage.ts` writes and reads per-session `.jsonl` transcripts, session metadata, task snapshots, tags, PR links, and resume state.
- `history.ts` appends shell history entries to `history.jsonl` under the Claude config home directory.
- `migrations/` contains config and settings migrations that normalize older persisted values into newer settings structures.

The persistence layer is append-oriented and optimized for resume/replay on large transcripts. That is a direct reading of the source, not an inference.

Source anchors:
- `bootstrap/state.ts:100`, `bootstrap/state.ts:218`, `bootstrap/state.ts:457`
- `utils/sessionStorage.ts:203`, `utils/sessionStorage.ts:248`, `utils/sessionStorage.ts:3472`, `utils/sessionStorage.ts:4522`
- `history.ts:115`, `history.ts:299`
- `migrations/migrateLegacyOpusToCurrent.ts:1`

### 7. Remote and Control Paths
The system supports multiple connection topologies besides the local interactive REPL.

Observed paths include:
- direct connect sessions via `server/createDirectConnectSession.ts`,
- remote/SSH-connected execution paths in `main.tsx`,
- assistant/bridge-related modes under `assistant/`, `bridge/`, and `remote/`,
- SDK-facing entrypoints under `entrypoints/agentSdkTypes.ts` and `entrypoints/sdk/`.

This implies the project is not just a single-process CLI; it is a local orchestrator for several session topologies. The exact full feature matrix depends on build-time and runtime feature flags.

Source anchors:
- `server/createDirectConnectSession.ts:19`
- `main.tsx:3156`
- `entrypoints/agentSdkTypes.ts:1`

## Request Lifecycle
The main local request lifecycle is:

1. The user starts the CLI, usually through `entrypoints/cli.tsx` or directly through the bundled runtime.
2. `main.tsx` performs early startup work: profiler checkpoints, keychain/MDM prefetch, config setup, plugin/skill bootstrap, and command discovery.
3. `entrypoints/init.ts` applies safe environment variables, configures shutdown and network state, and begins loading telemetry and policy/remote settings.
4. Setup screens and trust dialogs are rendered if needed.
5. The runtime enters `launchRepl(...)` and the interactive UI becomes the main control surface.
6. When the user submits a prompt or action, the REPL constructs query parameters and calls the query loop in `query.ts`.
7. `query.ts` assembles the message context, applies compaction/collapse logic, and calls the model backend through `services/api/claude.ts`.
8. Streaming model output may contain tool calls.
9. `services/tools/toolOrchestration.ts` partitions tool calls into concurrent read-only batches or serialized stateful batches and executes them against the current `ToolUseContext`.
10. Tool results, assistant outputs, and metadata are appended to transcript storage via `utils/sessionStorage.ts`.
11. The loop either continues for another turn, stops, or yields a terminal state back to the REPL.

A simplified view is:

```text
CLI bootstrap -> startup/init -> setup/trust -> REPL -> query loop -> API stream -> tool execution -> transcript persistence -> next turn / exit
```

Key note: `query.ts` is an async generator, so the REPL can react to partial state and streamed events rather than waiting for a single monolithic response.

## Cross-Cutting Concerns

### Feature Flags and Build Gating
The codebase relies heavily on `feature('...')` and environment guards. Some modules are conditionally required to allow dead-code elimination and to avoid loading expensive or unsupported paths.

This pattern is visible in:
- `entrypoints/cli.tsx`
- `main.tsx`
- `query.ts`
- `tools.ts`
- `commands.ts`

### Permissions and Policy
Permission handling is a first-class runtime concern. Tools are filtered and validated against permission context, and startup also consults policy limits and remote-managed settings. This is especially visible in the tool registry, query loop, and initialization code.

### Telemetry and Diagnostics
There are explicit profiling checkpoints, event logging, and diagnostics helpers throughout the startup and query paths. The code makes a clear distinction between operational logs and analytics events.

### Compaction and Context Management
The app actively manages context window pressure using auto-compact, microcompact, snip compact, and context collapse. These are not incidental helpers; they are part of the core execution model.

### Session and Transcript Integrity
Session files are append-only JSONL logs, and the code contains a large amount of logic to preserve lineage, replayability, resumability, and metadata integrity. This is the main persistence model for user interactions.

### OS and Shell Integration
The runtime touches platform-specific concerns such as keychain access, shell setup, MDM config, PowerShell support, sandboxing, and tmux/SSH behavior. The architecture is therefore not portable in the abstract sense; it is deeply integrated with the local execution environment.

## Risks / Gaps

### 1. No Package Manifest In Repository
There is no visible `package.json`, so dependencies and build scripts are inferred from imports and source usage rather than from a declared manifest. That makes dependency auditing incomplete until the project metadata is reconstructed.

### 2. Large Top-Level Entry Files
`main.tsx` and `query.ts` are both very large and contain many responsibilities. This increases coupling and makes startup/query regressions harder to isolate.

### 3. Heavy Feature-Flag Surface
The codebase contains many gated paths. That is useful for build-time pruning, but it increases the chance of drift between enabled and disabled surfaces.

### 4. Persistence Complexity
`utils/sessionStorage.ts` is highly optimized and correspondingly complex. The transcript format supports resume and replay well, but it is easy for metadata and chain-linking logic to become fragile.

### 5. Inference on External Dependencies
The list of external packages below is inferred from imports rather than from a lockfile. It is accurate enough for architecture documentation, but it should be verified when project metadata is reconstructed.

## Observed External Dependencies
Based on imports in the source tree, the project appears to rely on:
- `bun` runtime features such as `bun:bundle`
- `react`
- `chalk`
- `lodash-es`
- `zod` and `zod/v4`
- `axios`
- `@commander-js/extra-typings`
- `@anthropic-ai/sdk`
- `@modelcontextprotocol/sdk`
- `@opentelemetry/api`

This is a source-based inference. More dependencies almost certainly exist deeper in the tree, but the list above is the clearly visible set from the files inspected for this overview.

## File Map
Representative source locations for the architecture described here:
- `main.tsx`
- `entrypoints/cli.tsx`
- `entrypoints/init.ts`
- `commands.ts`
- `tools.ts`
- `query.ts`
- `services/tools/toolOrchestration.ts`
- `services/api/claude.ts`
- `services/api/bootstrap.ts`
- `bootstrap/state.ts`
- `utils/sessionStorage.ts`
- `history.ts`
- `migrations/`
- `server/createDirectConnectSession.ts`
- `entrypoints/agentSdkTypes.ts`
