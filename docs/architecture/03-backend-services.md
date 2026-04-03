# Backend Services Architecture

## Scope
This document covers the non-UI runtime architecture for the CLI backend and service layer:

- `services/*`
- `server/*`
- `remote/*`
- `bridge/*`
- query orchestration (`query.ts`, `query/deps.ts`, `query/stopHooks.ts`, `query/tokenBudget.ts`)

It also includes the service-side dependencies that these modules rely on, especially API clients, analytics, settings synchronization, policy enforcement, compaction, and remote-control transport.

## Architecture Summary
The backend is organized as a layered orchestration system rather than a traditional request/response server.

- `query.ts` is the main agentic turn loop. It coordinates message normalization, model calls, tool execution, compaction, stop hooks, and telemetry.
- `services/api/*` is the model/API boundary. It builds Anthropic-compatible clients, normalizes requests and responses, applies retry/fallback logic, and logs API usage.
- `services/tools/*` executes tool calls with concurrency control and permission checks.
- `services/compact/*` manages token pressure and context reduction.
- `services/analytics/*` is a queued, sink-based telemetry layer that routes events to Datadog and first-party logging.
- `services/settingsSync/*`, `services/remoteManagedSettings/*`, and `services/policyLimits/*` are background policy/config loaders with file caching and fail-open behavior.
- `bridge/*`, `remote/*`, and `server/*` implement remote control, session transport, and direct-connect flows.

> Inference: the codebase behaves like a long-lived local agent runtime with multiple optional transport modes rather than a single-purpose CLI wrapper.

## Top-Level Service Map

### Core Execution
- `query.ts`: orchestrates a full assistant turn.
- `query/deps.ts`: injects a narrow set of testable runtime dependencies.
- `query/stopHooks.ts`: applies stop/failure hooks when turn state changes.
- `query/tokenBudget.ts`: tracks budget continuation and token thresholds.

### API Boundary
- `services/api/client.ts`: constructs Anthropic SDK clients for first-party, Bedrock, Foundry, and Vertex paths.
- `services/api/claude.ts`: translates internal messages and tools into API requests and handles streaming usage accounting.
- `services/api/logging.ts`: logs request, error, and success telemetry.
- `services/api/withRetry.ts`: central retry/fallback policy for capacity/auth/network errors.
- `services/api/errors.ts`, `services/api/errorUtils.ts`, `services/api/bootstrap.ts`, `services/api/promptCacheBreakDetection.ts`: supporting error, bootstrap, and cache-break helpers.

### Observability
- `services/analytics/index.ts`: queueing analytics facade.
- `services/analytics/sink.ts`: runtime sink initializer.
- `services/analytics/firstPartyEventLogger.ts`: OpenTelemetry-based 1P event logger.
- `services/analytics/firstPartyEventLoggingExporter.ts`: durable batch exporter and retry store.
- `services/analytics/growthbook.ts`: feature-flag and dynamic-config client.

### Configuration / Policy
- `services/settingsSync/index.ts`: user settings sync from first-party backend.
- `services/remoteManagedSettings/index.ts`: remote managed settings loader and poller.
- `services/policyLimits/index.ts`: organization-level policy restriction loader and cache.
- `services/claudeAiLimits.ts`: quota/limits helper used by API-facing code.
- `services/mockRateLimits.ts`, `services/rateLimitMocking.ts`: test/dev rate-limit simulation.

### Remote Control / Session Transport
- `bridge/initReplBridge.ts`: REPL-side bridge bootstrap and entitlement checks.
- `bridge/remoteBridgeCore.ts`: env-less remote-control bridge core.
- `bridge/bridgeMessaging.ts`: pure ingress/control routing helpers.
- `remote/RemoteSessionManager.ts`: remote session coordinator.
- `remote/SessionsWebSocket.ts`: session WebSocket transport.
- `server/directConnectManager.ts`, `server/createDirectConnectSession.ts`, `server/types.ts`: direct-connect session management.

### Tooling / Context Management
- `services/tools/toolOrchestration.ts`: batches and schedules tool execution.
- `services/tools/StreamingToolExecutor.ts`: streaming execution with ordered emission and cancellation.
- `services/compact/compact.ts`: compaction strategies and boundary management.
- `services/compact/autoCompact.ts`: token threshold logic and automatic compaction trigger.
- `services/compact/microCompact.ts`: tool-result and history microcompaction.

## Query Orchestration
`query.ts` is the central execution loop.

### Responsibilities
- Accepts a `QueryParams` bundle containing messages, prompts, tool permissions, source metadata, and optional dependency overrides.
- Normalizes the turn state and streams model output.
- Runs tool calls via `services/tools/toolOrchestration.ts` and `services/tools/StreamingToolExecutor.ts`.
- Applies compaction when token pressure or prompt limits require it.
- Executes stop hooks and post-sampling hooks.
- Records telemetry and state transitions.
- Emits lifecycle notifications for commands that were consumed in the turn.

### Design
- The loop is asynchronous and generator-based, which lets the caller consume streamed messages while the engine keeps internal state.
- The loop maintains explicit mutable state in a local `State` object rather than spreading state across globals.
- A test seam exists through `query/deps.ts`, which injects `callModel`, `microcompact`, `autocompact`, and `uuid`.

> Inference: this dependency-injection seam is intentionally narrow so most tests can override only the expensive or nondeterministic pieces without mocking the entire module graph.

### Key Invariants
- Assistant tool-use blocks must be preserved across the turn lifecycle.
- Max-output-token and prompt-too-long recovery paths must not leak intermediate failure states to SDK consumers too early.
- Tool results and command lifecycle notifications must stay in sync, even through fallback and compaction paths.

## API Client Boundary
`services/api/client.ts` is the client constructor and auth router.

### Responsibilities
- Builds an `Anthropic` client with CLI-specific headers and proxy options.
- Determines which provider path to use based on env/config:
  - direct Anthropic API
  - AWS Bedrock
  - Microsoft Foundry / Azure
  - Vertex AI
- Refreshes auth material before client construction.
- Adds session and container identifiers to request headers.
- Applies optional additional protection headers.

### Observed Auth Precedence
- OAuth refresh is checked first.
- If the user is not a Claude.ai subscriber, the code falls back to API-key headers or helper-derived keys.
- Provider-specific auth is loaded lazily so the base runtime does not pay every SDK cost up front.

### Best Practice
- The module logs client construction and auth decisions for debugging, but the logger is explicitly directed to stderr so it does not corrupt structured stdout flows.
- Provider SDKs are imported dynamically inside conditional branches to keep cold-start cost and dependency surface low.

### Related Client Helpers
- `services/api/bootstrap.ts` fetches first-party bootstrap metadata and caches it locally.
- `services/api/errors.ts` and `services/api/errorUtils.ts` convert provider errors into actionable CLI messages.
- `services/api/withRetry.ts` owns retry classification and backoff.

## Request Normalization and Streaming
`services/api/claude.ts` is the largest backend translation layer.

### Responsibilities
- Converts internal message objects into Anthropic API message parameters.
- Converts tool definitions into API schema.
- Calculates cache-control, beta headers, task budgets, and model-specific capability flags.
- Normalizes API responses back into internal message/event shapes.
- Tracks usage and cumulative cost.
- Handles streaming cleanup, fallback, and prompt-cache-break detection.

### Notable Patterns
- Response and request shaping is centralized here rather than duplicated in query callers.
- Model capability checks are factored out into dedicated utilities, which keeps provider-specific logic from leaking throughout the codebase.
- The module contains explicit support for beta and feature-gated behavior, so request construction can evolve without rewriting the orchestration layer.

### Inference
This file is the effective “protocol adapter” for the entire assistant runtime: query orchestration talks to it, but it speaks in API-native terms internally so the rest of the system can stay model-agnostic.

## Retry, Fallback, and Error Policy
`services/api/withRetry.ts` centralizes resilience.

### Responsibilities
- Retries transient capacity and connection failures.
- Applies different retry behavior depending on `QuerySource`.
- Differentiates foreground user-facing turns from background or non-blocking jobs.
- Refreshes auth on 401 / revoked-token scenarios.
- Triggers fallback model switching when appropriate.
- Handles special modes like persistent unattended retries.

### Design Decisions
- The retry set is intentionally conservative: only sources where the user is actively waiting retry aggressively.
- Retry policy is type-driven and source-aware rather than status-code-only.
- Stale keep-alive handling can disable connection pooling on repeated socket errors.

### Best Practice
- Retry logic is centralized instead of reimplemented in each API caller.
- Error classification is explicit and user-visible failures are surfaced with structured messaging instead of raw SDK exceptions.

## Logging and Telemetry
### `services/api/logging.ts`
This module records request lifecycle telemetry:
- API query metadata
- errors and retry context
- success timings and usage
- gateway/provider identification

It also tags logs with build age and environment metadata when applicable.

### `services/analytics/index.ts`
This is the public analytics API.

- It has no dependencies to avoid import cycles.
- Events are queued until a sink attaches.
- Metadata is intentionally typed to discourage accidental logging of code or file paths.

### `services/analytics/sink.ts`
This routes analytics to Datadog and the first-party event logger.

- Sampling is applied before fanout.
- `_PROTO_*` fields are stripped before Datadog because it is a general-access sink.
- The 1P exporter receives the richer payload.

### `services/analytics/firstPartyEventLogger.ts`
This owns the 1P logging provider and event enrichment.

- Uses OpenTelemetry logging primitives.
- Enriches events with user/core metadata at emit time.
- Supports batching and periodic refresh of dynamic config.

### `services/analytics/firstPartyEventLoggingExporter.ts`
This is the durable exporter for 1P event logs.

- Writes failed payloads to disk.
- Retries previous batches on startup.
- Uses batch export with backoff and chunking.
- Can retry without auth when configured.

### Best Practice
- Telemetry is split into a no-dependency facade, a sink, and sink-specific exporters. That keeps startup order manageable and avoids import cycles.
- Sensitive metadata is structurally separated from general telemetry sinks.

## Feature Flags and Dynamic Config
`services/analytics/growthbook.ts` is the dynamic configuration spine.

### Responsibilities
- Reads feature gates and dynamic config values.
- Caches values with stale-while-refresh behavior.
- Refreshes after auth changes and on a timer.
- Exposes blocking and non-blocking read variants.

### Usage Patterns
- Nearly every backend subsystem consults GrowthBook for rollout or config decisions.
- The code distinguishes between:
  - cached reads that may be stale
  - blocking reads that wait for initialization

### Best Practice
- Feature-gated code paths often wrap `require()` or dynamic imports so the gated string or module can be tree-shaken out of builds that should not include it.

## Settings Sync, Remote Managed Settings, and Policy Limits
These three subsystems are related but distinct.

### 1. User Settings Sync
`services/settingsSync/index.ts` synchronizes user settings and memory files between local and first-party storage.

- Uploads local changes only when eligible.
- Downloads remote settings for CCR-style startup flows.
- Uses incremental diffing so unchanged entries are not re-uploaded.
- Caches the initial download promise so startup and plugin-install paths share work.

`services/settingsSync/types.ts` defines the wire format and sync keys.

### 2. Remote Managed Settings
`services/remoteManagedSettings/index.ts` loads enterprise-managed settings.

- Uses file caching and ETag/checksum validation.
- Fails open if the API is unavailable.
- Applies settings validation before persistence.
- Starts background polling so settings can change mid-session.
- Triggers settings change notifications after successful reloads.

The cache state is split between:
- `services/remoteManagedSettings/syncCacheState.ts` for leaf cache data
- `services/remoteManagedSettings/syncCache.ts` for eligibility/auth checks

This split exists to avoid circular dependencies through auth/settings initialization.

### 3. Policy Limits
`services/policyLimits/index.ts` loads organization policy restrictions.

- Similar caching and polling model as remote managed settings.
- Uses a stable `policy-limits.json` file in the Claude config directory.
- Fails open by default.
- Can fail closed for a small set of policies when essential-traffic-only mode is active.

`services/policyLimits/types.ts` defines the response schema.

### Shared Design Patterns
- Every settings/policy subsystem uses Zod validation at the boundary.
- All three have eligibility checks to avoid unnecessary network calls.
- All three store local cache state and resolve a startup promise for dependent systems.
- All three prefer fail-open behavior when network/auth problems occur.

### Inference
These modules form a layered “policy/config substrate” below the main query engine. They affect runtime behavior indirectly through global settings reads rather than being passed through every callsite.

## Background Polling and Change Propagation
Several services poll for updated server-side state:

- `services/policyLimits/index.ts`
- `services/remoteManagedSettings/index.ts`
- `services/settingsSync/index.ts`
- `services/analytics/growthbook.ts`

Common behaviors:
- Polling runs on an interval and is unref’ed so it does not keep the process alive.
- Successful auth changes trigger refresh paths.
- File caches are used to bridge startup and offline windows.
- Change detection is explicit so subsystems can hot-reload or re-read configuration.

## Compaction and Context Management
### `services/compact/autoCompact.ts`
- Computes context thresholds and compaction triggers.
- Honors env and config toggles.
- Avoids recursion into special query sources that would deadlock or conflict.

### `services/compact/compact.ts`
- Implements compaction strategies.
- Creates compact boundaries and post-compact message sets.
- Trims or rehydrates attachments that should not be permanently lost.
- Runs hooks around compaction phases.

### `services/compact/microCompact.ts`
- Estimates token usage from messages.
- Tracks pinning and pending cache edits.
- Clears compactable tool result content based on time-based thresholds.

### `services/compact/grouping.ts`
- Groups messages by API round for compaction decisions.

### Best Practice
- Compaction is split into policy, summarization, and low-level token-estimation helpers so each layer can change independently.
- Circular dependencies are explicitly avoided by inlining tiny shared constants when required.

## Tool Execution and Orchestration
### `services/tools/toolOrchestration.ts`
This module groups tool calls into concurrency-safe and serial batches.

- Read-only tools can run concurrently.
- Non-concurrent tools serialize access.
- Context modifications are accumulated and applied after execution.

### `services/tools/StreamingToolExecutor.ts`
This executor handles streaming tool execution.

- Buffers results so they can be emitted in order.
- Emits progress immediately.
- Cancels sibling work if one tool errors and the execution policy requires it.
- Generates synthetic tool-result messages for interruptions and fallback discard paths.

### Extension Point
Tool definitions expose concurrency, interrupt behavior, schemas, and context mutation hooks. The orchestration layer consumes those capabilities rather than hard-coding per-tool behavior.

## Remote Control and Session Transport
### `bridge/initReplBridge.ts`
This is the REPL bootstrap for Remote Control.

- Checks entitlement and version gates.
- Requires OAuth access.
- Waits on policy limits.
- Derives the session title and configures bridge mode.
- Chooses between the env-based and env-less bridge implementations.

### `bridge/remoteBridgeCore.ts`
This is the env-less bridge core.

- Creates a code session.
- Fetches worker credentials.
- Builds the v2 transport.
- Rebuilds transport on auth refresh or SSE 401 recovery.
- Deduplicates echo messages and tracks sequence-state transitions.

### `bridge/bridgeMessaging.ts`
A pure helper module that normalizes ingress messages and handles server control requests.

- Extracts title-worthy messages.
- Routes `control_request` and `control_response` payloads.
- Filters transport echoes using bounded UUID sets.
- Produces error responses for unsupported control subtypes.

### `remote/RemoteSessionManager.ts`
Coordinates a remote CCR session.

- Subscribes to session WebSocket events.
- Sends user messages through a separate transport path.
- Tracks pending permission requests.
- Handles cancellation and control-response plumbing.

### `remote/SessionsWebSocket.ts`
Provides the low-level session WebSocket client.

### `server/directConnectManager.ts`
Provides a direct WebSocket client for direct-connect sessions.

### `server/createDirectConnectSession.ts`
Creates the direct-connect session handshake and validates the response.

### `server/types.ts`
Defines the wire models for server session state, connect responses, and the persisted session index.

### Best Practice
- Transport adapters are separated from control/message routing so the same parsing logic can work with multiple transport implementations.
- Permission flows are first-class and explicit. Unsupported request subtypes get immediate error responses rather than hanging the remote endpoint.
- The system uses compatibility shims for session IDs and outbound-only operation where needed.

## State Management
The backend uses a mix of module-level caches and explicit runtime state objects.

### Module-Level State
- Analytics sinks and queues in `services/analytics/*`
- Background polling state in policy/settings services
- Feature-flag cache in `services/analytics/growthbook.ts`
- Session caches in `services/remoteManagedSettings/*` and `services/policyLimits/*`
- Pending permission requests in `remote/RemoteSessionManager.ts`

### Explicit Turn State
- `query.ts` keeps turn-local mutable state in a dedicated `State` object.
- `query/deps.ts` lets the state machine receive injected collaborators for tests.

### Cleanup
- Several background services register cleanup callbacks to stop polling or flush telemetry.
- This is important because the runtime is long-lived and can enter many modes in one process.

## External Package Inventory
The following packages were observed in backend/service imports. Counts are approximate import counts from the current code surface, not runtime usage counts.

### Core Runtime and SDK
- `@anthropic-ai/sdk`
- `@anthropic-ai/bedrock-sdk`
- `@anthropic-ai/foundry-sdk`
- `@anthropic-ai/vertex-sdk`
- `@modelcontextprotocol/sdk`
- `google-auth-library`
- `ws`
- `axios`
- `zod` and `zod/v4`
- `react`
- `react/compiler-runtime`

### Observability and Telemetry
- `@opentelemetry/api`
- `@opentelemetry/api-logs`
- `@opentelemetry/core`
- `@opentelemetry/resources`
- `@opentelemetry/sdk-logs`
- `@opentelemetry/semantic-conventions`
- `@growthbook/growthbook`

### Utility and Formatting
- `lodash-es`
- `strip-ansi`
- `chalk`
- `figures`
- `diff`
- `xss`
- `p-map`
- `lru-cache`
- `qrcode`

### Node/Bun Built-ins Seen Frequently
- `crypto`
- `fs` / `fs/promises`
- `path`
- `url`
- `http`
- `os`
- `child_process`
- `readline`
- `net`
- `inspector`

> Inference: because there is no `package.json` in the workspace, this inventory should be treated as source-derived documentation, not a lockfile replacement.

## Extension Points
The cleanest backend extension points are:

- New model/provider behavior: `services/api/client.ts` and `services/api/claude.ts`
- New retry policy: `services/api/withRetry.ts`
- New telemetry sink/export behavior: `services/analytics/*`
- New policy/config source: `services/settingsSync/*`, `services/remoteManagedSettings/*`, `services/policyLimits/*`
- New tool execution semantics: `services/tools/*` and `Tool.ts`
- New transport mode: `bridge/*`, `remote/*`, or `server/*`
- New context-reduction strategy: `services/compact/*`

## Notable Best Practices Observed
- Boundary validation with `zod` before mutating local state.
- Fail-open behavior for external configuration/policy fetches.
- Dynamic imports for optional provider SDKs and gated subsystems.
- Explicit separation of pure helpers from stateful orchestrators.
- Narrow, testable dependency injection for the query loop.
- Background polling with unref’ed timers and cleanup registration.
- Dedicated compatibility shims for session IDs, transport messages, and control messages.
- Telemetry queueing before sink attachment to avoid startup latency.
- Sensitive telemetry fields are isolated from general-access sinks.

## Practical Reading Order
If you are trying to understand or modify the backend, read the files in this order:

1. `query.ts`
2. `services/api/client.ts`
3. `services/api/claude.ts`
4. `services/api/withRetry.ts`
5. `services/tools/toolOrchestration.ts`
6. `services/tools/StreamingToolExecutor.ts`
7. `services/compact/autoCompact.ts`
8. `services/compact/compact.ts`
9. `services/analytics/index.ts`
10. `services/analytics/sink.ts`
11. `services/settingsSync/index.ts`
12. `services/remoteManagedSettings/index.ts`
13. `services/policyLimits/index.ts`
14. `bridge/initReplBridge.ts`
15. `bridge/remoteBridgeCore.ts`
16. `remote/RemoteSessionManager.ts`
17. `server/directConnectManager.ts`

## Summary
The backend is a policy-aware agent runtime with three main pillars:

- A turn engine (`query.ts`) that owns orchestration.
- A set of service modules that isolate external APIs, telemetry, and config state.
- A transport layer (`bridge/`, `remote/`, `server/`) that adapts the same internal message model to different remote-control surfaces.

The dominant design pattern is deliberate separation of concerns with a strong preference for pure helpers, cached state holders, and fail-open external integrations.
