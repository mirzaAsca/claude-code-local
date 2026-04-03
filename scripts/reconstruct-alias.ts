import { spawnSync } from 'child_process'
import { readFileSync } from 'fs'
import path from 'path'
import { resolveProjectImport } from './reconstruct-scan.ts'

const TSCONFIG_RELATIVE_PATH = 'tsconfig.json'
const REQUIRED_BASE_URL = '.'
const REQUIRED_ALIAS_KEY = 'src/*'
const REQUIRED_ALIAS_TARGET = './*'

export type AliasResolutionCase = {
  importerPath: string
  specifier: string
  expectedModulePath: string
}

export type EntrypointAliasResolution = AliasResolutionCase & {
  resolvedModulePath: string
}

export type AliasCheckSummary = {
  tsconfigPath: string
  aliasTargets: string[]
  runtimeSpecifiers: string[]
  entrypointChecks: EntrypointAliasResolution[]
}

export const KEY_ENTRYPOINT_ALIAS_CASES: AliasResolutionCase[] = [
  {
    importerPath: 'entrypoints/cli.tsx',
    specifier: 'src/reconstruction/feature.js',
    expectedModulePath: 'reconstruction/feature.ts',
  },
  {
    importerPath: 'main.tsx',
    specifier: 'src/services/analytics/index.js',
    expectedModulePath: 'services/analytics/index.ts',
  },
  {
    importerPath: 'cli/print.ts',
    specifier: 'src/services/settingsSync/index.js',
    expectedModulePath: 'services/settingsSync/index.ts',
  },
  {
    importerPath: 'QueryEngine.ts',
    specifier: 'src/bootstrap/state.js',
    expectedModulePath: 'bootstrap/state.ts',
  },
]

export const DEFAULT_RUNTIME_ALIAS_SPECIFIERS = [
  'src/reconstruction/feature.js',
  'src/reconstruction/generated/macros.js',
  'src/services/analytics/index.js',
]

function assertObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '')
}

export function validateTsconfigSrcAlias(
  parsed: unknown,
): { aliasTargets: string[] } {
  const topLevel = assertObject(parsed, 'tsconfig.json')
  const compilerOptions = assertObject(
    topLevel.compilerOptions,
    'tsconfig.json compilerOptions',
  )

  if (compilerOptions.baseUrl !== REQUIRED_BASE_URL) {
    throw new Error(
      `tsconfig.json compilerOptions.baseUrl must be "${REQUIRED_BASE_URL}"`,
    )
  }

  const paths = assertObject(
    compilerOptions.paths,
    'tsconfig.json compilerOptions.paths',
  )
  const aliasTargetsRaw = paths[REQUIRED_ALIAS_KEY]
  if (!Array.isArray(aliasTargetsRaw)) {
    throw new Error(
      `tsconfig.json compilerOptions.paths["${REQUIRED_ALIAS_KEY}"] must be an array`,
    )
  }

  const aliasTargets = aliasTargetsRaw.filter(
    (value): value is string => typeof value === 'string',
  )

  if (!aliasTargets.includes(REQUIRED_ALIAS_TARGET)) {
    throw new Error(
      `tsconfig.json compilerOptions.paths["${REQUIRED_ALIAS_KEY}"] must include "${REQUIRED_ALIAS_TARGET}"`,
    )
  }

  return {
    aliasTargets,
  }
}

export function validateTsconfigAtRoot(
  rootDir: string,
): { tsconfigPath: string; aliasTargets: string[] } {
  const tsconfigPath = path.join(rootDir, TSCONFIG_RELATIVE_PATH)
  const parsed = JSON.parse(readFileSync(tsconfigPath, 'utf8')) as unknown
  const { aliasTargets } = validateTsconfigSrcAlias(parsed)

  return {
    tsconfigPath,
    aliasTargets,
  }
}

export function verifyEntrypointAliasResolutions(
  rootDir: string,
  cases: AliasResolutionCase[] = KEY_ENTRYPOINT_ALIAS_CASES,
): EntrypointAliasResolution[] {
  const checks: EntrypointAliasResolution[] = []

  for (const checkCase of cases) {
    const importerAbsolutePath = path.join(rootDir, checkCase.importerPath)
    const resolution = resolveProjectImport(
      rootDir,
      importerAbsolutePath,
      checkCase.specifier,
    )

    if (!resolution.isLocal) {
      throw new Error(
        `Alias specifier must resolve as local import: ${checkCase.importerPath} -> ${checkCase.specifier}`,
      )
    }

    if (!resolution.resolvedPath) {
      throw new Error(
        `Alias specifier did not resolve: ${checkCase.importerPath} -> ${checkCase.specifier}. Candidates: ${resolution.candidatePaths.join(', ')}`,
      )
    }

    const resolvedModulePath = normalizePath(
      path.relative(rootDir, resolution.resolvedPath),
    )
    if (resolvedModulePath !== checkCase.expectedModulePath) {
      throw new Error(
        `Unexpected alias resolution for ${checkCase.importerPath} -> ${checkCase.specifier}. Expected ${checkCase.expectedModulePath}, got ${resolvedModulePath}`,
      )
    }

    checks.push({
      ...checkCase,
      resolvedModulePath,
    })
  }

  return checks
}

export function verifyBunRuntimeAlias(
  rootDir: string,
  specifiers: string[] = DEFAULT_RUNTIME_ALIAS_SPECIFIERS,
): void {
  const runtimeCheckScript = `
const specifiers = ${JSON.stringify(specifiers)};
for (const specifier of specifiers) {
  await import(specifier);
}
const featureModule = require('src/reconstruction/feature.js');
if (typeof featureModule.feature !== 'function') {
  throw new Error('Expected feature export from src/reconstruction/feature.js');
}
console.log('alias-runtime-ok');
`

  const result = spawnSync(process.execPath, ['--eval', runtimeCheckScript], {
    cwd: rootDir,
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() ?? ''
    const stdout = result.stdout?.trim() ?? ''
    throw new Error(
      `Bun runtime alias check failed (exit ${result.status ?? 'unknown'}).\nstdout: ${stdout}\nstderr: ${stderr}`,
    )
  }

  if (!result.stdout?.includes('alias-runtime-ok')) {
    throw new Error(
      'Bun runtime alias check did not report success marker "alias-runtime-ok"',
    )
  }
}

export function runAliasChecks(rootDir: string = process.cwd()): AliasCheckSummary {
  const {
    tsconfigPath,
    aliasTargets,
  } = validateTsconfigAtRoot(rootDir)
  const entrypointChecks = verifyEntrypointAliasResolutions(rootDir)
  verifyBunRuntimeAlias(rootDir)

  return {
    tsconfigPath: normalizePath(tsconfigPath),
    aliasTargets,
    runtimeSpecifiers: [...DEFAULT_RUNTIME_ALIAS_SPECIFIERS],
    entrypointChecks,
  }
}

export function main(rootDir: string = process.cwd()): void {
  const summary = runAliasChecks(rootDir)

  console.log(
    `Alias checks passed. tsconfig=${summary.tsconfigPath} targets=${summary.aliasTargets.join(', ')}`,
  )
  console.log(
    `Validated ${summary.entrypointChecks.length} key entrypoint alias resolutions`,
  )
  console.log(
    `Verified Bun runtime alias imports for ${summary.runtimeSpecifiers.length} modules`,
  )
}

if (import.meta.main) {
  main()
}
