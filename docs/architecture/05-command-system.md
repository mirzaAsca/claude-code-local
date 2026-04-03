# Command System Architecture

## Scope
This document covers the command system as implemented across:

- [`commands.ts`](/Users/mirzaasceric/Desktop/claude-code-local/commands.ts)
- [`commands/`](/Users/mirzaasceric/Desktop/claude-code-local/commands)
- [`cli/`](/Users/mirzaasceric/Desktop/claude-code-local/cli)
- [`keybindings/`](/Users/mirzaasceric/Desktop/claude-code-local/keybindings)
- supporting types in [`types/command.ts`](/Users/mirzaasceric/Desktop/claude-code-local/types/command.ts) and [`types/textInputTypes.ts`](/Users/mirzaasceric/Desktop/claude-code-local/types/textInputTypes.ts)

It documents how commands are declared, loaded, filtered, dispatched, and surfaced in the terminal UI. It also covers the bridge between slash commands and keyboard shortcuts.

## Architecture Summary
The project uses a typed command registry with three major command shapes:

1. `prompt` commands that expand into model-facing prompt content.
2. `local` commands that execute imperative logic and return text or side effects.
3. `local-jsx` commands that render an Ink/React UI and complete via callback.

The registry is built from multiple sources:

- built-in slash commands in `commands/`
- dynamic command sources from skills, plugins, and workflows
- feature-gated optional commands
- remote-safe subsets for remote control sessions

The registry is loaded lazily and memoized so startup stays cheap while still allowing runtime refresh when plugins, skills, or settings change.

## Core Command Model
The command type system is defined in [`types/command.ts`](/Users/mirzaasceric/Desktop/claude-code-local/types/command.ts).

### Command Kinds
- `prompt`: produces prompt text for the model through `getPromptForCommand()`.
- `local`: loads a module dynamically and returns a `call()` function that yields a `LocalCommandResult`.
- `local-jsx`: loads a module dynamically and returns a `call()` function that renders a React node and uses `onDone()` to report completion.

### Important Metadata
The shared `CommandBase` shape adds metadata used by UI, filtering, and routing:

- `name`: canonical identifier.
- `aliases`: alternate names accepted by lookup and help.
- `description`: user-facing summary.
- `availability`: auth/provider gating.
- `isEnabled()`: feature-flag and runtime gating.
- `isHidden`: hide from help/typeahead.
- `loadedFrom`: provenance such as `commands_DEPRECATED`, `skills`, `plugin`, `bundled`, or `mcp`.
- `kind`: used for workflow-backed commands.
- `disableModelInvocation`: prevents model-side use.
- `userInvocable`: indicates direct slash-command use.
- `immediate`: bypasses queueing for certain commands.
- `isSensitive`: redacts arguments from history.

### Command Outputs
`LocalCommandResult` is intentionally small:

- `{ type: 'text', value: string }`
- `{ type: 'compact', compactionResult, displayText? }`
- `{ type: 'skip' }`

That keeps local command execution predictable and easy to render in the transcript.

## Registry Loading
The registry is assembled in [`commands.ts`](/Users/mirzaasceric/Desktop/claude-code-local/commands.ts).

### Static Imports
The file imports the built-in command descriptors directly, which makes the static command set explicit and discoverable. Examples include:

- `help`
- `clear`
- `config`
- `mcp`
- `skills`
- `review`
- `session`
- `keybindings`

### Feature-Gated Imports
Optional commands are conditionally required behind Bun feature flags using `bun:bundle`:

- `BRIDGE_MODE`
- `VOICE_MODE`
- `ULTRAPLAN`
- `WORKFLOW_SCRIPTS`
- `KAIROS`
- `BUDDY`
- others in the same pattern

This reduces the external build surface and avoids loading code for disabled capabilities.

### Lazy and Deferred Loading
Several command families are intentionally not loaded at module initialization:

- dynamic skills from filesystem directories
- plugin-defined commands
- workflow commands
- optional feature-gated commands

The registry uses memoization to avoid repeated expensive I/O. `getCommands(cwd)` still re-evaluates availability and enabled state on each call so auth and feature changes can take effect without restart.

### Command Ordering
`getCommands()` builds the final visible list in this order:

1. bundled skills
2. built-in plugin skills
3. skill directory commands
4. workflow commands
5. plugin commands
6. plugin skills
7. built-in slash commands

Dynamic skills can then be injected ahead of built-in commands if they are newly discovered at runtime.

## Filtering And Visibility
The registry applies two separate gates before a command is shown or executed.

### Availability Gate
`meetsAvailabilityRequirement()` checks whether the current auth/provider environment matches the command’s declared availability. In practice this hides commands that only make sense for:

- `claude-ai`
- `console`

### Enabled Gate
`isCommandEnabled()` is evaluated after availability. This is where feature flags, platform checks, and runtime conditions hide commands.

### Remote Mode Filtering
`filterCommandsForRemoteMode()` removes commands that are not safe in remote sessions. The remote-safe allowlist is intentionally small and focuses on local state-only commands such as:

- `session`
- `exit`
- `clear`
- `help`
- `theme`
- `color`
- `vim`
- `cost`
- `usage`
- `copy`
- `btw`
- `feedback`
- `plan`
- `keybindings`
- `statusline`
- `stickers`
- `mobile`

This filter is applied before the REPL renders in remote flows so local-only commands never briefly appear.

### Bridge Safety
`isBridgeSafeCommand()` in [`commands.ts`](/Users/mirzaasceric/Desktop/claude-code-local/commands.ts) allows prompt commands by default, blocks `local-jsx`, and only permits selected `local` commands through `BRIDGE_SAFE_COMMANDS`.

That distinction prevents remote control clients from re-triggering local terminal UI side effects.

## Lookup And Dispatch
The command lookup helpers in [`commands.ts`](/Users/mirzaasceric/Desktop/claude-code-local/commands.ts) are intentionally narrow:

- `findCommand()` searches canonical name, user-facing name, and aliases.
- `hasCommand()` is a boolean convenience wrapper.
- `getCommand()` throws a `ReferenceError` when no command matches.

That means command dispatchers should resolve the command first and fail fast if the name is invalid.

### User-Facing Names
`getCommandName()` resolves `userFacingName()` first, then falls back to `name`. This supports commands whose displayed label differs from the internal identifier, such as some plugin commands.

### Description Formatting
`formatDescriptionWithSource()` appends provenance to prompt commands for UI surfaces such as autocomplete and help. It intentionally does not change the model-facing prompt text.

## Command Lifecycle
The runtime lifecycle is most visible in the queue processing flow in [`cli/print.ts`](/Users/mirzaasceric/Desktop/claude-code-local/cli/print.ts) and the lifecycle hook in [`utils/commandLifecycle.ts`](/Users/mirzaasceric/Desktop/claude-code-local/utils/commandLifecycle.ts).

### Queue Shape
Queued user input is represented by `QueuedCommand` in [`types/textInputTypes.ts`](/Users/mirzaasceric/Desktop/claude-code-local/types/textInputTypes.ts). Important fields include:

- `value`: plain text or structured content blocks
- `mode`: `prompt`, `bash`, `orphaned-permission`, or `task-notification`
- `uuid`: delivery identity
- `priority`: scheduling hint
- `skipSlashCommands`: prevents local slash parsing for remote-originated input
- `bridgeOrigin`: enables bridge-safe command dispatch
- `isMeta`: marks hidden/system-generated messages
- `workload`: billing attribution
- `agentId`: isolates main-thread versus subagent traffic

### Turn Processing
In [`cli/print.ts`](/Users/mirzaasceric/Desktop/claude-code-local/cli/print.ts), the command queue is drained before each `ask()` call:

1. Dequeue a command for the main thread or relevant agent scope.
2. Reject unsupported queue modes in streaming mode.
3. Batch consecutive prompt commands when they can be merged safely.
4. Re-emit replay events for batched user messages when needed.
5. Rebuild the active command, tool, and MCP state.
6. Notify lifecycle listeners that queued messages have started.
7. Call `ask()` with the merged prompt and runtime context.
8. Notify lifecycle listeners again when the turn completes.

### Remote Delivery Tracking
[`cli/remoteIO.ts`](/Users/mirzaasceric/Desktop/claude-code-local/cli/remoteIO.ts) subscribes to lifecycle notifications and forwards them to CCR delivery state:

- `started` becomes `processing`
- `completed` becomes `processed`

That keeps remote clients synchronized with local queue progression.

### Error Handling
Command execution and queue processing favor explicit, recoverable failures:

- invalid command lookup throws immediately
- non-critical subsystems log errors and continue where possible
- remote initialization failures trigger graceful shutdown with a clear message
- command-loading failures for non-critical sources such as skills return empty lists instead of crashing the app

Inference: the system prefers a fail-fast model for invalid user input, but a degrade-gracefully model for optional subsystems like plugin and skill discovery.

## CLI Subcommand Architecture
The CLI helpers under [`cli/`](/Users/mirzaasceric/Desktop/claude-code-local/cli) support both interactive and non-interactive command execution.

### Exit Helpers
[`cli/exit.ts`](/Users/mirzaasceric/Desktop/claude-code-local/cli/exit.ts) centralizes CLI termination:

- `cliError(msg?)` prints to stderr and exits with code `1`
- `cliOk(msg?)` prints to stdout and exits with code `0`

This avoids repeated `console.error + process.exit` patterns and keeps subcommand handlers small.

### Subcommand Handlers
Handlers in [`cli/handlers/`](/Users/mirzaasceric/Desktop/claude-code-local/cli/handlers) are dynamically imported so only the requested subcommand loads its dependencies. Examples include:

- `auth`
- `agents`
- `autoMode`
- `mcp`

This pattern keeps startup lean and reduces accidental coupling between CLI utilities and the main REPL.

### Structured And Remote IO
[`cli/structuredIO.ts`](/Users/mirzaasceric/Desktop/claude-code-local/cli/structuredIO.ts) is the protocol layer for SDK/remote message handling. [`cli/remoteIO.ts`](/Users/mirzaasceric/Desktop/claude-code-local/cli/remoteIO.ts) wraps transport selection, session ingress auth, and remote keep-alive behavior.

These files are not command dispatchers themselves, but they are part of the command system because queued commands and lifecycle events are transported through them.

## Keybinding Architecture
The keybinding system is tightly coupled to commands and uses command identifiers as actions.

### Binding Source
[`keybindings/defaultBindings.ts`](/Users/mirzaasceric/Desktop/claude-code-local/keybindings/defaultBindings.ts) defines the built-in shortcut map, grouped by UI context:

- `Global`
- `Chat`
- `Autocomplete`
- `Confirmation`
- `Settings`
- `Transcript`
- `HistorySearch`
- `Task`
- `ThemePicker`
- `Scroll`
- `Help`
- and other dialog-specific contexts

### Custom Keybindings
[`keybindings/loadUserBindings.ts`](/Users/mirzaasceric/Desktop/claude-code-local/keybindings/loadUserBindings.ts) loads `~/.claude/keybindings.json`, validates it, and watches it for changes. Validation feedback is surfaced through notifications in [`keybindings/KeybindingProviderSetup.tsx`](/Users/mirzaasceric/Desktop/claude-code-local/keybindings/KeybindingProviderSetup.tsx).

### Resolution
[`keybindings/useKeybinding.ts`](/Users/mirzaasceric/Desktop/claude-code-local/keybindings/useKeybinding.ts) resolves physical keys into actions, including chord sequences such as `ctrl+x ctrl+k`.

Important behavior:

- active contexts override `Global`
- completed chords clear pending state
- explicit unbound bindings still consume the event
- handlers may return `false` to allow fall-through

### Command Bindings
Keybinding schema supports `command:<name>` bindings, which execute slash commands as if typed. The validator restricts these to `Chat` context so command execution only occurs in the proper input surface.

That is the main bridge between keyboard shortcuts and the slash-command system.

## UX Patterns
The command system is built to support a mixed terminal UI and command palette experience.

### Lazy UX Loading
Heavy UI commands load their React tree only when invoked. This is visible in commands such as:

- `help`
- `session`
- `bridge`
- `review` variants
- `mcp` subcommands

### Source-Annotated Help
Help and autocomplete surfaces can show where a command came from through `formatDescriptionWithSource()`. This reduces confusion when commands are injected by plugins or skills.

### Context-Specific Shortcuts
Keybindings are declared per UI context rather than globally. That keeps modal interfaces predictable and prevents a single shortcut from having unrelated behavior in different parts of the UI.

### Immediate Commands
Some commands are marked `immediate` so they execute without waiting for a stop point. Inference: this is reserved for commands that change local UI state or need to respond before the next turn is queued.

## Extensibility Conventions
New commands should follow the existing layering:

1. Define the command descriptor in a dedicated `commands/<name>/index.ts` or `commands/<name>.ts`.
2. Export a `Command` object with the correct `type`.
3. Keep heavy UI or network code behind `load()` for local/local-jsx commands.
4. Add the command to `commands.ts` if it is part of the built-in registry.
5. Add feature gating with `isEnabled()` instead of deleting command declarations.
6. Add `availability` if the command is provider-specific.
7. Add `bridge-safe` or `remote-safe` allowlist entries only when the command is demonstrably safe.
8. If the command has a keyboard shortcut, add the action to `keybindings/types.ts` and map it in `defaultBindings.ts`.

### Recommended File Layout
The project already follows a clean folder convention that should be preserved:

- `commands/<name>/index.ts` for metadata
- `commands/<name>/<name>.ts[x]` for implementation
- `cli/handlers/<name>.ts[x]` for non-interactive CLI handlers
- `keybindings/` for shortcut parsing, validation, resolution, and provider setup
- `types/command.ts` for shared command contracts

## Error Handling Strategy
The command system uses different failure modes depending on the kind of issue.

### User Errors
- unknown commands throw a clear `ReferenceError`
- invalid keybindings produce validator warnings and errors
- missing or invalid CLI subcommand inputs exit with code `1`

### Optional Source Failures
- plugin skill loading failures are logged and ignored
- skill directory loading failures are logged and ignored
- non-critical command sources may degrade to empty lists

### Runtime Failures
- remote initialization failures trigger `gracefulShutdown(1)`
- CLI helpers use `cliError()` to ensure a single exit path
- keybinding parsing failures are surfaced through notifications and `/doctor`

Inference: this is a deliberate split between "bad input" and "optional dependency failure," which keeps the interactive shell resilient while still surfacing actionable problems.

## Folder Structure
The command system is easiest to navigate by concern:

- [`commands.ts`](/Users/mirzaasceric/Desktop/claude-code-local/commands.ts) - registry assembly, filtering, and lookup
- [`commands/`](/Users/mirzaasceric/Desktop/claude-code-local/commands) - command definitions and implementations
- [`cli/`](/Users/mirzaasceric/Desktop/claude-code-local/cli) - non-interactive entrypoints, handlers, transports, and exit helpers
- [`keybindings/`](/Users/mirzaasceric/Desktop/claude-code-local/keybindings) - config, validation, parsing, and runtime keybinding provider
- [`types/command.ts`](/Users/mirzaasceric/Desktop/claude-code-local/types/command.ts) - command contracts
- [`types/textInputTypes.ts`](/Users/mirzaasceric/Desktop/claude-code-local/types/textInputTypes.ts) - queued input model used by the dispatcher

## Notes And Inference
This document is source-based, but a few points are inferred from patterns rather than a single explicit comment:

- the exact UX contract for some `immediate` commands
- the intended distinction between remote-safe and bridge-safe command subsets
- the long-term reason for some lazy-loading splits

These inferences are consistent with the registry and queue code, but they should be treated as implementation guidance rather than formal public API.
