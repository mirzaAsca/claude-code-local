# Tool Runtime Architecture

## Scope
This document describes the tool runtime layer for the CLI:

- `Tool.ts` defines the core tool contract and defaults.
- `tools.ts` assembles the runtime tool pool and applies environment/permission filtering.
- `tools/*` contains concrete tool implementations and their UI/rendering helpers.
- `Task.ts`, `tasks.ts`, `tasks/*`, and `utils/task/*` define the task model used by long-running tools.
- `utils/permissions/*` defines the permission decision system that gates tool execution.
- `services/tools/toolExecution.ts` and the message rendering components connect tool calls to transcript output.

Where behavior is not directly explicit in a single file, it is marked as an inference.

## High-Level Model
The runtime is built around a few stable ideas:

- A tool is a typed capability with schema validation, permission checks, execution, and rendering hooks.
- The tool registry is assembled dynamically based on environment flags, feature flags, user type, and permission context.
- Tool calls are executed through a central orchestration path, not directly from UI components.
- Tool results are mapped into Anthropic tool-result blocks and also rendered into terminal UI components.
- Long-running operations are represented as tasks so they can survive, stream, notify, and be polled independently of one model turn.

## Core Contract: `Tool`
`Tool.ts` is the canonical interface for every built-in and MCP tool.

### Required shape
A tool must provide:

- `name`
- `inputSchema`
- `call(...)`
- `description(...)`
- `isEnabled()`
- `isConcurrencySafe(...)`
- `isReadOnly(...)`
- `checkPermissions(...)`
- `prompt(...)`
- `userFacingName(...)`
- `toAutoClassifierInput(...)`
- `mapToolResultToToolResultBlockParam(...)`
- `renderToolUseMessage(...)`

### Optional runtime hooks
The interface also supports:

- `aliases` for backwards-compatible renames.
- `searchHint` for deferred tool search.
- `inputJSONSchema` for MCP-style schema definitions.
- `outputSchema` for validating stored results.
- `inputsEquivalent` for deduping equivalent requests.
- `isDestructive`, `interruptBehavior`, `isSearchOrReadCommand`, `isOpenWorld`, `requiresUserInteraction`.
- `shouldDefer` and `alwaysLoad` for prompt assembly behavior.
- `mcpInfo`, `isMcp`, `isLsp` for protocol-aware tools.
- `backfillObservableInput` for normalized observer input.
- `validateInput` for tool-specific preflight validation.
- `preparePermissionMatcher` for cached hook-rule matching.
- `renderToolResultMessage`, `renderToolUseTag`, `renderToolUseProgressMessage`, `renderToolUseQueuedMessage`, `renderToolUseRejectedMessage`, `renderToolUseErrorMessage`.
- `renderGroupedToolUse` for grouped parallel rendering.
- `extractSearchText` for transcript search indexing.
- `isTransparentWrapper` for wrapper tools that delegate visible rendering to inner tool progress.

### Defaulting strategy
`buildTool()` fills safe defaults for the most commonly omitted methods:

- `isEnabled()` defaults to `true`.
- `isConcurrencySafe()` defaults to `false`.
- `isReadOnly()` defaults to `false`.
- `isDestructive()` defaults to `false`.
- `checkPermissions()` defaults to allow with unchanged input.
- `toAutoClassifierInput()` defaults to an empty string.
- `userFacingName()` defaults to the tool name.

Inference: this defaulting pattern is intentionally fail-closed for concurrency, read-only classification, and destructive behavior, while allowing tools to opt into richer behavior incrementally.

## Tool Registry Assembly
`tools.ts` is the source of truth for available built-in tools.

### Registry flow
1. `getAllBaseTools()` constructs the exhaustive built-in tool list for the current environment.
2. `getTools(permissionContext)` filters the list for the current mode and deny rules.
3. `assembleToolPool(permissionContext, mcpTools)` merges built-ins with runtime MCP tools and deduplicates by name.
4. `getMergedTools(permissionContext, mcpTools)` returns the concatenated list when deduplication is not required.

### Filtering rules
The registry is filtered by several conditions:

- `filterToolsByDenyRules()` removes tools that match blanket deny rules from the permission context.
- `getTools()` applies simple-mode narrowing when `CLAUDE_CODE_SIMPLE` is set.
- REPL mode hides primitive tools from direct use and keeps them inside the REPL wrapper path.
- Feature flags and environment checks gate optional tools such as workflow, monitor, cron, PowerShell, LSP, task tools, and coordinator-only helpers.
- `getAllBaseTools()` preserves ordering for prompt-cache stability, then later sorting is done in `assembleToolPool()`.

### Special prompt-cache behavior
Inference: the registry is intentionally ordered and grouped to preserve system-prompt cache stability. The code comments show that built-ins are kept contiguous so cache breakpoints do not churn when MCP tools are added.

## Tool Execution Pipeline
The central execution path lives in `services/tools/toolExecution.ts`.

### Execution sequence
1. The tool is resolved by name using `findToolByName()`.
2. Input may be backfilled and normalized for observers.
3. The tool-specific permission check runs.
4. The general permission system decides allow/ask/deny behavior.
5. The tool is called through `tool.call(...)` with context, `canUseTool`, assistant message, and progress callback.
6. The tool result is converted into a `ToolResultBlockParam` using `mapToolResultToToolResultBlockParam()`.
7. The result is persisted, rendered, and logged for telemetry.

### Context passed to `call()`
`ToolUseContext` is the runtime state carrier. It includes:

- Active tools, commands, debug/verbose flags, model name, MCP clients/resources, and query tracking.
- App state accessors and task-scoped update helpers.
- Permission context, denial tracking, memory attachment hints, and tool decision history.
- UI callbacks such as `setToolJSX`, notifications, stream mode, SDK status, and elicitations.
- Session-scoped data such as messages, file/glob limits, and rendered system prompt bytes.

Inference: the context object is deliberately broad because tools are not pure functions. They need access to model/runtime state, UI side effects, and shared session infrastructure.

### Result handling
`ToolResult<T>` carries:

- `data`: the tool’s semantic result.
- `newMessages`: additional messages to inject back into the conversation.
- `contextModifier`: a hook for non-concurrency-safe tools to adjust the context after execution.
- `mcpMeta`: structured-content metadata for SDK consumers.

`services/tools/toolExecution.ts` maps the returned data to the API block format once, then reuses that mapping for analytics and transcript injection.

### Telemetry and enrichment
The runtime records tool execution metadata such as:

- duration
- tool result size
- file extension hints for file-related tools
- MCP server details when relevant
- tool-specific content attributes for selected tools

Inference: tool telemetry is not just diagnostic; it also feeds product analytics and prompt/search behavior.

## Permission System
Permissions are defined in `types/permissions.ts` and enforced in `utils/permissions/permissions.ts`.

### Permission modes
The runtime supports these user-addressable modes:

- `acceptEdits`
- `bypassPermissions`
- `default`
- `dontAsk`
- `plan`
- `auto` when the transcript classifier feature is enabled

### Rule model
Permissions are expressed as rules with:

- a `source`
- a `behavior` (`allow`, `deny`, `ask`)
- a `ruleValue` containing a tool name and optional content pattern

Rules can come from user settings, project settings, local settings, CLI arguments, commands, and session state.

### Tool-level enforcement
A tool’s `checkPermissions()` is responsible for tool-specific logic after the general permission logic has been applied.

Typical patterns:

- Bash and PowerShell perform deep command safety analysis.
- File tools validate path safety and edit semantics.
- Task and agent tools validate identity, scope, and target existence.
- Network-facing or external tools usually add narrower checks around allowed targets.

### General runtime enforcement
`utils/permissions/permissions.ts` builds user-facing messages, applies classifier/hook/sandbox decisions, and uses denial tracking to avoid prompting forever in repeated failure loops.

Inference: the permission layer is intentionally layered so the runtime can combine static rules, dynamic classifier checks, sandbox policy, and tool-specific safety checks without forcing every tool to reimplement the same logic.

## Task Runtime
Tasks are the execution substrate for operations that outlive a single model turn.

### Base task contract
`Task.ts` defines:

- `TaskType` values: `local_bash`, `local_agent`, `remote_agent`, `in_process_teammate`, `local_workflow`, `monitor_mcp`, `dream`
- `TaskStatus` values: `pending`, `running`, `completed`, `failed`, `killed`
- `TaskHandle` for spawned task cleanup
- `TaskContext` for state updates and abort control
- `TaskStateBase` shared by every task state
- `Task` with a `kill(taskId, setAppState)` method

### Task lifecycle
1. A task state is created from `createTaskStateBase()`.
2. The task is registered into app state with `registerTask()`.
3. Background work runs and appends to a disk-backed output file.
4. The framework polls for output deltas and task state changes.
5. When a task completes, it enqueues a notification and becomes eligible for eviction.

### Task state categories
`tasks/types.ts` groups concrete task states into:

- local shell tasks
- local agent tasks
- remote agent tasks
- in-process teammate tasks
- local workflow tasks
- monitor MCP tasks
- dream tasks

### Framework helpers
`utils/task/framework.ts` is the shared task engine:

- `registerTask()` inserts or replaces task state.
- `updateTaskState()` applies targeted updates.
- `generateTaskAttachments()` emits task status/output attachments.
- `applyTaskOffsetsAndEvictions()` merges attachment-side patches back into app state.
- `pollTasks()` runs the periodic task polling loop.
- `evictTerminalTask()` removes dead tasks once their notifications have been consumed.

Inference: tasks are treated as first-class runtime objects because long-running shell, agent, remote, and workflow work needs persistence, output streaming, polling, and notification semantics that do not fit inside a single tool call.

## Disk-Backed Output
`utils/task/diskOutput.ts` stores task output on disk instead of keeping it all in memory.

### Why it exists
- Prevents large shell/agent output from bloating app state.
- Supports transcript reconstruction and background task inspection.
- Allows polling and truncation without holding the full stream in RAM.

### Important details
- Output files live under a session-scoped task directory.
- `O_NOFOLLOW` is used on Unix to reduce symlink attack risk.
- Output is capped at a large global limit and truncates with an explicit message.
- A tracked promise set exists to avoid teardown race conditions in tests.

Inference: the disk output layer is part security boundary, part memory-management boundary, and part UX feature because it lets task views survive across refresh, resume, and polling cycles.

## Rendering Pipeline
Tool rendering is split between assistant-side tool-use messages and user-side tool-result messages.

### Assistant-side rendering
`components/messages/AssistantToolUseMessage.tsx`:

- resolves the tool by name
- parses the streamed input through the tool schema
- renders the tool-use line via `renderToolUseMessage()`
- renders progress via `renderToolUseProgressMessage()`
- renders queued state via `renderToolUseQueuedMessage()`
- hides transparent wrapper tools and lets their inner progress render instead

### User-side rendering
`components/messages/UserToolResultMessage/UserToolSuccessMessage.tsx`:

- validates stored tool results against `outputSchema` before rendering
- filters out hook-only progress messages
- calls `renderToolResultMessage()`
- optionally renders classifier approval badges and post-tool hook progress

### Search indexing
`extractSearchText()` is used to index transcript text for search. It must match the visible transcript output closely enough to avoid phantom hits or missing hits.

### Grouped rendering
`renderGroupedToolUse()` supports collapsing parallel tool calls into grouped UI blocks in non-verbose mode. In verbose mode, individual calls remain in place.

Inference: rendering is intentionally tool-owned. The framework provides orchestration, but each tool owns the user-facing phrasing and compact representation of its own input/output.

## Built-In Tool Catalog
The runtime ships a large set of built-in tools. The categories below are derived from `tools.ts` and the `tools/*` directory structure.

### Core agent and coordination
- `AgentTool`
- `TaskStopTool`
- `TaskOutputTool`
- `SendMessageTool`
- `BriefTool`
- `ToolSearchTool`
- `AskUserQuestionTool`
- `SyntheticOutputTool`
- `TestingPermissionTool` in test-only mode

### File and workspace operations
- `FileReadTool`
- `FileEditTool`
- `FileWriteTool`
- `NotebookEditTool`
- `GlobTool`
- `GrepTool`
- `EnterWorktreeTool`
- `ExitWorktreeTool`

### Shell and command execution
- `BashTool`
- `PowerShellTool` when enabled
- `REPLTool` in ant/native REPL mode
- `SleepTool` when proactive/kairos features are enabled
- `ConfigTool` and `TungstenTool` in ant builds

### Web and external information
- `WebFetchTool`
- `WebSearchTool`
- `RemoteTriggerTool`
- `SendUserFileTool` when Kairos is enabled
- `PushNotificationTool` when Kairos notification features are enabled
- `SubscribePRTool` when Kairos GitHub webhook features are enabled

### MCP and protocol tools
- `MCPTool`
- `ListMcpResourcesTool`
- `ReadMcpResourceTool`
- `McpAuthTool`
- `ListPeersTool` when UDS inbox is enabled

### Planning, tasks, and workflows
- `EnterPlanModeTool`
- `ExitPlanModeV2Tool`
- `TaskCreateTool`
- `TaskGetTool`
- `TaskUpdateTool`
- `TaskListTool`
- `WorkflowTool`
- `ScheduleCronTool` family: create, delete, list
- `VerifyPlanExecutionTool` when the plan verification flag is enabled

### Model, search, and LSP assistance
- `SkillTool`
- `LSPTool`
- `MonitorTool`
- `CtxInspectTool`
- `TerminalCaptureTool`
- `OverflowTestTool`
- `WebBrowserTool`
- `SnipTool`

### Notes on conditional availability
Several tools are gated by runtime state or feature flags:

- REPL tools are hidden from direct use when REPL wraps the runtime.
- Search tools are omitted when embedded search is already available.
- Coordinator-mode-only helpers are included only when coordinator mode is active.
- Task tools appear only when the todo-v2 path is enabled.
- LSP, worktree, workflow, monitor, and proactive tools are feature-gated.

Inference: this catalog is not static. The active set is a function of build flavor, feature flags, user type, and current permission context.

## Operational Patterns
A few implementation patterns repeat across the runtime:

### 1. Schema-first tools
Tools validate input with Zod or JSON schema before execution. This keeps tool prompts and runtime behavior aligned.

### 2. Fail-closed defaults
`buildTool()` provides conservative defaults for concurrency, read-only status, and destructive behavior.

### 3. Tool-owned UX
Each tool owns its prompt, progress, rejection, error, and result formatting rather than relying on a central template.

### 4. Runtime gating over compile-time assumptions
Feature flags and environment checks are used extensively so optional behavior can be included without breaking the base runtime.

### 5. Background-safe task model
Long-running work is represented as tasks with disk output, polling, notifications, and cleanup hooks.

### 6. Permission layering
Static rules, tool-specific checks, sandbox policy, and classifier-based decisions all contribute to the final allow/deny outcome.

### 7. Compatibility and aliasing
Tools can expose aliases, fall back to prior names, and support old result shapes through `outputSchema` validation.

### 8. Search/index fidelity
The runtime keeps transcript search text close to actual rendered output to avoid misleading search results.

## Practical Navigation
For deeper implementation detail, use these source entry points:

- `Tool.ts` for the tool interface and defaults.
- `tools.ts` for the tool registry and filtering rules.
- `Task.ts` and `tasks/types.ts` for task types and shared state.
- `utils/task/framework.ts` for task polling, notifications, and eviction.
- `utils/task/diskOutput.ts` for output persistence.
- `utils/permissions/permissions.ts` for allow/ask/deny logic.
- `services/tools/toolExecution.ts` for the execution and telemetry pipeline.
- `components/messages/AssistantToolUseMessage.tsx` for tool-use rendering.
- `components/messages/UserToolResultMessage/UserToolSuccessMessage.tsx` for result rendering.

## Known Gaps
- The exact package list is inferred from imports because there is no checked-in `package.json`.
- Some tool availability depends on build-time features that are not fully visible from source alone.
- A few runtime choices are inferred from orchestration and UI call sites rather than being defined in a single canonical file.
