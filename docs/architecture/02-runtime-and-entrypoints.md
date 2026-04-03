# Runtime and Entrypoints

This document maps the runtime boot path for the CLI snapshot and explains how the process moves from a tiny bootstrap wrapper into the main interactive or headless execution paths.

## Scope

This file covers:

- Startup files and their responsibilities
- CLI and SDK-adjacent entrypoints
- Initialization order and side effects
- Environment handling and argv rewriting
- Interactive REPL launch wiring
- Headless `--print` / `--sdk-url` execution
- Shutdown and cleanup behavior

It does not attempt to document the full application domain model or every command implementation. Those belong in the command, tools, UI, and services documents.

## Entry Point Map

The runtime is split into a small bootstrap entrypoint and a larger orchestrator:

- `entrypoints/cli.tsx`
- `main.tsx`
- `entrypoints/init.ts`
- `replLauncher.tsx`
- `cli/print.ts`
- `cli/structuredIO.ts`
- `cli/remoteIO.ts`
- `utils/gracefulShutdown.ts`
- `utils/cleanupRegistry.ts`

### Roles

- `entrypoints/cli.tsx` is the first code that runs. It performs very early process-level setup, handles fast-path commands, and only imports `main.tsx` when needed.
- `main.tsx` is the core CLI orchestrator. It parses flags, applies environment policy, loads settings, initializes services, and decides whether to launch the interactive REPL or a headless flow.
- `entrypoints/init.ts` handles trust-safe initialization, config enablement, network setup, telemetry bootstrap, and global cleanup registration.
- `replLauncher.tsx` is the small render bridge that mounts the app shell and the `REPL` screen.
- `cli/print.ts` runs the headless query pipeline used by `--print`, `--sdk-url`, and related stream-json flows.
- `cli/structuredIO.ts` and `cli/remoteIO.ts` implement the structured input/output channel used for SDK and remote transport modes.
- `utils/gracefulShutdown.ts` and `utils/cleanupRegistry.ts` centralize teardown.

## Boot Sequence

### 1. Process bootstrap in `entrypoints/cli.tsx`

`entrypoints/cli.tsx` is intentionally small and uses dynamic imports to keep cheap paths cheap.

Key early actions:

- Disables Corepack auto-pinning by setting `COREPACK_ENABLE_AUTO_PIN=0`
- Expands `NODE_OPTIONS` with `--max-old-space-size=8192` when `CLAUDE_CODE_REMOTE=true`
- Applies an ablation baseline when the corresponding feature gate and env var are present
- Handles `--version` without importing the rest of the app
- Handles a handful of direct fast-path entry modes before loading `main.tsx`

Fast-paths in this file include:

- `--dump-system-prompt`
- `--claude-in-chrome-mcp`
- `--chrome-native-host`
- `--computer-use-mcp`
- `--daemon-worker=<kind>`
- `remote-control` / `rc` / `remote` / `sync` / `bridge`
- `daemon`
- background session management commands like `ps`, `logs`, `attach`, `kill`, `--bg`, `--background`
- template job commands
- `environment-runner`
- `self-hosted-runner`
- `--worktree --tmux`

If none of those fast-paths match, the file enables early stdin capture and imports `main.tsx`.

### 2. Main orchestrator startup in `main.tsx`

`main.tsx` begins with deliberate side effects before most imports complete:

- `profileCheckpoint('main_tsx_entry')`
- `startMdmRawRead()`
- `startKeychainPrefetch()`

These are explicitly placed up top so work can overlap with the expensive module graph load.

Then `main.tsx` loads the rest of the runtime:

- command-line parsing via `@commander-js/extra-typings`
- model, auth, config, analytics, plugin, MCP, session, and UI utilities
- feature-gated modules via `bun:bundle` `feature()`

The main function then performs very early process configuration:

- Sets `NoDefaultCurrentDirectoryInExePath=1` on Windows to reduce PATH hijacking risk
- Installs the warning handler
- Registers a bare `process.on('exit')` cursor reset
- Registers a top-level `SIGINT` handler that exits immediately unless print mode owns the signal

After that, it rewrites argv for special cases before normal command parsing:

- `cc://` and `cc+unix://` URLs
- deep-link handling via `--handle-uri`
- macOS URL handler mode
- `assistant [sessionId]`
- `ssh <host> [dir]`

#### Inference

- The runtime treats `entrypoints/cli.tsx` as the real executable entrypoint and `main.tsx` as the primary application orchestrator.
- The `cli.tsx` wrapper is a performance and fast-path layer, not a separate product mode.

### 3. Mode classification before `run()`

Before commander setup, `main.tsx` classifies the session:

- `isNonInteractive` is true for `-p/--print`, `--init-only`, `--sdk-url`, or non-TTY stdout
- `setIsInteractive()` stores the inverse in bootstrap state
- `initializeEntrypoint(isNonInteractive)` records the launch class for analytics and runtime state
- `setClientType()` records the caller type based on env and launch context

The runtime also preloads settings metadata:

- `eagerLoadSettings()`
- `profileCheckpoint('main_before_run')`
- then `await run()`

## Commander Setup and Pre-Action Initialization

`run()` creates the commander program, configures help sorting, and registers a `preAction` hook.

### Pre-action hook responsibilities

The `preAction` hook is where trust-safe startup work happens before any command action runs:

- Waits for MDM and keychain prefetch completion
- Calls `init()`
- Sets `process.title = 'claude'` unless terminal title changes are disabled
- Initializes analytics sinks
- Applies inline plugins from `--plugin-dir`
- Runs startup migrations
- Starts loading remote managed settings and policy limits
- Optionally kicks off settings sync upload

This design keeps `help` and other no-op paths light while still ensuring any real command has a consistent runtime environment.

## Core Initialization in `entrypoints/init.ts`

`init()` is memoized, so repeated calls are safe and idempotent.

### What `init()` does

- Enables the config system
- Applies only safe environment variables before trust is established
- Applies extra CA certificates early
- Installs graceful shutdown machinery
- Starts 1P event logging lazily
- Populates OAuth account info if missing
- Starts JetBrains detection
- Detects the current GitHub repository
- Initializes remote managed settings and policy limit loading promises if eligible
- Records first-start time
- Configures mTLS
- Configures global HTTP agents and proxy handling
- Preconnects to the Anthropic API
- Starts upstream proxy support in remote mode
- Selects a Windows shell where needed
- Registers cleanup for LSP shutdown
- Registers cleanup for session-created teams
- Ensures the scratchpad directory exists when enabled

### Trust boundary

`init()` deliberately applies only safe environment mutations before trust is known. Full environment application happens later in trusted or explicitly headless contexts.

### Error behavior

- `ConfigParseError` in interactive mode opens the invalid config dialog
- `ConfigParseError` in non-interactive mode prints to stderr and exits
- Other initialization errors are rethrown

## Interactive REPL Path

The interactive path is the default when `main.tsx` does not choose a headless or special submode.

### High-level flow

1. `showSetupScreens()` runs after `createRoot()`
2. Trust, onboarding, login, resume, and optional dialogs resolve
3. LSP initializes only after trust is established
4. Background prefetches and MCP wiring happen
5. State is assembled
6. `launchRepl()` mounts the app shell and REPL screen

### `replLauncher.tsx`

`launchRepl()` is minimal:

- Dynamically imports `App`
- Dynamically imports `REPL`
- Calls `renderAndRun(root, <App><REPL /></App>)`

This keeps the render glue isolated from the main control flow.

### Interactive startup data

`main.tsx` assembles initial REPL state from:

- settings
- permissions
- agent definitions
- MCP clients/tools
- plugin state
- notifications
- file history
- prompt suggestions
- team context
- model selection
- remote control status

It also handles feature-specific startup addenda such as:

- assistant mode prompts
- proactive mode prompts
- Chrome integration prompts
- brief mode opt-in

### Dialogs and gating

Interactive startup can branch through:

- trust dialog
- onboarding
- invalid settings dialog
- resume chooser
- assistant install/session chooser
- teleport mismatch dialogs

These are all delayed until after the app shell is ready so the user sees a real UI rather than a blocking CLI pause.

## Headless and SDK Paths

The headless path is selected when:

- `-p/--print` is present
- `--init-only` is present
- `--sdk-url` is present
- stdout is not a TTY

### `cli/print.ts`

`runHeadless()` is the execution engine for print/stream-json flows.

Major responsibilities:

- Parses or normalizes prompt input
- Builds `StructuredIO` or `RemoteIO`
- Resolves MCP tools and commands
- Applies permission filtering
- Runs `runHeadlessStreaming()`
- Writes text, JSON, or stream-json output
- Performs graceful shutdown with session persistence and analytics flushing

### `cli/structuredIO.ts`

`StructuredIO` manages the local stream-json protocol used by SDK and headless callers.

It is responsible for:

- parsing stdin messages
- normalizing control messages
- permission request handling
- emitting SDK-compatible stdout messages
- translating control responses into internal state updates

### `cli/remoteIO.ts`

`RemoteIO` wraps `StructuredIO` for remote stream transports.

It:

- builds auth headers from session ingress tokens
- chooses the transport by URL
- wires up data and close callbacks
- initializes CCR v2 support when enabled
- keeps remote sessions alive with periodic keep-alive frames in bridge mode
- registers cleanup for both CCR client closure and transport closure

### SDK-facing entrypoint files

The SDK contract is defined in:

- `entrypoints/agentSdkTypes.ts`
- `entrypoints/sdk/coreTypes.ts`
- `entrypoints/sdk/controlSchemas.ts`
- `entrypoints/sdk/coreSchemas.ts`

`entrypoints/agentSdkTypes.ts` is a public re-export surface for SDK builders and consumers.

#### Inference

- Runtime code imports `entrypoints/sdk/controlTypes.js`, but no matching source file is present in this tree.
- That module is likely generated, bundled from another source, or omitted from this snapshot.
- The runtime still treats the control protocol as a first-class SDK surface through the shared schemas and type imports.

## Environment Handling

This codebase uses environment variables aggressively, but not uniformly.

### Early bootstrap env

Set before the main app loads:

- `COREPACK_ENABLE_AUTO_PIN=0`
- `NODE_OPTIONS=--max-old-space-size=8192` in remote mode
- `CLAUDE_CODE_SIMPLE=1` when `--bare` is passed

### Trust-safe initialization env

Applied in `init()`:

- safe config variables via `applySafeConfigEnvironmentVariables()`
- CA certificates via `applyExtraCACertsFromConfig()`

### Full trusted env

Applied only once trust is established, or in trusted headless flows:

- `applyConfigEnvironmentVariables()`

### Runtime routing env

The main orchestrator reads many routing and feature vars, including:

- `CLAUDE_CODE_ENTRYPOINT`
- `CLAUDE_CODE_ENVIRONMENT_KIND`
- `CLAUDE_CODE_REMOTE`
- `CLAUDE_CODE_SESSION_ACCESS_TOKEN`
- `CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR`
- `CLAUDE_CODE_QUESTION_PREVIEW_FORMAT`
- `CLAUDE_CODE_DISABLE_TERMINAL_TITLE`
- `CLAUDE_CODE_PROACTIVE`
- `CLAUDE_CODE_COORDINATOR_MODE`
- `CLAUDE_CODE_INCLUDE_PARTIAL_MESSAGES`
- `CLAUDE_CODE_TASK_LIST_ID`
- `ANTHROPIC_MODEL`
- `MAX_THINKING_TOKENS`

### Trust and safety pattern

The important pattern is that destructive or side-effect-heavy environment application is delayed until one of these is true:

- trust is explicitly granted in the UI
- the mode is non-interactive and considered trusted
- the code path is a narrow bootstrap utility with its own guardrails

## Shutdown and Cleanup

Shutdown is centralized in `utils/gracefulShutdown.ts`.

### What graceful shutdown does

- Sets `process.exitCode`
- Exits the alt screen and restores terminal state
- Prints a resume hint when appropriate
- Runs registered cleanup functions
- Runs session-end hooks
- Flushes analytics
- Forces exit on timeout or terminal failure

### Signal handling

`setupGracefulShutdown()` installs:

- `SIGINT`
- `SIGTERM`
- `SIGHUP` on non-Windows platforms
- orphan detection for revoked TTYs
- `uncaughtException` logging
- `unhandledRejection` logging

### Cleanup registry

`utils/cleanupRegistry.ts` provides a simple process-wide registry:

- `registerCleanup(cleanupFn)`
- `runCleanupFunctions()`

This registry is used by multiple subsystems so teardown can be coordinated without tight coupling.

### Shutdown order

The shutdown path is intentionally ordered:

1. Terminal modes are cleaned first
2. Resume hint is printed early
3. Cleanup functions run with a short timeout
4. Session-end hooks run within a budget
5. Analytics flush with a cap
6. The process exits forcefully if required

### Registered cleanups seen in the runtime

- LSP server manager shutdown from `entrypoints/init.ts`
- Session team cleanup from `entrypoints/init.ts`
- CCR client shutdown from `cli/remoteIO.ts`
- Remote transport cleanup from `cli/remoteIO.ts`
- Runtime state logging from `cli/print.ts`

## Runtime Modes

### Interactive default

The default mode is the full Ink REPL with setup screens, command handling, tool execution, MCP wiring, and session persistence.

### Print mode

`--print` uses the headless engine and is optimized for pipes and non-interactive consumers.

### SDK mode

`--sdk-url` switches the IO layer into remote structured transport mode. In this mode, the runtime speaks stream-json and optionally uses remote transport via `RemoteIO`.

### Bridge / remote control mode

Remote control flows are routed through special early entrypoints or later branch logic in `main.tsx`.

### SSH mode

`claude ssh` is rewritten early so the REPL can be backed by an SSH session while still rendering locally.

### Direct connect mode

`cc://` and `cc+unix://` are parsed early and turned into interactive or headless connect flows.

## Imported External Packages

Because there is no `package.json` in this snapshot, dependency inventory has to be inferred from imports.

Likely external packages used by the runtime entry path include:

- `@commander-js/extra-typings`
- `chalk`
- `lodash-es`
- `react`
- `signal-exit`
- `@opentelemetry/api`
- `@modelcontextprotocol/sdk`
- `zod`
- `bun:bundle`

#### Inference

- This is an import-based dependency list, not a resolved package manifest.
- Some modules may be generated or vendored, and the absence of `package.json` means the list should be treated as a runtime approximation.

## Design Patterns

The runtime uses a few recurring patterns consistently:

- Dynamic imports for expensive or rarely used paths
- Feature-gated dead code elimination through `feature()`
- Early argv rewriting for submodes
- Trust-gated side effects
- Memoized initialization functions
- Separate safe vs full environment application
- Cleanup registry instead of ad hoc teardown chains
- Shared state bootstrapped before REPL mount
- Non-blocking prefetches for network and cache warmups

## Practical Reading Order

If you are tracing the runtime in source order, read these files in this sequence:

1. `entrypoints/cli.tsx`
2. `main.tsx`
3. `entrypoints/init.ts`
4. `replLauncher.tsx`
5. `cli/print.ts`
6. `cli/structuredIO.ts`
7. `cli/remoteIO.ts`
8. `utils/gracefulShutdown.ts`
9. `utils/cleanupRegistry.ts`

That order matches the actual process lifecycle more closely than alphabetical browsing.
