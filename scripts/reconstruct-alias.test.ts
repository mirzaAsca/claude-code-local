import { describe, expect, test } from 'bun:test'
import {
  KEY_ENTRYPOINT_ALIAS_CASES,
  runAliasChecks,
  validateTsconfigSrcAlias,
  verifyBunRuntimeAlias,
  verifyEntrypointAliasResolutions,
} from './reconstruct-alias.ts'

describe('validateTsconfigSrcAlias', () => {
  test('accepts required src alias mapping', () => {
    const parsed = {
      compilerOptions: {
        baseUrl: '.',
        paths: {
          'src/*': ['./*'],
        },
      },
    }

    const validated = validateTsconfigSrcAlias(parsed)
    expect(validated.aliasTargets).toEqual(['./*'])
  })

  test('rejects missing src alias mapping', () => {
    const parsed = {
      compilerOptions: {
        baseUrl: '.',
        paths: {},
      },
    }

    expect(() => validateTsconfigSrcAlias(parsed)).toThrow(
      'tsconfig.json compilerOptions.paths["src/*"] must be an array',
    )
  })
})

describe('alias verification integration', () => {
  test('resolves representative src/* imports from key entrypoints', () => {
    const checks = verifyEntrypointAliasResolutions(process.cwd())
    expect(checks).toHaveLength(KEY_ENTRYPOINT_ALIAS_CASES.length)

    const byImporter = new Map(
      checks.map((check) => [check.importerPath, check.resolvedModulePath]),
    )

    expect(byImporter.get('entrypoints/cli.tsx')).toBe('reconstruction/feature.ts')
    expect(byImporter.get('main.tsx')).toBe('services/analytics/index.ts')
    expect(byImporter.get('cli/print.ts')).toBe('services/settingsSync/index.ts')
    expect(byImporter.get('QueryEngine.ts')).toBe('bootstrap/state.ts')
  })

  test('bun runtime resolves src/* aliases for import and require', () => {
    expect(() => verifyBunRuntimeAlias(process.cwd())).not.toThrow()
  })

  test('runAliasChecks returns summary for tsconfig, runtime, and entrypoints', () => {
    const summary = runAliasChecks(process.cwd())

    expect(summary.aliasTargets).toContain('./*')
    expect(summary.runtimeSpecifiers).toContain('src/reconstruction/feature.js')
    expect(summary.entrypointChecks).toHaveLength(KEY_ENTRYPOINT_ALIAS_CASES.length)
  })
})
