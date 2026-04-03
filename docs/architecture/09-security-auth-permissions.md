# Security, Auth, and Permissions Architecture

## Scope

This document covers the security-relevant runtime surface of the CLI snapshot:

- authentication and token precedence
- secure storage and keychain handling
- the permission engine and permission modes
- sandbox policy and command gating
- policy limits and remotely managed settings
- hook/classifier checks
- trust boundaries and threat model notes

It is source-based. Where behavior is inferred from implementation patterns rather than a single explicit contract, it is marked as `Inference`.

## Security Posture

The repository does not expose a relational database in this snapshot. Security-sensitive state is stored in files, keychain-backed storage, and in-memory session state. The main security principle is layered trust:

- startup only applies safe environment changes before trust is established
- untrusted workspace content cannot automatically enable privileged behavior
- permission checks combine static rules, classifier checks, sandbox policy, and tool-specific guards
- optional subsystems fail open when policy/config fetching fails, but user-controlled execution paths are still gated

The result is a defense-in-depth CLI, not a single gate.

## Trust Boundaries

### Workspace trust

`utils/config.ts` treats trust as a directory-level property. `checkHasTrustDialogAccepted()` walks the current working directory and parent directories to see whether the user has already accepted the trust dialog for that tree. `bootstrap/state.ts` also supports session-only trust for home-directory workflows via `setSessionTrustAccepted()` / `getSessionTrustAccepted()`.

Important implication:

- trusted workspace state can be persisted for a project
- session-only trust is used where persistence is not appropriate
- some features, especially plugin and helper execution, refuse to run until trust is confirmed

### Settings trust

`utils/permissions/permissionsLoader.ts` distinguishes between editable sources and managed sources. `policySettings` can restrict what permission rules are allowed to persist. `shouldAllowManagedPermissionRulesOnly()` makes managed settings the only source of truth for permissions when that flag is enabled.

### Remote/session trust

Remote and transport-related tokens are handled separately from workspace auth:

- `CLAUDE_CODE_SESSION_ACCESS_TOKEN` is used for session ingress
- OAuth and API-key credentials are distinct from session ingress tokens
- file-descriptor and well-known-file fallbacks exist for subprocesses that cannot inherit the original FD

## Authentication Flows

### First-party and third-party auth selection

`utils/auth.ts` is the primary auth router. It chooses between:

- first-party Anthropic / Claude.ai auth
- direct API key auth
- `apiKeyHelper`
- file-descriptor injected credentials
- secure-storage backed credentials
- third-party provider paths such as Bedrock, Vertex, and Foundry

`isAnthropicAuthEnabled()` disables Anthropic auth in cases where the runtime should not use it:

- `--bare` mode is API-key-only
- 3P provider flows should not use Anthropic auth
- managed remote sessions should not be influenced by the user's terminal-only settings

`getAuthTokenSource()` and `getAnthropicApiKeyWithSource()` are the source-of-truth helpers for token origin. That origin matters because later code changes behavior based on whether the token came from env, keychain, a helper command, or managed auth.

### API key precedence

`getAnthropicApiKeyWithSource()` follows a strict precedence chain:

1. `ANTHROPIC_API_KEY` when allowed
2. file-descriptor injected API key
3. `apiKeyHelper`
4. config or macOS keychain fallback

`apiKeyHelper` is deliberately checked before falling through to keychain. That prevents an untrusted fallback from silently bypassing the user's configured helper.

### OAuth precedence

`getClaudeAIOAuthTokens()` resolves OAuth tokens in this order:

1. `CLAUDE_CODE_OAUTH_TOKEN`
2. OAuth token from file descriptor
3. secure storage

`getClaudeAIOAuthTokensAsync()` uses the same priority, but avoids blocking storage reads when possible.

### Managed OAuth contexts

`isManagedOAuthContext()` prevents terminal-only settings from changing auth behavior in managed remote contexts such as CCR or Claude Desktop. This is important because those flows are intentionally injected and should not inherit arbitrary local terminal auth settings.

### Token refresh and profile validation

`services/oauth/client.ts` handles OAuth refresh and token exchange. It refreshes tokens, preserves profile metadata when possible, and updates stored account info.

`validateForceLoginOrg()` in `utils/auth.ts` is the organization-boundary check. It fails closed if a required org UUID is configured and the token cannot be verified against the authoritative profile endpoint.

### Session ingress tokens

`utils/sessionIngressAuth.ts` resolves the session transport token used for remote/session ingress. Priority:

1. `CLAUDE_CODE_SESSION_ACCESS_TOKEN`
2. file-descriptor injected token
3. well-known fallback file

This token is separate from OAuth and API-key auth. It is used for session persistence and remote transport, not for user API calls.

## Secure Storage

### Storage abstraction

`utils/secureStorage/index.ts` picks the storage backend:

- on macOS: keychain primary, plaintext fallback
- elsewhere: plaintext storage

`createFallbackStorage()` merges a primary and fallback storage backend. If primary write succeeds for the first time, the fallback is deleted. If primary write fails but fallback succeeds, the stale primary entry is removed so it does not shadow fresh data.

### macOS keychain

`utils/secureStorage/macOsKeychainHelpers.ts` and `utils/secureStorage/keychainPrefetch.ts` are optimized for fast, low-overhead keychain reads during startup.

Key points:

- startup prefetch runs in parallel with module evaluation
- keychain reads are cached with a TTL
- prefetch and sync readers share the same cache state
- prefetch is intentionally minimal so it does not pull in expensive transitive dependencies

### Plaintext fallback

`utils/secureStorage/plainTextStorage.ts` stores credentials in `~/.claude/.credentials.json` with restrictive file permissions (`0600` on write). It is explicitly weaker than keychain-backed storage and returns a warning when used.

### What is stored

Secure storage is used for:

- Claude.ai OAuth tokens
- MCP OAuth tokens
- MCP OAuth client config
- some provider or connector secrets

`utils/auth.ts` stores OAuth tokens through `getSecureStorage().update(...)`, and `services/mcp/auth.ts` uses the same storage for MCP tokens and client secrets.

### File descriptor fallback

`utils/authFileDescriptor.ts` and `utils/sessionIngressAuth.ts` support file-descriptor based secret passing. This is important for subprocesses and remote environments where secrets should not be written into persistent config files.

The FD path can persist a token to a well-known file only in CCR contexts, so child processes that cannot inherit the FD can still authenticate. That fallback is intentionally gated to the remote environment.

`Inference`: this design is a compromise between security and process topology. It keeps secrets off the command line and avoids broad environment leakage while still allowing nested subprocesses to authenticate.

## Permission Engine

### Permission modes

`utils/permissions/PermissionMode.ts` defines the user-facing permission modes:

- `default`
- `plan`
- `acceptEdits`
- `bypassPermissions`
- `dontAsk`
- `auto` when transcript classifier mode is enabled

The mode is converted to an external permission mode where needed so SDK and UI surfaces stay aligned.

### Rule model

`utils/permissions/PermissionRule.ts` defines permission rules as:

- `source`
- `behavior` (`allow`, `deny`, `ask`)
- `ruleValue` containing `toolName` and optional `ruleContent`

`utils/permissions/permissionsLoader.ts` loads rules from settings sources and can enforce managed-only policy.

### Evaluation flow

`utils/permissions/permissions.ts` combines:

- allow rules
- deny rules
- ask rules
- classifier checks
- sandbox checks
- denial tracking
- tool-specific permission checks

The engine deliberately separates the general permission decision from tool-specific validation. Example: Bash and PowerShell need deeper command analysis than a simple allow/deny rule can provide.

### Denial tracking

`utils/permissions/denialTracking.ts` prevents repeated failed classifier decisions from looping forever. After enough denials, the system falls back to prompt-based approval.

### Dangerous permission patterns

`utils/permissions/permissionSetup.ts` blocks patterns that would neuter auto-mode safety:

- tool-level Bash allow is dangerous
- wildcard Bash patterns that match interpreters are dangerous
- PowerShell rules that allow nested shells, `Invoke-Expression`, process launchers, or `.NET` escape hatches are dangerous
- Agent allow rules are dangerous because they bypass the classifier's delegation checks

`utils/permissions/classifierDecision.ts` keeps a safe allowlist of tools that do not require classifier checking.

`utils/permissions/bashClassifier.ts` is a stub in external builds, which means Bash classifier permissions are disabled outside the internal feature set.

## Sandbox

### Sandbox runtime

`utils/sandbox/sandbox-adapter.ts` adapts `@anthropic-ai/sandbox-runtime` to Claude CLI settings. It translates:

- filesystem allow/deny rules
- network allow/deny rules
- managed-settings restrictions
- platform-specific exceptions

### Sandbox policy inputs

`entrypoints/sandboxTypes.ts` defines the public sandbox config schema:

- `enabled`
- `failIfUnavailable`
- `allowUnsandboxedCommands`
- `network.allowManagedDomainsOnly`
- `filesystem.allowManagedReadPathsOnly`
- `excludedCommands`
- `enableWeakerNetworkIsolation`

### Bash sandbox decision

`tools/BashTool/shouldUseSandbox.ts` decides whether a Bash command should be sandboxed. It refuses to sandbox only in narrow, explicit cases:

- sandboxing is disabled
- the caller explicitly allows unsandboxed execution and policy permits it
- there is no command
- the command is listed in user-configured excluded commands

`Inference`: excluded commands are a convenience feature, not a security boundary. The real security boundary is the permission and sandbox stack.

### File and network restrictions

`utils/sandbox/sandbox-adapter.ts` converts Claude settings to sandbox runtime config. It also enforces a defense-in-depth policy around dangerous paths:

- settings files are denied for writes
- `.claude/skills` is denied for writes
- managed settings directories are protected
- network domain allowlists can be scoped to managed settings only

This prevents a malicious workspace from rewriting its own policy or injecting new privileged scripts.

## Policy Limits and Remote Managed Settings

### Policy limits

`services/policyLimits/index.ts` loads organization policy restrictions from the API. Eligibility is narrow:

- first-party provider users only
- first-party base URL only
- API-key users when a real key is present
- Claude.ai users only if they are Team or Enterprise/C4E and have the right inference scope

The service:

- caches responses to `policy-limits.json`
- computes checksums for HTTP cache validation
- polls in the background
- fails open on fetch problems

`services/policyLimits/types.ts` makes the shape explicit: absent keys are allowed, present restrictions mark policies as allowed/blocked.

### Remote managed settings

`services/remoteManagedSettings/index.ts` follows the same pattern for settings:

- eligibility is gated
- checksum-based caching is used
- refresh is retried with backoff
- background polling is unref'ed
- failures are non-blocking

`services/remoteManagedSettings/securityCheck.tsx` adds an explicit user confirmation step when dangerous managed settings are introduced or changed. In interactive mode, the app renders a blocking dialog; if the user rejects, the process exits.

`Inference`: this is the boundary where remote policy becomes user-visible consent. It is a key control against org-managed settings silently changing local execution behavior.

## Hooks and Classifier Checks

### Hooks

`utils/hooks.ts` executes user-defined hooks at lifecycle points such as:

- session start/end
- pre/post compact
- prompt submission
- permission events
- tool use events

Hooks are only started after workspace trust is established. `utils/plugins/performStartupChecks.tsx` explicitly refuses to start plugin installs until trust is accepted.

### Classifier checks

`utils/permissions/yoloClassifier.ts` drives auto-mode classifier behavior. It caches prompts, dumps debugging artifacts when requested, and protects the model path used for auto-mode decisions.

`utils/permissions/classifierDecision.ts` defines a safe allowlist of tools that can skip classifier checks. That list is intentionally conservative: mostly read-only or metadata-only operations.

### Stop and post-sampling hooks

The query loop also executes stop hooks and post-sampling hooks. Security-wise, the important part is that these hooks are not allowed to create uncontrolled privilege escalation. They still pass through the same permission and tool-use constraints as the main turn.

## Threat Model Notes

### Malicious workspace content

The main threat is a repository that tries to trick the runtime into:

- executing unsafe helper commands before trust
- rewriting settings or hooks
- loading privileged plugins
- bypassing sandbox restrictions

Mitigations:

- trust dialog gating
- config-file write protection
- `.claude/skills` protection
- dangerous Bash/PowerShell pattern checks
- managed-settings-only modes

### Token exfiltration

Threats include:

- logging tokens to stdout/stderr
- leaking tokens through analytics
- passing secrets on the command line
- writing secrets into shared config without need

Mitigations:

- secure storage abstraction
- keychain-backed storage on macOS
- plaintext fallback with restrictive permissions only when necessary
- sensitive OAuth/OAuth-like params redacted from logs
- `_PROTO_*` analytics fields stripped from general-access sinks

### SSRF and network abuse

Threats include:

- arbitrary network fetches from tools or hooks
- using remote settings to allow unmanaged domains
- abusing sandbox exceptions to reach internal services

Mitigations:

- sandbox network allowlists
- managed-only domain restrictions
- policy-based feature gating
- explicit URL and auth validation in MCP/OAuth flows

### Config poisoning

Threats include:

- losing auth by writing over a corrupted config file
- trusting user-writable org metadata for validation
- letting project settings override policy controls

Mitigations:

- `saveGlobalConfig()` refuses to write if the fallback read would lose auth state
- org validation uses the authoritative profile endpoint
- policy settings can require managed-only permission rules

### File-descriptor and subprocess boundaries

Threats include:

- inherited env vars exposing secrets to child processes
- tokens disappearing across tmux/shell boundaries
- subprocesses reading stale or partially initialized caches

Mitigations:

- FD-based token passing
- well-known remote fallback files only in CCR contexts
- cache invalidation helpers for token refresh and logout paths

## Practical File Map

The most relevant source files are:

- `utils/auth.ts`
- `utils/authFileDescriptor.ts`
- `utils/sessionIngressAuth.ts`
- `utils/secureStorage/index.ts`
- `utils/secureStorage/keychainPrefetch.ts`
- `utils/secureStorage/macOsKeychainHelpers.ts`
- `utils/secureStorage/plainTextStorage.ts`
- `utils/permissions/permissions.ts`
- `utils/permissions/permissionSetup.ts`
- `utils/permissions/permissionsLoader.ts`
- `utils/permissions/denialTracking.ts`
- `utils/permissions/yoloClassifier.ts`
- `utils/permissions/classifierDecision.ts`
- `utils/sandbox/sandbox-adapter.ts`
- `tools/BashTool/shouldUseSandbox.ts`
- `entrypoints/sandboxTypes.ts`
- `services/policyLimits/index.ts`
- `services/remoteManagedSettings/index.ts`
- `services/remoteManagedSettings/securityCheck.tsx`
- `services/oauth/client.ts`
- `services/mcp/auth.ts`
- `utils/config.ts`
- `bootstrap/state.ts`
- `utils/plugins/performStartupChecks.tsx`

## Summary

The security model is layered and explicit:

- auth is source-ordered, not implicit
- secrets are stored through a platform-aware abstraction
- permissions are rule-based but can be hardened by classifier and sandbox policy
- managed settings and policy limits are remote, cached, and non-blocking, but they can still require user approval
- trust is a first-class boundary, especially for workspace-controlled behavior

`Inference`: the design is optimized for a local agent runtime that must operate across terminals, remote sessions, plugins, and enterprise-managed settings without treating any one of those environments as fully trusted by default.
