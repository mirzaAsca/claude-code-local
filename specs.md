# Reconstruct and Run the Local Claude-Code Snapshot (Source-First, No Black-Box CLI)

## Summary
Rebuild this snapshot into a runnable, source-based CLI by reconstructing missing project metadata and modules from public artifacts (official docs, npm package history, public repo/plugin content), then using explicit stubs only when exact recovery is impossible.
Default target: near-full parity with direct API-key usage (no bundled Anthropic CLI binary dependency).

## Implementation Changes
- [ ] **1. Establish a reproducible build/runtime scaffold**
  - [x] **1.1** Add `package.json`, `tsconfig.json`, and build scripts for a Bun-first TypeScript workflow.
    - [x] **1.1.1** Create `package.json` with `"type": "module"`, `"private": true`, and Bun-based scripts.
    - [x] **1.1.2** Seed dependencies from `docs/architecture/package-data/external-packages.tsv` and group platform/native packages under `optionalDependencies` where appropriate.
    - [x] **1.1.3** Add minimum scripts needed for iteration: `dev`, `build`, `typecheck`, `reconstruct:scan`, `reconstruct:hydrate`, `reconstruct:verify`.
    - [x] **1.1.4** Add `tsconfig.json` configured for ESM + `.js` import specifiers from TS source (`moduleResolution: bundler`, `allowJs: false`, `checkJs: false`, `baseUrl: "."`).
    - [x] **1.1.5** Add a bootstrap compile check command (`bunx tsc --noEmit`) and document expected baseline failures before hydration.
  - [ ] **1.2** Define `src/*` alias mapping to this repository root (current files import `src/...` heavily).
    - [ ] **1.2.1** Add `paths` mapping in `tsconfig.json`: `"src/*": ["./*"]`.
    - [ ] **1.2.2** Add Bun runtime alias handling (or equivalent bundler resolution) so `src/*` works both in type-check and runtime entrypoints.
    - [ ] **1.2.3** Verify key entrypoints resolve through alias: `entrypoints/cli.tsx`, `main.tsx`, `cli/print.ts`, `QueryEngine.ts`.
  - [x] **1.3** Add a local feature/macro compatibility layer.
    - [x] **1.3.1** Replace `bun:bundle` feature usage at runtime with a local `feature()` shim that reads a checked-in feature map.
      - [x] **1.3.1.1** Add `reconstruction/features.json` with explicit `true|false` flags.
      - [x] **1.3.1.2** Add `reconstruction/feature.ts` exporting `feature(name: string): boolean` backed by `features.json`.
      - [x] **1.3.1.3** Codemod imports from `bun:bundle` to local shim (`import { feature } from './reconstruction/feature.js'` or `src/reconstruction/feature.js`).
      - [x] **1.3.1.4** Default unresolved/unsupported feature trees to `false` so startup remains deterministic.
    - [x] **1.3.2** Provide build-time replacements for `MACRO.*` constants (`VERSION`, `BUILD_TIME`, `PACKAGE_URL`) via a generated local metadata file.
      - [x] **1.3.2.1** Add `reconstruction/macros.json` as editable source of truth.
      - [x] **1.3.2.2** Add generator script to produce `reconstruction/generated/macros.ts` and a global `MACRO` type declaration.
      - [x] **1.3.2.3** Ensure all `MACRO.*` references compile in `main.tsx`, `cli/update.ts`, and `services/analytics/metadata.ts`.
      - [x] **1.3.2.4** Add a `reconstruct:macros` substep or include macro generation in `reconstruct:hydrate`.
      - [x] **1.3.2.5** Add automated tests for macro config validation and generated artifact output.
      - [x] **1.3.2.6** Validate generated macro artifacts and fast-path version output at runtime.
  - [ ] **1.4** Add public interfaces: `reconstruction/features.json` and `reconstruction/macros.json` as the source of truth for local feature flags and macro constants.
    - [ ] **1.4.1** Define a stable schema section at top of each file (`version`, `generatedAt`, `notes`).
    - [ ] **1.4.2** Add JSON schema validation in reconstruction scripts and fail on unknown keys.
    - [ ] **1.4.3** Document edit policy: only these files are hand-edited; generated outputs are not.

- [ ] **2. Automate missing-module discovery and recovery**
  - [x] **2.1** Add `scripts/reconstruct-scan` to produce unresolved runtime imports, unresolved type imports, and recoverable vs non-recoverable targets.
    - [x] **2.1.1** Walk all `*.ts`/`*.tsx` source files and parse `import`/`export ... from` + dynamic `import()`.
    - [x] **2.1.2** Resolve relative paths and `src/*` alias, including `.js` specifiers pointing to `.ts/.tsx` files.
    - [x] **2.1.3** Separate `import type` misses from runtime misses.
    - [x] **2.1.4** Emit machine-readable reports to `reconstruction/reports/` (`unresolved-runtime.json`, `unresolved-types.json`, `scan-summary.json`).
    - [x] **2.1.5** Exit non-zero when newly missing runtime imports are introduced vs manifest baseline.
  - [ ] **2.2** Add `scripts/reconstruct-hydrate` to ingest public artifacts, generate recoverable files, and generate explicit stub modules for non-recoverable files (with TODO headers and provenance tags).
    - [ ] **2.2.1** Define source inputs directory (`reconstruction/sources/`) and accepted source kinds (`npm-tarball`, `public-repo`, `manual-adapted`).
    - [ ] **2.2.2** For recoverable targets, write recovered modules with provenance header including source URL/ref and commit/tag.
    - [ ] **2.2.3** For non-recoverable targets, generate stubs that compile and fail explicitly at runtime with actionable error text.
    - [ ] **2.2.4** Ensure stubs preserve exported symbol names/signatures expected by callsites.
    - [ ] **2.2.5** Re-run scan after hydrate and write post-hydration delta report.
  - [ ] **2.3** Persist all outcomes in `reconstruction/manifest.json` with per-module status: `recovered_exact`, `recovered_adapted`, `stubbed`.
    - [ ] **2.3.1** Include fields: `modulePath`, `status`, `sourceKind`, `sourceRef`, `hash`, `updatedAt`, `owner`.
    - [ ] **2.3.2** Keep manifest updates idempotent and deterministic ordering by `modulePath`.
    - [ ] **2.3.3** Add validation that every unresolved import in scan output has a manifest entry.

- [ ] **3. Recover high-impact missing surfaces first (critical path)**
  - [ ] **3.1** Prioritize recovery/stubbing for modules blocking startup and REPL flow.
    - [ ] **3.1.1** Core entrypoint dependencies.
      - [ ] **3.1.1.1** Trace startup chain: `entrypoints/cli.tsx -> main.tsx -> entrypoints/init.ts -> replLauncher.tsx`.
      - [ ] **3.1.1.2** Recover/stub first missing modules in that chain before addressing feature branches.
      - [ ] **3.1.1.3** Confirm `--version` and `--help` can execute without loading unrecovered optional trees.
    - [ ] **3.1.2** Command registry dependencies.
      - [ ] **3.1.2.1** Recover/stub direct imports in `commands.ts` and command descriptors needed by `help`, `config`, `session`, `permissions`.
      - [ ] **3.1.2.2** Keep unavailable commands hidden behind `isEnabled()` + feature gates rather than hard failure.
      - [ ] **3.1.2.3** Ensure `findCommand()/getCommands()` do not throw during initial REPL boot.
    - [ ] **3.1.3** Core task/tool wiring.
      - [ ] **3.1.3.1** Recover/stub required modules for `Tool.ts`, `tools.ts`, `services/tools/toolExecution.ts`, `services/tools/toolOrchestration.ts`.
      - [ ] **3.1.3.2** Ensure permission pipeline remains intact (`utils/permissions/permissions.ts`).
      - [ ] **3.1.3.3** Keep task polling/storage path functional (`Task.ts`, `tasks.ts`, `utils/task/*`).
    - [ ] **3.1.4** Required type modules (`types/message`, `types/tools`, and related control/runtime SDK types).
      - [ ] **3.1.4.1** Reconstruct `types/message.ts` and `types/tools.ts` first (highest fan-out imports).
      - [ ] **3.1.4.2** Reconstruct missing SDK transport types (`entrypoints/sdk/controlTypes.ts`, related SDK utility types).
      - [ ] **3.1.4.3** Add temporary minimal interfaces only if exact types are unavailable, then track upgrade TODO in manifest.
  - [ ] **3.2** Explicitly gate/defer unsupported advanced surfaces behind disabled feature flags until recovered.
    - [ ] **3.2.1** `remote/bridge/workflow/monitor/tungsten/proactive` and similar missing feature trees.
      - [ ] **3.2.1.1** Enumerate all missing feature-gated imports and map each to a feature flag in `reconstruction/features.json`.
      - [ ] **3.2.1.2** Set those flags `false` by default and verify gated `require()` paths are not executed.
      - [ ] **3.2.1.3** Add runtime note in startup diagnostics listing disabled capabilities.
  - [ ] **3.3** Add `reconstruction/unsupported-features.md` listing disabled features and exact missing-source reasons.
    - [ ] **3.3.1** Use a table with columns: `featureFlag`, `blockedModules`, `reason`, `recoverySource`, `status`.
    - [ ] **3.3.2** Link each row to manifest entries and to the gate location in source.
    - [ ] **3.3.3** Keep this file human-readable and commit with every hydration pass.

- [ ] **4. Wire direct API-key execution path (no black-box CLI dependency)**
  - [ ] **4.1** Keep existing `services/api/*` flow as primary engine path.
    - [ ] **4.1.1** Preserve `query.ts` -> `services/api/claude.ts` call path; avoid introducing a parallel API adapter.
    - [ ] **4.1.2** Preserve retry/error handling via `services/api/withRetry.ts` + `services/api/errors.ts`.
    - [ ] **4.1.3** Confirm `cli/print.ts` headless mode still routes through the same API layer.
  - [ ] **4.2** Validate and document auth precedence for local mode.
    - [ ] **4.2.1** `ANTHROPIC_API_KEY`
      - [ ] **4.2.1.1** Verify detection path in `utils/auth.ts` and surface source labeling in diagnostics.
      - [ ] **4.2.1.2** Add explicit local run examples in `RUN_LOCAL.md`.
    - [ ] **4.2.2** Optional `ANTHROPIC_AUTH_TOKEN`
      - [ ] **4.2.2.1** Validate behavior in non-managed contexts and ensure it does not override explicit API-key local mode unexpectedly.
      - [ ] **4.2.2.2** Document intended use and caveats.
    - [ ] **4.2.3** Optional `apiKeyHelper`
      - [ ] **4.2.3.1** Verify helper lookup/caching path in `utils/auth.ts`.
      - [ ] **4.2.3.2** Ensure trust-gating protections remain intact before helper execution.
      - [ ] **4.2.3.3** Document helper failure behavior and fallback semantics.
  - [ ] **4.3** Ensure startup and query paths fail with actionable local errors when credentials are absent/invalid.
    - [ ] **4.3.1** Add/verify preflight check in startup and print mode that reports missing credentials before long initialization.
    - [ ] **4.3.2** Keep error messaging aligned with `services/api/errors.ts` to avoid contradictory guidance.
    - [ ] **4.3.3** Ensure non-interactive mode returns non-zero exit code with remediation hints.

- [ ] **5. Improve developer ergonomics and safety**
  - [ ] **5.1** Add scripts: `dev`, `build`, `reconstruct:scan`, `reconstruct:hydrate`, and `reconstruct:verify` (ensures no newly introduced unresolved runtime imports).
    - [ ] **5.1.1** `dev`: run interactive entrypoint in watch mode with local feature/macro shims enabled.
    - [ ] **5.1.2** `build`: produce a deterministic build artifact for CLI entry (`dist/` or equivalent).
    - [ ] **5.1.3** `reconstruct:scan`: run scanner and write reports.
    - [ ] **5.1.4** `reconstruct:hydrate`: perform recovery + stub generation + manifest update.
    - [ ] **5.1.5** `reconstruct:verify`: fail if unresolved runtime imports exist in enabled feature set.
  - [ ] **5.2** Add `RUN_LOCAL.md` with exact setup, env vars, supported command matrix, and known limitations.
    - [ ] **5.2.1** Include prerequisites (Bun version, OS notes, optional native deps).
    - [ ] **5.2.2** Include minimal setup commands from clean clone to first successful `--help`.
    - [ ] **5.2.3** Include command matrix (`--version`, `--help`, `--print`, interactive REPL, remote features disabled).
    - [ ] **5.2.4** Include troubleshooting section keyed by common missing modules/auth failures.
  - [ ] **5.3** Add strict provenance comments in generated/recovered files to preserve transparency.
    - [ ] **5.3.1** Standardize provenance header template (`source`, `retrievedAt`, `transform`, `status`).
    - [ ] **5.3.2** Stamp all generated stubs and recovered files.
    - [ ] **5.3.3** Add linter/check in `reconstruct:verify` that stubs cannot exist without provenance header.

## Test Plan
- [ ] **6. Static validation**
  - [ ] **6.1** `reconstruct:scan` reports zero unresolved runtime imports in enabled feature set.
    - [ ] **6.1.1** Run `bun run reconstruct:scan` and archive report artifacts in `reconstruction/reports/`.
    - [ ] **6.1.2** Confirm `unresolved-runtime.json` is empty for all features currently set `true`.
    - [ ] **6.1.3** Confirm remaining unresolved imports are either behind disabled flags or have manifest status `stubbed`.
  - [x] **6.3** Macro compatibility layer validation.
    - [x] **6.3.1** Run `bun test scripts/reconstruct-macros.test.ts` for schema validation and artifact generation coverage.
    - [x] **6.3.2** Run `bun run reconstruct:macros` and confirm generated outputs are written to `reconstruction/generated/`.
    - [x] **6.3.3** Run `bun entrypoints/cli.tsx --version` and confirm `MACRO.VERSION` is available in startup fast path.
  - [ ] **6.2** Type-check/build completes for the reconstructed tree.
    - [ ] **6.2.1** Run `bunx tsc --noEmit`.
    - [ ] **6.2.2** Run `bun run build`.
    - [ ] **6.2.3** Treat any missing-module error in enabled path as release-blocking.

- [ ] **7. Smoke runtime**
  - [ ] **7.1** `--version`, `--help`, and non-interactive prompt mode start successfully.
    - [ ] **7.1.1** Execute `bun run dev -- --version` and `bun run dev -- --help`.
    - [ ] **7.1.2** Execute a simple non-interactive prompt (`-p`/`--print`) and validate exit code + output shape.
    - [ ] **7.1.3** Confirm command registry loads without throwing on missing optional modules.
  - [ ] **7.2** Interactive REPL starts without module-resolution crashes.
    - [ ] **7.2.1** Launch interactive mode from repo root.
    - [ ] **7.2.2** Confirm initial UI render (`App` + `REPL`) completes.
    - [ ] **7.2.3** Send one local command (`/help` or `/config`) and verify no unresolved import crash.

- [ ] **8. Functional verification**
  - [ ] **8.1** With valid `ANTHROPIC_API_KEY`, run one full prompt cycle and verify response rendering.
    - [ ] **8.1.1** Export `ANTHROPIC_API_KEY` and run a deterministic short prompt in print mode.
    - [ ] **8.1.2** Confirm request path reaches `services/api/claude.ts` and usage data updates.
    - [ ] **8.1.3** Confirm response is rendered in expected terminal output format.
  - [ ] **8.2** Exercise core commands/tools: help/config, file read/edit path, shell tool path, command parsing, and session persistence basics.
    - [ ] **8.2.1** Validate `/help` and `/config` command output.
    - [ ] **8.2.2** Trigger file read + file edit tool flow on a temp file.
    - [ ] **8.2.3** Trigger shell tool (`BashTool` or `PowerShellTool`) with a safe command.
    - [ ] **8.2.4** Resume the same session and confirm transcript persistence loads.

- [ ] **9. Fallback integrity**
  - [ ] **9.1** Trigger at least one stubbed path intentionally and verify clear warning message.
    - [ ] **9.1.1** Pick one manifest entry with `status=stubbed` and invoke its code path.
    - [ ] **9.1.2** Confirm warning includes module path + recovery guidance.
  - [ ] **9.2** Verify graceful degradation (no hard crash).
    - [ ] **9.2.1** Confirm process remains usable after stub warning in both interactive and non-interactive contexts.
    - [ ] **9.2.2** Confirm optional feature unavailability does not break core prompt loop.
  - [ ] **9.3** Verify manifest entry matches runtime behavior.
    - [ ] **9.3.1** Ensure stubbed runtime warning references the same module key as `reconstruction/manifest.json`.
    - [ ] **9.3.2** Add regression check that fails if runtime stub trigger has no manifest row.

## Assumptions and Defaults
- Publicly available sources are limited to official docs, npm package artifacts, and the public `anthropics/claude-code` repo (which does not expose the full CLI source tree).
- Version `2.1.88` is not available via npm at this date (April 3, 2026); reconstruction cannot rely on it.
- This snapshot has no checked-in `package.json`/`tsconfig.json`, and several high-fanout modules are currently missing (for example `types/message.ts`, `types/tools.ts`, and `entrypoints/sdk/controlTypes.ts`).
- If exact code cannot be recovered from public sources, explicit stubs are permitted and must be transparently documented.
- Default implementation bias is to maximize runnable core parity first, then expand feature parity iteratively by replacing stubs with recovered implementations.
