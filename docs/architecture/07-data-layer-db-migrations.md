# Data Layer, Persistence, and Migrations

## Scope
This document covers the repository's persistent data layer as implemented in source:

- transcript/session storage
- shell history storage
- settings and config files
- memory directories and content-addressed caches
- sidecar metadata files for agents and remote tasks
- migration routines that reshape persisted configuration
- schema/validation boundaries for stored data

This snapshot does not show a relational database layer. The persistence model is file-backed and centered on JSON, JSONL, and a small number of sidecar files. That is a source-based conclusion from the inspected modules, not a guess.

## Short Answer: Is There a SQL Database?
No SQL/relational database is visible in this repository snapshot.

What exists instead:

- `~/.claude.json` for global config
- per-project config embedded inside the global config under `projects[...]`
- `.claude/settings.json` and related source-specific settings files
- `*.jsonl` transcript files under `~/.claude/projects/...`
- `history.jsonl` for command/history recall
- `managed-settings.json` and `managed-settings.d/*.json` for policy settings
- `paste-cache/*.txt` for content-addressed pasted text
- assorted sidecar `.meta.json` files for agent/remote-task metadata

The code uses atomic-ish file write patterns, locks, caches, and validation schemas rather than a database engine.

## Persistence Map

| Concern | Primary files | Format | Notes |
| --- | --- | --- | --- |
| Global config | `~/.claude.json` | JSON | Owns onboarding, auth, update policy, telemetry toggles, project registry, and migration guards. |
| Project config | `~/.claude.json` under `projects[...]` | JSON | Keyed by normalized project root. Stores per-project trust and MCP approval state. |
| User/project/local/flag/policy settings | `.claude/settings.json`, `.claude/settings.local.json`, `managed-settings.json`, `managed-settings.d/*.json`, flag settings | JSON | Loaded as a precedence cascade and validated with Zod. |
| Session transcript | `~/.claude/projects/<repo>/<sessionId>.jsonl` | JSONL | Append-only conversation log and metadata stream. |
| Agent transcript | `.../subagents/.../agent-<agentId>.jsonl` | JSONL | Separate transcript stream for subagents/workflows. |
| Remote-agent metadata | `.../remote-agents/remote-agent-<taskId>.meta.json` | JSON | Sidecar identity/status info for remote tasks. |
| History | `~/.claude/history.jsonl` | JSONL | Shared shell/history recall, deduped per project for UI search. |
| Pasted text cache | `~/.claude/paste-cache/<hash>.txt` | Plain text | Content-addressed by a short SHA-256 prefix. |
| Auto-memory | `~/.claude/projects/<git-root>/memory/` | Markdown files | MEMORY.md entrypoint plus topic files; auto-generated prompt guidance. |

## Global Config

### File Location
The global config lives at the path returned by `getGlobalClaudeFile()` and is treated as the canonical user-level config file.

Relevant code:

- [`utils/config.ts`](/Users/mirzaasceric/Desktop/claude-code-local/utils/config.ts)
- [`utils/env.ts`](/Users/mirzaasceric/Desktop/claude-code-local/utils/env.ts)

### What It Stores
`GlobalConfig` holds user-wide state such as:

- onboarding and startup counters
- auth/account data
- theme and notification settings
- update policy
- terminal setup state
- session-wide feature flags and defaults
- the `projects` map for per-project config

### Write Path
`saveGlobalConfig()` writes through `saveConfigWithLock()` and then updates the in-memory cache only after a successful write.

Notable safeguards:

- refuses to overwrite cached auth/onboarding state with an empty or corrupted reread
- strips historical project data before writing to reduce stale growth
- logs and falls back if lock-based writes fail
- keeps an internal write counter for diagnostics

This is a defensive file-write strategy, not a transaction log.

### Retention
There is no database retention policy here. Retention is controlled by file lifecycle and config flags, especially:

- `cleanupPeriodDays`
- `CLAUDE_CODE_SKIP_PROMPT_HISTORY`
- `isSessionPersistenceDisabled()`

If session persistence is disabled, transcript writes are suppressed and cleanup can remove existing session files.

## Project Config

### File Model
Per-project config is stored inside the `projects` map in `~/.claude.json`. The key is the canonicalized project root, normalized so different path spellings map to the same entry.

Relevant code:

- [`utils/config.ts`](/Users/mirzaasceric/Desktop/claude-code-local/utils/config.ts)

### What It Stores
Project config keeps project-scoped state such as:

- trust acceptance
- onboarding state
- MCP approval state
- active worktree session metadata
- local plugin or marketplace settings
- project-specific tool allowance and session statistics

This storage is project-local but physically embedded in the global config file.

### Write Strategy
`saveCurrentProjectConfig()` updates only the current project entry, then writes the whole global config back with locking and cache refresh.

That means project config is not independently persisted in its own file in this snapshot.

## Settings Cascade

### Source Order
The settings system uses a fixed precedence chain:

1. `userSettings`
2. `projectSettings`
3. `localSettings`
4. `flagSettings`
5. `policySettings`

Relevant code:

- [`utils/settings/constants.ts`](/Users/mirzaasceric/Desktop/claude-code-local/utils/settings/constants.ts)
- [`utils/settings/settings.ts`](/Users/mirzaasceric/Desktop/claude-code-local/utils/settings/settings.ts)

### File Locations
The source locations are resolved by source type:

- `userSettings` resolves to the home config directory and uses `settings.json` or `cowork_settings.json`
- `projectSettings` resolves to the project root and uses `.claude/settings.json`
- `localSettings` resolves to the project root and uses a gitignored local settings file
- `flagSettings` resolves to a CLI-provided file path
- `policySettings` resolves to managed settings on disk or remote policy settings

### Validation Boundary
Settings files are parsed through `SettingsSchema()` and invalid entries are preserved on disk when possible rather than hard-failing the whole file.

Important behavior:

- `parseSettingsFile()` caches parsed content and validation errors
- malformed settings are reported, but the loader tries to keep valid data usable
- a partially broken settings file does not necessarily block startup
- schema updates are expected to remain backward compatible

### Managed Settings Layout
Managed settings are file-based and support drop-ins:

- base file: `managed-settings.json`
- drop-ins: `managed-settings.d/*.json`

The base file is merged first, then drop-ins are merged in lexicographic order so later fragments override earlier ones.

That makes the settings layer behave more like config composition than a database table.

### Security Notes
The schema and loader intentionally preserve some unknown fields, but certain settings are restricted for safety:

- `projectSettings` cannot set dangerous auto-memory roots
- some policy-only settings are only loaded from managed sources
- invalid hook or permission rule definitions are filtered rather than blindly trusted

## Transcript Storage

### Primary File
Main session transcripts are stored as JSONL files under:

`~/.claude/projects/<sanitized-project-root>/<sessionId>.jsonl`

Relevant code:

- [`utils/sessionStorage.ts`](/Users/mirzaasceric/Desktop/claude-code-local/utils/sessionStorage.ts)

### Why JSONL
The transcript model is append-oriented:

- each event is a JSON line
- resume/load can scan from the tail
- large files can be partially read
- compaction and metadata re-append can keep tail-visible state near EOF

This is a deliberate non-relational design optimized for long-lived interactive sessions.

### Materialization
The transcript file is not always created immediately.

Behavior:

- the current session buffers entries until the first meaningful user/assistant message
- `materializeSessionFile()` writes cached metadata and flushes buffered entries
- metadata-only files are avoided

### Chain Integrity
Transcript entries form a parent/child chain using UUIDs.

Important invariants:

- progress messages are not transcript messages
- only user, assistant, attachment, and system messages participate in transcript history
- old transcripts with legacy progress entries are bridged on load
- sidechain and main-thread UUID handling is intentionally different to avoid resume breakage

### Session Metadata at EOF
The session writer re-appends metadata to keep tail-read state visible for `--resume` and similar flows.

Entries that may be re-appended include:

- `last-prompt`
- `custom-title`
- `tag`
- `agent-name`
- `agent-color`
- `agent-setting`
- `mode`
- `worktree-state`
- `pr-link`

This is a tail-visibility optimization, not a normalized schema.

### Sidechains and Subagents
Subagent transcripts are stored separately so resume can reconstruct them independently.

Paths include:

- `.../subagents/agent-<agentId>.jsonl`
- sidecar metadata: `.../subagents/agent-<agentId>.meta.json`
- remote-agent metadata: `.../remote-agents/remote-agent-<taskId>.meta.json`

This separation prevents large side jobs from polluting the main transcript and makes resume/fork behavior more reliable.

### Remote Persistence
`sessionStorage.ts` also supports a CCR v2 internal-event path:

- transcript entries may be written as internal worker events
- transcript resume can reconstruct from those internal events
- this is still file-backed/local-state oriented, not a database

## Transcript Loading and Resume

### Resume Sources
The resume pipeline reads:

- current session transcript files
- older sessions from `~/.claude/projects`
- agent sidecars and metadata
- file history snapshots and attribution snapshots embedded in transcripts

### Loading Strategy
The loader favors:

- tail reads for metadata
- partial reads for large transcripts
- chain reconstruction over full-file normalization
- graceful degradation when entries are malformed or missing

### Integrity Checks
Several integrity rules prevent resume corruption:

- UUID cycles are detected
- orphaned progress entries are bridged or skipped
- malformed lines are ignored rather than crashing the whole session
- session/project directory mismatches are handled explicitly
- current-session project directory is honored when it differs from the original cwd

### Retention
Session retention is governed by configuration, not a schema-level TTL:

- `cleanupPeriodDays === 0` disables session persistence
- `cleanup` routines can delete old transcripts and related cache artifacts
- resume browsing only surfaces retained sessions

## History Storage

### File Location
History is stored in:

`~/.claude/history.jsonl`

Relevant code:

- [`history.ts`](/Users/mirzaasceric/Desktop/claude-code-local/history.ts)

### Data Shape
Each history entry stores:

- display text
- pasted content references
- timestamp
- project root
- session ID

### Pasted Content
Pasted text can be stored inline or by hash reference.

Inline content is used for small pastes. Larger content is stored in the paste cache and referenced by hash.

### UI Behavior
History is read back in project-aware order:

- current session first
- then other sessions
- deduped by visible display text for picker use
- capped to a fixed number of recent items

### Corruption Tolerance
Malformed history lines are skipped. Missing history files are treated as empty, not fatal.

## Paste Cache

### File Location
Paste cache files live under:

`~/.claude/paste-cache/<hash>.txt`

Relevant code:

- [`utils/pasteStore.ts`](/Users/mirzaasceric/Desktop/claude-code-local/utils/pasteStore.ts)

### Model
This is a tiny content-addressed store:

- SHA-256 hash prefix becomes the filename
- same content maps to the same hash
- cleanup deletes old files by mtime

### Use Case
It supports history entries and pasted input references without inflating the main history log.

## Auto-Memory

### Directory Layout
Auto-memory is stored under:

`~/.claude/projects/<sanitized-git-root>/memory/`

It may also be overridden by:

- `CLAUDE_COWORK_MEMORY_PATH_OVERRIDE`
- trusted settings sources only

Relevant code:

- [`memdir/paths.ts`](/Users/mirzaasceric/Desktop/claude-code-local/memdir/paths.ts)
- [`memdir/memdir.ts`](/Users/mirzaasceric/Desktop/claude-code-local/memdir/memdir.ts)
- [`memdir/memoryScan.ts`](/Users/mirzaasceric/Desktop/claude-code-local/memdir/memoryScan.ts)
- [`memdir/findRelevantMemories.ts`](/Users/mirzaasceric/Desktop/claude-code-local/memdir/findRelevantMemories.ts)

### Entry Point
`MEMORY.md` is the memory entrypoint. It is intentionally capped:

- 200 lines max
- 25 KB max

The runtime truncates content and appends a warning if the entrypoint grows too large.

### Memory Prompting
The memory system is prompt-driven rather than database-driven:

- the runtime builds memory guidance text
- it ensures the directory exists
- it scans topic files and frontmatter
- it uses an LLM-assisted selector to choose relevant memories

### Retention and Taxonomy
Memory files are organized semantically, not chronologically.

Types are constrained to:

- `user`
- `feedback`
- `project`
- `reference`

The schema explicitly says not to store code patterns, architecture, or git history there because those should be derived from source, not remembered as separate facts.

## Managed Settings and Policy Storage

### File Location
Managed settings are stored at platform-specific locations:

- macOS: `/Library/Application Support/ClaudeCode`
- Windows: `C:\\Program Files\\ClaudeCode`
- Linux/other: `/etc/claude-code`

Relevant code:

- [`utils/settings/managedPath.ts`](/Users/mirzaasceric/Desktop/claude-code-local/utils/settings/managedPath.ts)
- [`utils/settings/settings.ts`](/Users/mirzaasceric/Desktop/claude-code-local/utils/settings/settings.ts)

### File Model
Managed settings are loaded from:

- `managed-settings.json`
- `managed-settings.d/*.json`

### Merge Strategy
The merge order is base file first, then lexicographically sorted drop-ins.

This is the closest thing in the repo to a policy config database, but it is still just a layered file cascade.

## Schemas and Validation

### Settings Schema
`SettingsSchema()` in `utils/settings/types.ts` is the primary schema for persisted settings.

It validates:

- auth helpers
- env overrides
- model selection
- MCP approval state
- hooks
- worktree settings
- sandbox settings
- plugin and marketplace settings
- memory-related settings

### Hook Schemas
`schemas/hooks.ts` contains extracted Zod schemas for persisted hook config:

- shell command hooks
- prompt hooks
- HTTP hooks
- agent hooks

The extraction exists to break import cycles, not to create a separate persistence layer.

### Validation Philosophy
The schema layer prefers:

- backward compatibility
- optional additions over breaking changes
- permissive parsing where safe
- leaving invalid data in place when possible so the user can fix it

That is an important persistence decision: the system tries hard not to destroy user config just because one field is malformed.

## Migrations

### What the Migrations Do
The files in `migrations/` are not SQL migrations. They are one-off config/data migrations that rewrite persisted settings or config keys in place.

Representative examples:

- `migrateAutoUpdatesToSettings.ts`
- `migrateBypassPermissionsAcceptedToSettings.ts`
- `migrateEnableAllProjectMcpServersToSettings.ts`
- `migrateLegacyOpusToCurrent.ts`
- `migrateOpusToOpus1m.ts`
- `migrateSonnet1mToSonnet45.ts`
- `migrateSonnet45ToSonnet46.ts`
- `migrateReplBridgeEnabledToRemoteControlAtStartup.ts`
- `resetAutoModeOptInForDefaultOffer.ts`
- `resetProToOpusDefault.ts`

### Migration Targets
These migrations primarily touch:

- `~/.claude.json`
- settings files through `updateSettingsForSource()`
- current project config through `saveCurrentProjectConfig()`
- in-memory model overrides and startup state

### Common Migration Pattern
Most migrations follow the same shape:

1. Read current config or settings
2. Check an idempotency guard
3. Apply the rewrite only if the old value is present
4. Preserve user intent
5. Emit telemetry
6. Remove the obsolete field or mark the migration complete

### Guard Style
Some migrations rely on explicit completion flags in global config.
Others are idempotent because they rewrite a single old value to a new value and only run when the old value still exists.

That means migrations are intentionally simple and local, not transactional.

### Safety Rules
The migrations avoid:

- rewriting project-scoped values into global defaults
- migrating settings that would violate provider/subscriber boundaries
- running in unsupported provider modes
- clobbering newer values with stale cached ones

### Important Examples

- `migrateAutoUpdatesToSettings.ts` moves an old global preference into `userSettings.env.DISABLE_AUTOUPDATER`.
- `migrateEnableAllProjectMcpServersToSettings.ts` moves project MCP approval state into settings sources.
- `migrateReplBridgeEnabledToRemoteControlAtStartup.ts` renames an old config key.
- the Sonnet/Opus migrations rewrite model aliases when the provider/subscription profile changes.

### Migration Philosophy
The repo treats migrations as user-experience repair, not schema management:

- preserve intent
- keep changes idempotent
- fail softly
- do not block startup on non-critical rewrites

## Lifecycle

### Startup
At startup the system:

1. loads global config
2. resolves enabled settings sources
3. parses and validates settings files
4. loads managed settings and policy files
5. initializes caches
6. decides whether session persistence is enabled
7. prepares transcript and history paths

### Runtime
During a session the system:

1. buffers transcript entries until the first meaningful user/assistant message
2. appends JSONL records as the turn progresses
3. maintains tail-visible metadata
4. stores sidecar files for subagents and remote tasks
5. writes paste-cache entries when needed
6. updates config and project config through locked writes

### Resume
On resume the system:

1. reads transcript tails first
2. reconstructs message chains
3. tolerates malformed entries
4. rehydrates metadata and sidecar state
5. filters sessions by project and sidechain rules

### Cleanup
Cleanup is file-based:

- old session files can be removed by session retention logic
- old paste-cache entries can be removed by mtime
- config write stats are emitted at shutdown
- hook/setting caches are cleared when relevant files change

There is no schema migration engine in the DB sense.

## Integrity and Failure Handling

### What the Code Defends Against
The data layer explicitly guards against:

- truncated or corrupted config files
- partial transcript writes
- session file races between processes
- dangling resume chains
- old transcript formats
- invalid settings values
- malformed JSONL lines
- path traversal in memory and settings paths

### How It Fails
The failure model is usually:

- log and continue
- fall back to defaults
- skip malformed lines
- refuse risky writes when auth state could be lost
- preserve old data unless a safe migration can rewrite it

### What It Does Not Do
It does not attempt:

- ACID database transactions
- relational joins
- normalized schema migrations
- cross-file referential integrity guarantees

The design is pragmatic and local-file oriented.

## Practical Reading Order
If you are tracing the data layer, read these files in this order:

1. [`utils/config.ts`](/Users/mirzaasceric/Desktop/claude-code-local/utils/config.ts)
2. [`utils/settings/settings.ts`](/Users/mirzaasceric/Desktop/claude-code-local/utils/settings/settings.ts)
3. [`utils/settings/types.ts`](/Users/mirzaasceric/Desktop/claude-code-local/utils/settings/types.ts)
4. [`utils/sessionStorage.ts`](/Users/mirzaasceric/Desktop/claude-code-local/utils/sessionStorage.ts)
5. [`history.ts`](/Users/mirzaasceric/Desktop/claude-code-local/history.ts)
6. [`utils/pasteStore.ts`](/Users/mirzaasceric/Desktop/claude-code-local/utils/pasteStore.ts)
7. [`memdir/paths.ts`](/Users/mirzaasceric/Desktop/claude-code-local/memdir/paths.ts)
8. [`memdir/memdir.ts`](/Users/mirzaasceric/Desktop/claude-code-local/memdir/memdir.ts)
9. [`migrations/`](/Users/mirzaasceric/Desktop/claude-code-local/migrations)
10. [`schemas/hooks.ts`](/Users/mirzaasceric/Desktop/claude-code-local/schemas/hooks.ts)

## Summary
The persistence layer is file-based, layered, and defensive.

The repository snapshot uses JSON, JSONL, markdown, and sidecar metadata files to model state. There is no relational database in this tree. Data integrity is maintained through:

- schema validation
- locked file writes
- append-only transcripts
- tail-preserving metadata re-append
- idempotent migrations
- cache invalidation on writes
- graceful fallback when files are missing or malformed

If you need a database mental model, think “structured config and event log files with guardrails,” not “tables and migrations.”
