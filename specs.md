# Reconstruct and Run the Local Claude-Code Snapshot (Source-First, No Black-Box CLI)

## Summary
Rebuild this snapshot into a runnable, source-based CLI by reconstructing missing project metadata and modules from public artifacts (official docs, npm package history, public repo/plugin content), then using explicit stubs only when exact recovery is impossible.  
Default target: near-full parity with direct API-key usage (no bundled Anthropic CLI binary dependency).

## Implementation Changes
- **Establish a reproducible build/runtime scaffold**
  - Add `package.json`, `tsconfig.json`, and build scripts for a Bun-first TypeScript workflow.
  - Define `src/*` alias mapping to this repository root (current files import `src/...` heavily).
  - Add a local feature/macro compatibility layer:
    - Replace `bun:bundle` feature usage at runtime with a local `feature()` shim that reads a checked-in feature map.
    - Provide build-time replacements for `MACRO.*` constants (`VERSION`, `BUILD_TIME`, `PACKAGE_URL`) via a generated local metadata file.
  - Public interface addition: `reconstruction/features.json` and `reconstruction/macros.json` become the source of truth for local feature flags and macro constants.

- **Automate missing-module discovery and recovery**
  - Add `scripts/reconstruct-scan` to produce:
    - unresolved runtime imports,
    - unresolved type imports,
    - recoverable targets (public data available) vs non-recoverable.
  - Add `scripts/reconstruct-hydrate` to:
    - ingest public artifact inputs (npm tarball metadata, docs-derived references, public repo/plugin files),
    - generate missing files when exact equivalents are discoverable,
    - generate explicit stub modules for non-recoverable files with TODO headers and provenance tags.
  - Persist all outcomes in `reconstruction/manifest.json` with per-module status: `recovered_exact`, `recovered_adapted`, `stubbed`.

- **Recover high-impact missing surfaces first (critical path)**
  - Prioritize recovery/stubbing for modules blocking startup and REPL flow:
    - core entrypoint dependencies,
    - command registry dependencies,
    - core task/tool wiring,
    - required type modules (`types/message`, `types/tools`, related control/runtime SDK types).
  - Explicitly gate/defer unsupported advanced surfaces behind disabled feature flags until recovered:
    - remote/bridge/workflow/monitor/tungsten/proactive and similar missing feature trees.
  - Public interface addition: `reconstruction/unsupported-features.md` listing disabled features and exact missing-source reasons.

- **Wire direct API-key execution path (no black-box CLI dependency)**
  - Keep existing `services/api/*` flow as primary engine path.
  - Validate and document auth precedence for local mode using:
    - `ANTHROPIC_API_KEY`,
    - optional `ANTHROPIC_AUTH_TOKEN`,
    - optional `apiKeyHelper`.
  - Ensure startup and query paths fail with actionable local errors when credentials are absent/invalid.

- **Developer ergonomics and safety**
  - Add scripts:
    - `dev` (run local CLI entrypoint),
    - `build`,
    - `reconstruct:scan`,
    - `reconstruct:hydrate`,
    - `reconstruct:verify` (ensures no newly introduced unresolved runtime imports).
  - Add `RUN_LOCAL.md` with exact setup, env vars, supported command matrix, and known limitations.
  - Add strict provenance comments in generated/recovered files to preserve transparency.

## Test Plan
- **Static validation**
  - `reconstruct:scan` reports zero unresolved runtime imports in enabled feature set.
  - Type-check/build completes for the reconstructed tree.
- **Smoke runtime**
  - `--version`, `--help`, and non-interactive prompt mode start successfully.
  - Interactive REPL starts without module-resolution crashes.
- **Functional**
  - With valid `ANTHROPIC_API_KEY`, run one full prompt cycle and verify response rendering.
  - Exercise core commands/tools: help/config, file read/edit path, shell tool path, command parsing, and session persistence basics.
- **Fallback integrity**
  - Trigger at least one stubbed path intentionally and verify:
    - clear warning message,
    - graceful degradation (no hard crash),
    - manifest entry matches runtime behavior.

## Assumptions and Defaults
- Publicly available sources are limited to official docs, npm package artifacts, and the public `anthropics/claude-code` repo (which does not expose the full CLI source tree).
- Version `2.1.88` is not available via npm at this date (April 3, 2026); reconstruction cannot rely on it.
- If exact code cannot be recovered from public sources, explicit stubs are permitted and must be transparently documented.
- Default implementation bias is to maximize runnable core parity first, then expand feature parity iteratively by replacing stubs with recovered implementations.
