# Frontend Terminal UI Architecture

## Scope
This document covers the terminal UI layer built on React and Ink, with focus on:
- `components/`
- `hooks/`
- `ink/`
- `screens/`
- `state/`

It explains how the UI is composed, how state flows through the app, how the rendering pipeline works, and which patterns are used to keep a large terminal interface responsive.

## High-Level Structure

The UI is not a browser frontend. It is a terminal application rendered through a custom Ink runtime. The top-level stack is:

```text
main.tsx
  -> entrypoints/init.ts
  -> ink.ts
  -> ink/root.ts
  -> ink/ink.tsx
  -> components/App.tsx
  -> state/AppState.tsx
  -> screens/REPL.tsx
  -> components/*
```

### Root responsibilities
- `main.tsx` boots the session, resolves feature gates, loads startup state, and eventually hands control to the REPL screen.
- `ink.ts` wraps all render calls in `ThemeProvider` so themed UI primitives work without manual provider plumbing.
- `ink/root.ts` exposes a managed root API similar to `react-dom/createRoot`.
- `ink/ink.tsx` is the actual renderer implementation that owns terminal I/O, layout, focus, selection, and diff-based repainting.
- `components/App.tsx` adds app-wide providers for state, stats, and FPS metrics.
- `state/AppState.tsx` exposes the central store and selector hooks.
- `screens/REPL.tsx` orchestrates the interactive session view.

## Folder Map

### `components/`
This is the main UI surface. It contains:
- App shell pieces such as `App.tsx`, `FullscreenLayout.tsx`, `Messages.tsx`, `PromptInput/*`, `Spinner.tsx`
- Dialogs and overlays such as `TrustDialog`, `MCPServerApprovalDialog`, `AutoModeOptInDialog`, `BridgeDialog`
- Transcript and message presentation such as `MessageRow.tsx`, `VirtualMessageList.tsx`, `Message.tsx`, `MessageResponse.tsx`
- Design-system primitives such as `design-system/ThemeProvider.tsx`, `design-system/ThemedText.tsx`, `design-system/ThemedBox.tsx`
- Feature-specific UI families such as `FeedbackSurvey/*`, `Spinner/*`, `LogoV2/*`, `CustomSelect/*`, `permissions/*`, `tasks/*`

### `hooks/`
This folder contains the behavior layer that keeps components thin:
- state subscriptions and derived selectors
- keybinding registration
- notifications
- terminal sizing and input handling
- IDE, remote, voice, MCP, plugin, and task integration hooks

### `ink/`
This is the custom terminal rendering engine and its primitives:
- renderer, reconciler, layout engine, terminal diffing
- event handling and focus management
- terminal input/output wrappers
- base visual primitives like `Box`, `Text`, `Button`, `Link`, `ScrollBox`

### `screens/`
Top-level mode controllers:
- `REPL.tsx` for the interactive shell
- `ResumeConversation.tsx` for resuming history
- `Doctor.tsx` for diagnostics

### `state/`
Central application state:
- `AppStateStore.ts` defines the store shape
- `AppState.tsx` creates the provider and selector hooks
- `selectors.ts` holds pure derived selectors
- `store.ts` implements the minimal pub/sub store
- `teammateViewHelpers.ts` contains state transition helpers

## Rendering Pipeline

### 1. Boot and environment preparation
`main.tsx` does a lot of work before React ever renders:
- starts profiler checkpoints
- prefetches settings and keychain data
- loads feature-gated modules lazily
- constructs the initial app/session state
- initializes plugins, skills, analytics, and session hooks

This is intentional. The app is latency-sensitive, so expensive work is pushed as early as possible or deferred behind feature gates.

### 2. Ink root creation
`ink/root.ts` and `ink/ink.tsx` create the terminal root:
- `renderSync()` mounts a React tree into an Ink instance immediately
- `createRoot()` returns a reusable root so later screens can re-render without recreating the whole terminal host
- both preserve a microtask boundary before first render, which avoids racing startup state against the first paint

### 3. Provider stack
`components/App.tsx` wraps the tree in this order:
1. `FpsMetricsProvider`
2. `StatsProvider`
3. `AppStateProvider`

`state/AppState.tsx` then adds:
- `MailboxProvider`
- optional `VoiceProvider` when the voice feature is enabled

### 4. Screen orchestration
`screens/REPL.tsx` is the main composition layer. It assembles:
- prompt input
- message transcript
- spinner / status area
- task views
- permission dialogs
- overlays and modals
- keybinding handlers and command queues

### 5. Message rendering and terminal diffing
The message surface is rendered through:
- `components/Messages.tsx`
- `components/VirtualMessageList.tsx`
- `components/MessageRow.tsx`

The transcript is usually virtualized, normalized, and memoized before it reaches Ink's diff engine. Ink then translates the React tree into terminal cell updates with its own layout and render pass.

## State Flow

### Central store
`state/store.ts` implements a very small mutable store:
- `getState()`
- `setState(updater)`
- `subscribe(listener)`

`state/AppStateStore.ts` defines the full app state shape. It is intentionally broad because the UI needs to coordinate:
- task state
- plugin state
- MCP state
- permissions
- notifications
- transcript and scroll state
- teammate and remote session state
- theme, model, effort, and session settings

### React access pattern
`state/AppState.tsx` exposes:
- `useAppState(selector)` for subscribing to a slice
- `useSetAppState()` for write-only access
- `useAppStateStore()` for non-React code
- `useAppStateMaybeOutsideOfProvider()` for components that may render outside the provider

This is a selector-first model. Components are expected to subscribe to the smallest possible slice of state rather than pulling whole objects.

### Derived state
`state/selectors.ts` keeps computed logic out of components:
- `getViewedTeammateTask()`
- `getActiveAgentForInput()`

That keeps routing logic pure and testable.

### External state synchronization
The app is not purely local React state. It also synchronizes:
- settings changes from disk
- plugin and MCP updates
- terminal geometry changes
- input queue changes
- remote session updates

Most of these integrations use `useSyncExternalStore`, which is the correct primitive for external mutable sources in React 18.

## Component Organization

### Shell composition
Key shell components:
- `components/App.tsx` - root provider wrapper
- `components/FullscreenLayout.tsx` - fullscreen split between scrollable and bottom-pinned regions
- `components/Messages.tsx` - transcript assembly and filtering
- `components/PromptInput/PromptInput.tsx` - input, mode switching, command hints, and prompt-side interaction
- `components/Spinner.tsx` - loading and task activity presentation

### Message system
The message stack is layered:
- `Messages.tsx` normalizes and filters transcript entries
- `MessageRow.tsx` converts normalized entries into the appropriate visual row
- `Message.tsx` and related subcomponents render the actual content blocks

This separation matters because transcript logic, grouping/collapse rules, and UI presentation are all different concerns.

### Prompt system
`components/PromptInput/` is a subsystem, not a single widget:
- `PromptInput.tsx` is the orchestrator
- subcomponents handle history, suggestions, mode indicators, queued commands, footer hints, and notifications
- hooks under the same folder derive placeholder text, truncation rules, fast-mode hints, and swarm banners

This keeps the main input component large but manageable: it is the interaction hub for the entire application.

### Dialog and overlay system
Dialogs are split into their own components and are often mounted through the fullscreen layout or modal contexts. Examples include:
- trust / permissions dialogs
- plugin and MCP approval dialogs
- onboarding and upsell surfaces
- remote and bridge dialogs

The app treats overlays as first-class UI states, not as incidental popups.

## Interaction Model

### Keyboard-first design
The app is optimized for terminal keyboard flow:
- global keybindings are registered in `hooks/useGlobalKeybindings.tsx`
- command-specific bindings are layered via the keybinding context
- prompt input has its own local key handling for history, mode switching, and inline navigation

### Mode switching
The UI switches between multiple working modes:
- prompt mode
- transcript mode
- full-screen transcript navigation
- teammate or task-focused views
- modal overlays

`screens/REPL.tsx` coordinates these transitions so only one interaction model is active at a time.

### Input routing
`state/selectors.ts` and prompt-side helpers decide where user input should go:
- to the leader session
- to a viewed teammate
- to a named local agent

This routing is explicit rather than implicit, which reduces confusion in multi-agent flows.

### Sticky scrolling
`components/FullscreenLayout.tsx` and `components/VirtualMessageList.tsx` coordinate sticky behavior:
- transcript stays pinned to the bottom by default
- scrolling up breaks sticky mode
- a divider marks where unseen content begins
- a pill indicator lets the user jump back to the latest output

That pattern is central to preserving context in a long-running terminal session.

## UX Primitives

### Theme system
`ink.ts` wraps every render in `ThemeProvider`.

`components/design-system/ThemeProvider.tsx`:
- stores the user theme preference
- resolves `auto` against terminal theme
- supports preview/save/cancel flows
- optionally watches live terminal theme changes when the feature gate is enabled

`components/design-system/ThemedText.tsx` resolves theme keys to raw colors and adds hover-aware inheritance.

### Terminal UI primitives
The UI is built on a small set of custom primitives layered over Ink:
- `Box`
- `Text`
- `Button`
- `Link`
- `Spacer`
- `ScrollBox`
- `RawAnsi`

These are exposed through `ink.ts` so app code mostly uses the local abstraction rather than direct Ink imports.

### Visual feedback
The frontend uses several recurring feedback channels:
- spinners for background activity
- status notices and banners
- permission prompts and safety dialogs
- progress rows and activity indicators
- selection, hover, and focus states

The UI tries to keep state visible even when it is not yet actionable.

## Performance Patterns

### Selector-based state access
The strongest performance pattern in the app is small-state subscription:
- `useAppState(selector)` subscribes only to the selected slice
- components are expected to avoid returning new objects from selectors
- `useSetAppState()` is used when a component only needs a stable writer

This reduces re-renders in a terminal UI where many views are always mounted.

### Virtualization
`components/VirtualMessageList.tsx` plus `hooks/useVirtualScroll.ts` implement React-level virtualization:
- only the visible transcript range and overscan are mounted
- spacers preserve scroll height
- item heights are cached and adjusted on resize
- scrolling is quantized so small scroll deltas do not trigger a full React commit

This is necessary because transcript sessions can become very large.

### Memoization and frozen views
Several components explicitly preserve identity:
- logo/header areas are memoized so they do not invalidate the entire transcript subtree
- `MessageRow.tsx` computes display variants with cached intermediate values
- `OffscreenFreeze` is used to preserve subtrees that should not constantly reflow

### Stable callbacks and small closures
The codebase intentionally avoids repeated per-item closure churn in hot paths. Where a list item is rendered many times, callbacks are usually hoisted or made stable.

### Deferred work
The UI defers expensive or noisy work:
- theme watcher imports are lazy
- scroll-driven updates are quantized or externalized
- message search indexing is warmed explicitly rather than recomputed every keystroke
- animation work is isolated to child components where possible

## Notable Architecture Decisions

### Observed
- The app uses a custom Ink runtime rather than stock Ink directly.
- `AppState` is centralized and shared across shell, transcript, prompt, and overlay components.
- `Messages` and `PromptInput` are large orchestration components, but they delegate most behavior to hooks and subcomponents.
- Transcript rendering is virtualization-heavy because the data set can grow large in a single session.
- Theming is a first-class concern, not an afterthought.

### Inferred best practices
- Keep selectors narrow and return existing references when possible.
- Avoid prop-drilling transient UI state when a shared store or context is a better fit.
- Put pure derivation in `state/selectors.ts` or utility modules, not inside render bodies.
- Split hot paths into smaller components when a subtree has different update frequencies.
- Treat terminal repaint cost as a real performance budget, not just React render cost.

## External Libraries Visible In The UI Stack

These packages are directly visible in the frontend modules:
- `react`
- `react-reconciler`
- `figures`
- `chalk`
- `lodash-es`
- `auto-bind`
- `strip-ansi`

The UI also depends heavily on Node/Bun runtime APIs:
- `fs`
- `path`
- `os`
- `url`
- `stream`
- `child_process`
- `crypto`
- `util`
- `bun:bundle`

## Documentation Boundaries

This file documents the frontend/UI layer only. The following are intentionally separate concerns and should be documented elsewhere:
- backend/service orchestration
- database and persistence
- plugin and MCP architecture
- security and permission boundaries
- command execution and tool runtime

## Maintenance Rules

When this architecture changes:
- update the relevant subsection here first
- add or revise a dedicated markdown file for the affected subsystem
- keep paths in this file aligned with actual source locations
- mark anything uncertain as an inference instead of stating it as fact

The intent is for this document to remain the router for the terminal UI architecture and the entry point for deeper frontend docs.
