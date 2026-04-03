import { describe, expect, test } from 'bun:test'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import {
  runScan,
  scanProject,
} from './reconstruct-scan.ts'

function makeTempRoot(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix))
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const filePath = path.join(rootDir, relativePath)
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, content)
}

describe('scanProject', () => {
  test('separates runtime and type unresolved imports and resolves src/*.js to ts candidates', () => {
    const rootDir = makeTempRoot('reconstruct-scan-project-')

    writeFile(rootDir, 'lib/ok.ts', 'export const ok = 1\n')
    writeFile(
      rootDir,
      'entry.ts',
      `import { ok } from 'src/lib/ok.js'
import type { MissingType } from 'src/types/missing.js'
import { type OnlyType } from 'src/types/only-type.js'
import { MixedValue } from 'src/types/mixed.js'
export type { ExportedType } from './types/export-missing.js'
export { RuntimeExport } from './runtime-missing.js'
const dyn = import('./dyn-missing.js')
void ok
void dyn
`,
    )

    const result = scanProject(rootDir)

    const runtimeSpecifiers = result.unresolvedRuntime.map((entry) => entry.specifier)
    const typeSpecifiers = result.unresolvedTypes.map((entry) => entry.specifier)

    expect(runtimeSpecifiers).toEqual(
      expect.arrayContaining([
        'src/types/mixed.js',
        './runtime-missing.js',
        './dyn-missing.js',
      ]),
    )
    expect(typeSpecifiers).toEqual(
      expect.arrayContaining([
        'src/types/missing.js',
        'src/types/only-type.js',
        './types/export-missing.js',
      ]),
    )

    expect(runtimeSpecifiers).not.toContain('src/lib/ok.js')
    expect(result.unresolvedRuntime).toHaveLength(3)
    expect(result.unresolvedTypes).toHaveLength(3)

    expect(
      result.unresolvedRuntime.find((entry) => entry.specifier === 'src/types/mixed.js')
        ?.expectedModulePath,
    ).toBe('types/mixed.ts')
    expect(
      result.unresolvedTypes.find((entry) => entry.specifier === 'src/types/missing.js')
        ?.expectedModulePath,
    ).toBe('types/missing.ts')
  })
})

describe('runScan baseline enforcement', () => {
  test('fails with exitCode 1 when unresolved runtime misses are not in manifest baseline', () => {
    const rootDir = makeTempRoot('reconstruct-scan-baseline-fail-')

    writeFile(rootDir, 'entry.ts', "import { x } from './missing.js'\nvoid x\n")
    writeFile(
      rootDir,
      'reconstruction/manifest.json',
      `${JSON.stringify(
        {
          version: 1,
          entries: [{ modulePath: 'known-missing.ts', status: 'stubbed' }],
        },
        null,
        2,
      )}\n`,
    )

    const result = runScan(rootDir)

    expect(result.exitCode).toBe(1)
    expect(result.newRuntimeMisses).toHaveLength(1)
    expect(result.newRuntimeMisses[0]?.expectedModulePath).toBe('missing.ts')

    const runtimeReport = JSON.parse(
      readFileSync(path.join(rootDir, 'reconstruction', 'reports', 'unresolved-runtime.json'), 'utf8'),
    ) as {
      status: string
      newMissingCount: number
    }
    expect(runtimeReport.status).toBe('failed_new_runtime_missing')
    expect(runtimeReport.newMissingCount).toBe(1)
  })

  test('passes when unresolved runtime misses are already listed in manifest entries', () => {
    const rootDir = makeTempRoot('reconstruct-scan-baseline-pass-')

    writeFile(rootDir, 'entry.ts', "import { x } from './missing.js'\nvoid x\n")
    writeFile(
      rootDir,
      'reconstruction/manifest.json',
      `${JSON.stringify(
        {
          version: 1,
          entries: [{ modulePath: 'missing.ts', status: 'stubbed' }],
        },
        null,
        2,
      )}\n`,
    )

    const result = runScan(rootDir)

    expect(result.exitCode).toBe(0)
    expect(result.newRuntimeMisses).toHaveLength(0)

    const summary = JSON.parse(
      readFileSync(path.join(rootDir, 'reconstruction', 'reports', 'scan-summary.json'), 'utf8'),
    ) as {
      status: string
      baseline: {
        enabled: boolean
      }
    }

    expect(summary.status).toBe('ok')
    expect(summary.baseline.enabled).toBe(true)
  })
})
