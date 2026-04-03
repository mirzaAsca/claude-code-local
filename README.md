# Project Architecture Router

This repository is a Bun-based TypeScript CLI with a terminal UI, a large tool/runtime surface, file-backed persistence, and multiple remote/control paths.

The purpose of this README is to act as the entry router for the architecture docs. Start here, then follow the concern-specific markdown files below.

## Architecture At A Glance

- `main.tsx` is the primary runtime orchestrator.
- `query.ts` is the agent turn engine.
- `commands.ts` and `commands/` define slash commands and CLI subcommands.
- `tools.ts`, `Tool.ts`, and `tools/` define the tool runtime.
- `components/`, `hooks/`, `ink/`, `screens/`, and `state/` make up the terminal UI layer.
- `services/`, `server/`, `remote/`, and `bridge/` hold backend orchestration, transports, policy, telemetry, and API integration.
- `utils/sessionStorage.ts`, `history.ts`, `migrations/`, and `memdir/` cover file-backed persistence and memory storage.

## Documentation Tree

```text
docs/
  architecture/
    01-system-overview.md
    02-runtime-and-entrypoints.md
    03-backend-services.md
    04-frontend-terminal-ui.md
    05-command-system.md
    06-tools-runtime.md
    07-data-layer-db-migrations.md
    08-plugins-skills-mcp.md
    09-security-auth-permissions.md
    10-patterns-and-best-practices.md
    11-tech-package-inventory.md
    package-data/
      import-inventory.json
      external-packages.tsv
      external-packages-table.md
```

## Quick Links

| Concern | Read First | Follow With |
| --- | --- | --- |
| Runtime / startup | [02-runtime-and-entrypoints.md](docs/architecture/02-runtime-and-entrypoints.md) | [01-system-overview.md](docs/architecture/01-system-overview.md) |
| Backend / services | [03-backend-services.md](docs/architecture/03-backend-services.md) | [10-patterns-and-best-practices.md](docs/architecture/10-patterns-and-best-practices.md) |
| Frontend / terminal UI | [04-frontend-terminal-ui.md](docs/architecture/04-frontend-terminal-ui.md) | [10-patterns-and-best-practices.md](docs/architecture/10-patterns-and-best-practices.md) |
| Commands / CLI | [05-command-system.md](docs/architecture/05-command-system.md) | [02-runtime-and-entrypoints.md](docs/architecture/02-runtime-and-entrypoints.md) |
| Tools / runtime | [06-tools-runtime.md](docs/architecture/06-tools-runtime.md) | [09-security-auth-permissions.md](docs/architecture/09-security-auth-permissions.md) |
| Data / persistence / migrations | [07-data-layer-db-migrations.md](docs/architecture/07-data-layer-db-migrations.md) | [01-system-overview.md](docs/architecture/01-system-overview.md) |
| Plugins / skills / MCP | [08-plugins-skills-mcp.md](docs/architecture/08-plugins-skills-mcp.md) | [06-tools-runtime.md](docs/architecture/06-tools-runtime.md) |
| Security / auth / permissions | [09-security-auth-permissions.md](docs/architecture/09-security-auth-permissions.md) | [03-backend-services.md](docs/architecture/03-backend-services.md) |
| Packages / tech inventory | [11-tech-package-inventory.md](docs/architecture/11-tech-package-inventory.md) | [03-backend-services.md](docs/architecture/03-backend-services.md) |
| Patterns / best practices | [10-patterns-and-best-practices.md](docs/architecture/10-patterns-and-best-practices.md) | [01-system-overview.md](docs/architecture/01-system-overview.md) |

## Navigation By Concern

### Runtime

- [02-runtime-and-entrypoints.md](docs/architecture/02-runtime-and-entrypoints.md)
- [01-system-overview.md](docs/architecture/01-system-overview.md)

### Backend

- [03-backend-services.md](docs/architecture/03-backend-services.md)
- [10-patterns-and-best-practices.md](docs/architecture/10-patterns-and-best-practices.md)

### Frontend

- [04-frontend-terminal-ui.md](docs/architecture/04-frontend-terminal-ui.md)

### Commands

- [05-command-system.md](docs/architecture/05-command-system.md)

### Tools

- [06-tools-runtime.md](docs/architecture/06-tools-runtime.md)

### Data / DB / Migrations

- [07-data-layer-db-migrations.md](docs/architecture/07-data-layer-db-migrations.md)

### Plugins / MCP / Skills

- [08-plugins-skills-mcp.md](docs/architecture/08-plugins-skills-mcp.md)

### Security / Auth / Permissions

- [09-security-auth-permissions.md](docs/architecture/09-security-auth-permissions.md)

### Packages / Tech Inventory

- [11-tech-package-inventory.md](docs/architecture/11-tech-package-inventory.md)
- [package-data/import-inventory.json](docs/architecture/package-data/import-inventory.json)

### Patterns / Best Practices

- [10-patterns-and-best-practices.md](docs/architecture/10-patterns-and-best-practices.md)

## How To Maintain These Docs

- Keep `README.md` as the router. Add new docs here whenever a new architecture area is introduced.
- Put each major concern in its own markdown file under `docs/architecture/`.
- Update the relevant doc first, then update the router links and the docs tree.
- If a claim is inferred from imports, module structure, or behavior patterns, label it as `Inference`.
- If `package.json` is absent, keep the package inventory source-derived and say so explicitly.
- Prefer short, navigable docs over one large monolithic architecture file.
- Keep file names stable and ordered so the docs tree stays readable.
- For reconstruction compatibility inputs (`reconstruction/features.json` and `reconstruction/macros.json`), follow the edit policy in [`reconstruction/README.md`](reconstruction/README.md).

## Notes

- This snapshot does not include a checked-in `package.json`, so the package inventory is inferred from imports and module usage.
- The persistence layer is largely file-backed rather than a conventional SQL database, so the data-layer doc focuses on transcripts, history, memdir, and migrations.

## Bootstrap Compile Check

- Run `bun run typecheck` (alias for `bunx tsc --noEmit`) after `bun install`.
- Expected baseline failures before reconstruction/hydration include missing source modules that are referenced throughout the tree:
  - `types/message.ts`
  - `types/tools.ts`
  - `entrypoints/sdk/controlTypes.ts`
- Additional failures from unresolved build-time surfaces (`MACRO.*` constants and `bun:bundle` feature gating) are expected until the compatibility layer in `specs.md` item `1.3` is implemented.

## Reconstruction Hydration

The hydration system discovers unresolved imports, generates stub modules, and tracks recovery progress via a manifest.

### Quick Start

```bash
bun run reconstruct:hydrate   # Generate stubs + manifest + macros
bun run reconstruct:scan      # Re-scan to verify 0 unresolved imports
bun run reconstruct:verify    # Validate config + reports
```

### How It Works

1. **Pre-scan**: Runs `reconstruct:scan` to discover all unresolved imports.
2. **Recovery check**: Looks for manually placed source files in `reconstruction/sources/` (accepted kinds: `npm-tarball`, `public-repo`, `manual-adapted`).
3. **Stub generation**: For each unresolved module without a recovery source, generates a stub that:
   - Compiles successfully (preserves expected export names/signatures from callsite analysis)
   - Throws with actionable error text at runtime
   - Includes a provenance header (`source`, `module`, `status`, `retrievedAt`, `transform`)
4. **Manifest**: Writes `reconstruction/manifest.json` with per-module entries (`modulePath`, `status`, `sourceKind`, `sourceRef`, `hash`, `updatedAt`, `owner`).
5. **Post-scan**: Re-runs the scanner and writes `reconstruction/reports/hydration-delta.json` comparing pre/post state.
6. **Baseline**: The manifest's `unresolvedRuntimeBaseline` array enables `reconstruct:scan` to detect newly introduced unresolved imports.

### Replacing Stubs with Recovered Implementations

To replace a stub with a recovered implementation:

1. Place the recovered file in `reconstruction/sources/<module-path>` (e.g., `reconstruction/sources/server/server.ts`).
2. Delete the existing stub at the module path.
3. Run `bun run reconstruct:hydrate` — it will write the recovered file and update the manifest with `status: recovered_adapted`.
