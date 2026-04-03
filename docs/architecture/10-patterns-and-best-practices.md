# Patterns and Best Practices

## Scope
This document extracts the project-wide architecture patterns that repeat across the source tree. It is meant to be used as a contributor guide and a decision index, not as a subsystem deep dive.

The main sources used here are:
- [main.tsx](/Users/mirzaasceric/Desktop/claude-code-local/main.tsx#L1)
- [query.ts](/Users/mirzaasceric/Desktop/claude-code-local/query.ts#L1)
- [tools.ts](/Users/mirzaasceric/Desktop/claude-code-local/tools.ts#L1)
- [Tool.ts](/Users/mirzaasceric/Desktop/claude-code-local/Tool.ts#L1)
- [utils/sessionStorage.ts](/Users/mirzaasceric/Desktop/claude-code-local/utils/sessionStorage.ts#L1)
- [utils/gracefulShutdown.ts](/Users/mirzaasceric/Desktop/claude-code-local/utils/gracefulShutdown.ts#L1)
- [state/AppState.tsx](/Users/mirzaasceric/Desktop/claude-code-local/state/AppState.tsx#L1)
- [services/analytics/index.ts](/Users/mirzaasceric/Desktop/claude-code-local/services/analytics/index.ts#L1)
- [services/analytics/sink.ts](/Users/mirzaasceric/Desktop/claude-code-local/services/analytics/sink.ts#L1)
- [services/settingsSync/index.ts](/Users/mirzaasceric/Desktop/claude-code-local/services/settingsSync/index.ts#L130)
- [services/remoteManagedSettings/index.ts](/Users/mirzaasceric/Desktop/claude-code-local/services/remoteManagedSettings/index.ts#L524)
- [services/policyLimits/index.ts](/Users/mirzaasceric/Desktop/claude-code-local/services/policyLimits/index.ts#L497)
- [utils/permissions/permissions.ts](/Users/mirzaasceric/Desktop/claude-code-local/utils/permissions/permissions.ts#L58)
- [utils/sandbox/sandbox-adapter.ts](/Users/mirzaasceric/Desktop/claude-code-local/utils/sandbox/sandbox-adapter.ts#L83)
- [keybindings/loadUserBindings.ts](/Users/mirzaasceric/Desktop/claude-code-local/keybindings/loadUserBindings.ts#L1)

## Core Principles

1. Keep orchestration explicit and localized.
2. Use feature gates and conditional imports to control build/runtime surface area.
3. Treat startup as an ordered pipeline, not an incidental side effect.
4. Prefer source-of-truth registries for commands, tools, and state.
5. Keep mutable UI state narrow and selector-driven.
6. Make persistence append-oriented and resume-friendly.
7. Fail open for optional remote policy/config systems unless there is a security reason not to.
8. Register cleanup for every long-lived watcher, poller, or sink.
9. Push security and permission checks to boundaries.
10. Make telemetry safe by construction.

## 1. Explicit Startup Sequencing
The runtime is very deliberate about startup order. `main.tsx` runs side effects before most imports to overlap expensive work and preserve a predictable boot sequence. The comments at the top of the file explain why `profileCheckpoint`, MDM prefetch, and keychain prefetch happen before the rest of the module graph loads.

This is a good pattern when the startup cost is material and ordering matters. It is also a smell if it spreads into unrelated modules.

Examples:
- [main.tsx](/Users/mirzaasceric/Desktop/claude-code-local/main.tsx#L1) starts profiler and prefetch side effects before normal imports.
- [setup.ts](/Users/mirzaasceric/Desktop/claude-code-local/setup.ts#L160) depends on `setCwd()` running before hook discovery.
- [main.tsx](/Users/mirzaasceric/Desktop/claude-code-local/main.tsx#L1903) explicitly notes that setup must happen before code that depends on cwd or worktree state.

Best practice:
- If a module needs early side effects, document why they must happen there.
- Prefer a small startup pipeline with named stages over hidden cross-module initialization.

## 2. Feature Gates As Boundaries
The codebase uses `feature('...')` heavily as both a runtime switch and a dead-code-elimination hint. This is visible in `main.tsx`, `query.ts`, `tools.ts`, `commands.ts`, `utils/sessionStorage.ts`, and `state/AppState.tsx`.

This is more than configuration. It is the mechanism used to keep large optional surfaces out of the default runtime.

Examples:
- [tools.ts](/Users/mirzaasceric/Desktop/claude-code-local/tools.ts#L14) conditionally requires ant-only and feature-gated tools.
- [query.ts](/Users/mirzaasceric/Desktop/claude-code-local/query.ts#L14) gates optional compaction and classifier modules.
- [state/AppState.tsx](/Users/mirzaasceric/Desktop/claude-code-local/state/AppState.tsx#L12) conditionally injects voice support.
- [utils/sessionStorage.ts](/Users/mirzaasceric/Desktop/claude-code-local/utils/sessionStorage.ts#L180) gates ephemeral progress types by feature.

Best practice:
- Use `feature()` in a direct conditional or ternary when you want Bun to tree-shake the branch.
- Keep the disabled path obvious and side-effect free.
- If the gate protects a new subsystem, add the rationale in a comment near the import site.

Inference:
- The repo treats feature gates as a compatibility layer for multiple product surfaces, not just experimental flags.

## 3. Lazy Imports To Break Cycles And Reduce Cold-Start Cost
Many modules use `require()` or dynamic import specifically to break cycles or avoid loading heavy paths at startup. This is not accidental. The comments in `main.tsx`, `commands.ts`, `query.ts`, and `tools.ts` call out cycle avoidance and dead-code elimination directly.

Examples:
- [main.tsx](/Users/mirzaasceric/Desktop/claude-code-local/main.tsx#L68) lazily requires teammate and swarm modules to break circular imports.
- [commands.ts](/Users/mirzaasceric/Desktop/claude-code-local/commands.ts#L61) lazily requires tools that would otherwise create cycles.
- [query.ts](/Users/mirzaasceric/Desktop/claude-code-local/query.ts#L65) lazily loads optional search/classifier subsystems.
- [tools.ts](/Users/mirzaasceric/Desktop/claude-code-local/tools.ts#L61) uses lazy getters for team tools.

Best practice:
- Use lazy loading for optional surfaces, heavy code, or cycle-prone modules.
- Keep the lazy-load comment close to the call site so future edits preserve the reason.
- When a lazy import exists only for a cycle, document the dependency chain that caused it.

Anti-pattern risk:
- Lazy imports can hide real dependencies and make startup or teardown behavior harder to reason about if they spread without discipline.

## 4. Source-of-Truth Registries
The project relies on central registries for commands, tools, permissions, and app state instead of ad hoc discovery.

Examples:
- [commands.ts](/Users/mirzaasceric/Desktop/claude-code-local/commands.ts#L1) assembles the command registry.
- [tools.ts](/Users/mirzaasceric/Desktop/claude-code-local/tools.ts#L1) is the source of truth for built-in tools.
- [state/AppState.tsx](/Users/mirzaasceric/Desktop/claude-code-local/state/AppState.tsx#L27) creates the app-state provider around a single store.
- [services/analytics/index.ts](/Users/mirzaasceric/Desktop/claude-code-local/services/analytics/index.ts#L80) queues events until a sink attaches.

Best practice:
- Add new behavior by extending the registry rather than bypassing it.
- Keep registry ordering stable when the order influences caching or UX.
- If a registry is a cache key or prompt-cache input, document that explicitly.

Inference:
- Stable ordering in `tools.ts` is intentionally tied to prompt-cache behavior and system-prompt consistency.

## 5. Selector-Driven UI State
The UI uses a small store plus selector-based subscriptions instead of pushing everything through large React component trees. `state/AppState.tsx` is explicit about this: `useAppState(selector)` should return existing references, not freshly allocated objects, and `useSyncExternalStore` is the intended subscription primitive.

Examples:
- [state/AppState.tsx](/Users/mirzaasceric/Desktop/claude-code-local/state/AppState.tsx#L126) documents the selector-first contract.
- [state/AppState.tsx](/Users/mirzaasceric/Desktop/claude-code-local/state/AppState.tsx#L37) prevents nested providers and creates the store once.
- [components/App.tsx](/Users/mirzaasceric/Desktop/claude-code-local/components/App.tsx) is the root provider wrapper used by the Ink tree.

Best practice:
- Select the smallest useful slice of state.
- Return stable object references from selectors.
- Use derived helpers in `state/selectors.ts` or pure utility modules instead of embedding them in render functions.

Anti-pattern risk:
- Returning new objects from selectors will defeat the store's render optimization and can make the terminal UI feel much more expensive than it needs to be.

## 6. Append-Oriented Persistence
Session persistence is file-based and heavily compatibility-aware. `utils/sessionStorage.ts` treats transcript messages as a chain of JSONL entries, explicitly excludes progress rows from the persisted transcript, and keeps compatibility bridges for legacy progress entries.

Examples:
- [utils/sessionStorage.ts](/Users/mirzaasceric/Desktop/claude-code-local/utils/sessionStorage.ts#L129) defines the transcript-message boundary.
- [utils/sessionStorage.ts](/Users/mirzaasceric/Desktop/claude-code-local/utils/sessionStorage.ts#L148) defines chain participation separately from transcript membership.
- [utils/sessionStorage.ts](/Users/mirzaasceric/Desktop/claude-code-local/utils/sessionStorage.ts#L202) computes the current transcript path from session and project state.
- [history.ts](/Users/mirzaasceric/Desktop/claude-code-local/history.ts) uses a global JSONL history log with append-only semantics.

Best practice:
- Preserve on-disk compatibility when changing transcript structure.
- Keep UI-only progress out of persisted conversation history.
- Add explicit bridge code when old on-disk entries need to remain readable.

Anti-pattern risk:
- Persistence code can accumulate chain-fixups, migration bridges, and compatibility logic until the format becomes difficult to reason about.

## 7. Fail Open For Optional Remote Systems
Remote-managed settings, policy limits, and settings sync all prefer to fail open unless a specific policy requires otherwise. The code documents this directly.

Examples:
- [services/settingsSync/index.ts](/Users/mirzaasceric/Desktop/claude-code-local/services/settingsSync/index.ts#L143) describes one-attempt, fail-open download behavior for user-initiated reloads.
- [services/remoteManagedSettings/index.ts](/Users/mirzaasceric/Desktop/claude-code-local/services/remoteManagedSettings/index.ts#L549) resolves the startup promise even when fetch fails.
- [services/remoteManagedSettings/index.ts](/Users/mirzaasceric/Desktop/claude-code-local/services/remoteManagedSettings/index.ts#L603) explicitly avoids failing closed for background polling.
- [services/policyLimits/index.ts](/Users/mirzaasceric/Desktop/claude-code-local/services/policyLimits/index.ts#L507) is fail-open by default, with a small deny-on-miss exception for essential-traffic-only mode.

Best practice:
- Fail open for network-backed configuration when the runtime can continue safely without it.
- Make the exception list explicit when fail-open is not acceptable.
- Keep the loading promise resolution separate from the success path so dependent code never deadlocks on a fetch failure.

Inference:
- The repo treats remote policy/config as advisory unless the policy semantics require a hard denial.

## 8. Cleanup Registration For Long-Lived Resources
Any interval, watcher, sink, or background transport should register cleanup. The repo centralizes shutdown through `utils/cleanupRegistry.ts` and `utils/gracefulShutdown.ts`.

Examples:
- [utils/cleanupRegistry.ts](/Users/mirzaasceric/Desktop/claude-code-local/utils/cleanupRegistry.ts#L1) provides a global cleanup registry.
- [utils/gracefulShutdown.ts](/Users/mirzaasceric/Desktop/claude-code-local/utils/gracefulShutdown.ts#L47) handles terminal reset and exit sequencing.
- [services/remoteManagedSettings/index.ts](/Users/mirzaasceric/Desktop/claude-code-local/services/remoteManagedSettings/index.ts#L626) registers cleanup for polling.
- [services/policyLimits/index.ts](/Users/mirzaasceric/Desktop/claude-code-local/services/policyLimits/index.ts#L649) registers cleanup for polling.
- [keybindings/loadUserBindings.ts](/Users/mirzaasceric/Desktop/claude-code-local/keybindings/loadUserBindings.ts#L18) registers cleanup for file watching.

Best practice:
- Register cleanup at the same time you start the long-lived work.
- Make cleanup idempotent.
- Use `unref()` for background intervals that should not keep the process alive.

Anti-pattern risk:
- Missing cleanup in one background subsystem can leave the terminal dirty, keep the process alive, or leak state across sessions.

## 9. Boundary Security And Permission Layering
Security is layered rather than centralized in one place. Permission rules, classifier checks, sandbox path resolution, and tool-specific checks all contribute to the final decision.

Examples:
- [utils/permissions/permissions.ts](/Users/mirzaasceric/Desktop/claude-code-local/utils/permissions/permissions.ts#L107) layers rule sources and decision reasons.
- [utils/sandbox/sandbox-adapter.ts](/Users/mirzaasceric/Desktop/claude-code-local/utils/sandbox/sandbox-adapter.ts#L83) normalizes CC-specific path patterns before sandbox-runtime sees them.
- [Tool.ts](/Users/mirzaasceric/Desktop/claude-code-local/Tool.ts#L123) encodes a deep permission context for tools.
- [main.tsx](/Users/mirzaasceric/Desktop/claude-code-local/main.tsx#L120) wires permission mode initialization during startup.

Best practice:
- Put path normalization and trust boundary logic at the adapter boundary, not in the tool itself.
- Make the deny/ask/allow decision explainable to the user.
- Use fail-closed behavior for classifier or sandbox failures when the consequence is unsafe execution.

Inference:
- The permission stack is intentionally layered so the runtime can mix static rules, hooks, sandbox policy, and model-initiated decisions without collapsing them into one global switch.

## 10. Telemetry Facades Must Stay Cheap
The analytics layer is deliberately split into a dependency-free facade and a sink. `services/analytics/index.ts` queues events before the sink attaches, and `services/analytics/sink.ts` performs the actual routing to Datadog and 1P logging.

Examples:
- [services/analytics/index.ts](/Users/mirzaasceric/Desktop/claude-code-local/services/analytics/index.ts#L6) states the no-dependency rule explicitly.
- [services/analytics/index.ts](/Users/mirzaasceric/Desktop/claude-code-local/services/analytics/index.ts#L80) queues events before sink attachment.
- [services/analytics/sink.ts](/Users/mirzaasceric/Desktop/claude-code-local/services/analytics/sink.ts#L63) strips general-access payloads before Datadog fanout.

Best practice:
- Keep telemetry facades lightweight and dependency-free.
- Queue early events rather than blocking startup.
- Strip sensitive payloads once at the boundary instead of relying on every sink to do the right thing.

Anti-pattern risk:
- Putting heavy analytics imports in startup paths can create hidden cold-start regressions and import cycles.

## 11. Tool Behavior Should Be Owned By The Tool
Tool implementations are not passive helpers. `Tool.ts` makes tools responsible for prompt text, permission matching, concurrency safety, search indexing, and rendering of progress/result states.

Examples:
- [Tool.ts](/Users/mirzaasceric/Desktop/claude-code-local/Tool.ts#L158) defines the broad `ToolUseContext`.
- [Tool.ts](/Users/mirzaasceric/Desktop/claude-code-local/Tool.ts#L123) uses an immutable permission context.
- [tools.ts](/Users/mirzaasceric/Desktop/claude-code-local/tools.ts#L193) builds the active tool list from the environment and feature flags.
- [query.ts](/Users/mirzaasceric/Desktop/claude-code-local/query.ts#L96) delegates orchestration to `StreamingToolExecutor` and `runTools`.

Best practice:
- Keep tool UX localized in the tool implementation.
- Validate input before execution.
- Distinguish concurrency-safe, read-only operations from stateful operations.

Anti-pattern risk:
- A central "generic tool renderer" will not scale well if individual tools need tailored permission, progress, or result behavior.

## 12. Config And Keybinding Inputs Must Be Validated And Watched
The repo uses watcher-based reloads and schema validation for local customization points. `keybindings/loadUserBindings.ts` is the cleanest example: it gates customization by feature flag, validates structure, deduplicates events, and registers cleanup for the watcher.

Examples:
- [keybindings/loadUserBindings.ts](/Users/mirzaasceric/Desktop/claude-code-local/keybindings/loadUserBindings.ts#L1) documents the employee-only customization gate.
- [keybindings/loadUserBindings.ts](/Users/mirzaasceric/Desktop/claude-code-local/keybindings/loadUserBindings.ts#L66) stores watcher state explicitly.
- [keybindings/loadUserBindings.ts](/Users/mirzaasceric/Desktop/claude-code-local/keybindings/loadUserBindings.ts#L95) validates the file structure with type guards.

Best practice:
- Validate user-edited config before applying it.
- Watch files only where live reload is actually valuable.
- Keep the reload path isolated from the validation path so failures are observable.

## 13. Contribution Rules That Fall Out Of The Code
These are the practices that the source repeatedly rewards:

1. Add behavior through the subsystem's central registry or loader.
2. Keep comments near ordering-sensitive code.
3. Register cleanup for anything long-lived.
4. Use feature gates for optional or product-specific surfaces.
5. Keep selectors narrow and avoid fresh object allocations from store selectors.
6. Preserve on-disk compatibility when changing transcript or history formats.
7. Fail open for advisory network config, but document the one place where fail closed is intended.
8. Validate custom input and keep the validation boundary close to the source.
9. Prefer source-of-truth helpers over ad hoc duplication.
10. When a change adds a new import cycle, fix the cycle with a smaller boundary instead of papering over it.

## 14. Anti-Pattern Risks
The current architecture is strong but has a few obvious pressure points:

1. Large orchestrator files can become everything-bags: `main.tsx`, `query.ts`, `tools.ts`, and `Tool.ts` are already very dense.
2. Feature-flag sprawl can create drift between enabled and disabled code paths.
3. Persistence compatibility logic can become hard to reason about if every format change adds another bridge.
4. Weak cleanup discipline will leak intervals, watchers, or terminal state.
5. Overly broad store selectors will make the terminal UI re-render more than necessary.
6. Ad hoc telemetry additions can accidentally route sensitive data to the wrong sink.
7. Permission changes that skip the adapter boundary can create path-resolution or sandbox mismatches.

## 15. Recommended Review Checklist
Use this checklist when reviewing changes in this repo:

1. Does the change belong in the subsystem's registry, loader, or adapter?
2. Does it introduce a new import cycle or a new top-level side effect?
3. Does it need a feature gate, and if so, is the disabled path safe?
4. Does it allocate new objects in a hot selector or render path?
5. Does it start a watcher, interval, or sink that needs cleanup?
6. Does it touch session/transcript persistence and therefore require compatibility handling?
7. Does it affect permissions, sandboxing, or path normalization at the boundary?
8. Does it log data that needs to be stripped or verified before telemetry?

## Inference
These are source-derived conventions, not a formal style guide. They are still worth treating as project policy because the same patterns are repeated across independent subsystems.
