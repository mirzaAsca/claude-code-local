import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import {
  analyzeExpectedExports,
  loadRecoverySources,
  runHydrate,
  validateManifestCoverage,
  type Manifest,
  type ManifestEntry,
} from './reconstruct-hydrate.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'hydrate-test-'))
}

/** Create a minimal project with one missing import so hydration has work to do. */
function seedMinimalProject(rootDir: string): void {
  // Source file that imports a missing module
  writeFileSync(
    path.join(rootDir, 'entry.ts'),
    `import { greet } from './lib/greeter.js'\nconsole.log(greet('world'))\n`,
  )

  // Reconstruction config files required by scan
  mkdirSync(path.join(rootDir, 'reconstruction'), { recursive: true })
  writeFileSync(
    path.join(rootDir, 'reconstruction', 'features.json'),
    JSON.stringify({
      version: 1,
      generatedAt: '2026-04-03T00:00:00.000Z',
      flags: Object.fromEntries(
        Array.from({ length: 95 }, (_, i) => [`FLAG_${i}`, false]),
      ),
    }),
  )
  writeFileSync(
    path.join(rootDir, 'reconstruction', 'macros.json'),
    JSON.stringify({
      version: 1,
      generatedAt: '2026-04-03T00:00:00.000Z',
      macros: {
        VERSION: '0.0.0-test',
        BUILD_TIME: '2026-04-03T00:00:00.000Z',
        PACKAGE_URL: 'test',
        NATIVE_PACKAGE_URL: null,
        FEEDBACK_CHANNEL: 'test',
        ISSUES_EXPLAINER: 'test',
        VERSION_CHANGELOG: '',
      },
    }),
  )
}

/** Create a project with multiple import kinds for thorough testing. */
function seedMultiImportProject(rootDir: string): void {
  seedMinimalProject(rootDir)

  // Static named import
  writeFileSync(
    path.join(rootDir, 'consumer-named.ts'),
    `import { Foo, Bar } from './lib/named.js'\nconsole.log(Foo, Bar)\n`,
  )

  // Type-only import
  writeFileSync(
    path.join(rootDir, 'consumer-type.ts'),
    `import type { MyType } from './lib/typed.js'\nconst x: MyType = {} as any\n`,
  )

  // Default import
  writeFileSync(
    path.join(rootDir, 'consumer-default.ts'),
    `import Widget from './lib/widget.js'\nconsole.log(Widget)\n`,
  )

  // Dynamic import
  writeFileSync(
    path.join(rootDir, 'consumer-dynamic.ts'),
    `const mod = await import('./lib/lazy.js')\n`,
  )

  // Re-export
  writeFileSync(
    path.join(rootDir, 'consumer-reexport.ts'),
    `export { helper } from './lib/reexported.js'\n`,
  )

  // Wildcard re-export
  writeFileSync(
    path.join(rootDir, 'consumer-wildcard.ts'),
    `export * from './lib/wildcard.js'\n`,
  )

  // Side-effect import of .d.ts
  mkdirSync(path.join(rootDir, 'typedefs'), { recursive: true })
  writeFileSync(
    path.join(rootDir, 'consumer-dts.ts'),
    `import '../typedefs/globals.d.ts'\n`,
  )

  // .md file imported as text
  mkdirSync(path.join(rootDir, 'docs'), { recursive: true })
  writeFileSync(
    path.join(rootDir, 'consumer-md.ts'),
    `import content from './docs/guide.md'\nconsole.log(content)\n`,
  )
}

// ---------------------------------------------------------------------------
// Tests: analyzeExpectedExports
// ---------------------------------------------------------------------------

describe('analyzeExpectedExports', () => {
  let rootDir: string

  beforeEach(() => {
    rootDir = makeTempDir()
  })

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true })
  })

  test('extracts named imports from callsite', () => {
    writeFileSync(
      path.join(rootDir, 'a.ts'),
      `import { alpha, beta } from './missing.js'\n`,
    )

    const unresolved = [
      {
        key: 'a.ts::./missing.js',
        importer: 'a.ts',
        line: 1,
        specifier: './missing.js',
        kind: 'import-from' as const,
        expectedModulePath: 'missing.ts',
        candidatePaths: ['missing.ts'],
        recoverability: 'recoverable' as const,
      },
    ]

    const exports = analyzeExpectedExports(rootDir, unresolved)
    expect(exports).toHaveLength(2)
    expect(exports.find((e) => e.name === 'alpha')).toBeDefined()
    expect(exports.find((e) => e.name === 'beta')).toBeDefined()
    expect(exports.every((e) => !e.isType && !e.isDefault)).toBe(true)
  })

  test('extracts type-only imports', () => {
    writeFileSync(
      path.join(rootDir, 'b.ts'),
      `import type { Foo } from './types.js'\n`,
    )

    const unresolved = [
      {
        key: 'b.ts::./types.js',
        importer: 'b.ts',
        line: 1,
        specifier: './types.js',
        kind: 'import-from' as const,
        expectedModulePath: 'types.ts',
        candidatePaths: ['types.ts'],
        recoverability: 'recoverable' as const,
      },
    ]

    const exports = analyzeExpectedExports(rootDir, unresolved)
    expect(exports).toHaveLength(1)
    expect(exports[0].name).toBe('Foo')
    expect(exports[0].isType).toBe(true)
  })

  test('extracts default imports', () => {
    writeFileSync(
      path.join(rootDir, 'c.ts'),
      `import Widget from './widget.js'\n`,
    )

    const unresolved = [
      {
        key: 'c.ts::./widget.js',
        importer: 'c.ts',
        line: 1,
        specifier: './widget.js',
        kind: 'import-from' as const,
        expectedModulePath: 'widget.ts',
        candidatePaths: ['widget.ts'],
        recoverability: 'recoverable' as const,
      },
    ]

    const exports = analyzeExpectedExports(rootDir, unresolved)
    expect(exports).toHaveLength(1)
    expect(exports[0].isDefault).toBe(true)
  })

  test('extracts re-exported names', () => {
    writeFileSync(
      path.join(rootDir, 'd.ts'),
      `export { helper, utils } from './reexport.js'\n`,
    )

    const unresolved = [
      {
        key: 'd.ts::./reexport.js',
        importer: 'd.ts',
        line: 1,
        specifier: './reexport.js',
        kind: 'export-from' as const,
        expectedModulePath: 'reexport.ts',
        candidatePaths: ['reexport.ts'],
        recoverability: 'recoverable' as const,
      },
    ]

    const exports = analyzeExpectedExports(rootDir, unresolved)
    expect(exports).toHaveLength(2)
    const names = exports.map((e) => e.name).sort()
    expect(names).toEqual(['helper', 'utils'])
  })

  test('deduplicates exports from multiple importers', () => {
    writeFileSync(
      path.join(rootDir, 'x.ts'),
      `import { shared } from './common.js'\n`,
    )
    writeFileSync(
      path.join(rootDir, 'y.ts'),
      `import { shared } from './common.js'\n`,
    )

    const unresolved = [
      {
        key: 'x.ts::./common.js',
        importer: 'x.ts',
        line: 1,
        specifier: './common.js',
        kind: 'import-from' as const,
        expectedModulePath: 'common.ts',
        candidatePaths: ['common.ts'],
        recoverability: 'recoverable' as const,
      },
      {
        key: 'y.ts::./common.js',
        importer: 'y.ts',
        line: 1,
        specifier: './common.js',
        kind: 'import-from' as const,
        expectedModulePath: 'common.ts',
        candidatePaths: ['common.ts'],
        recoverability: 'recoverable' as const,
      },
    ]

    const exports = analyzeExpectedExports(rootDir, unresolved)
    expect(exports).toHaveLength(1)
    expect(exports[0].name).toBe('shared')
  })
})

// ---------------------------------------------------------------------------
// Tests: loadRecoverySources
// ---------------------------------------------------------------------------

describe('loadRecoverySources', () => {
  let rootDir: string

  beforeEach(() => {
    rootDir = makeTempDir()
  })

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true })
  })

  test('returns empty map when sources dir does not exist', () => {
    const sources = loadRecoverySources(rootDir)
    expect(sources.size).toBe(0)
  })

  test('loads files from sources directory', () => {
    const sourcesDir = path.join(rootDir, 'reconstruction', 'sources')
    mkdirSync(path.join(sourcesDir, 'lib'), { recursive: true })
    writeFileSync(
      path.join(sourcesDir, 'lib', 'recovered.ts'),
      'export const value = 42\n',
    )

    const sources = loadRecoverySources(rootDir)
    expect(sources.size).toBe(1)
    expect(sources.has('lib/recovered.ts')).toBe(true)
    expect(sources.get('lib/recovered.ts')!.content).toBe('export const value = 42\n')
    expect(sources.get('lib/recovered.ts')!.sourceKind).toBe('manual-adapted')
  })

  test('handles nested directory structures', () => {
    const sourcesDir = path.join(rootDir, 'reconstruction', 'sources')
    mkdirSync(path.join(sourcesDir, 'a', 'b', 'c'), { recursive: true })
    writeFileSync(path.join(sourcesDir, 'a', 'b', 'c', 'deep.ts'), 'export {}')

    const sources = loadRecoverySources(rootDir)
    expect(sources.has('a/b/c/deep.ts')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Tests: runHydrate (integration)
// ---------------------------------------------------------------------------

describe('runHydrate', () => {
  let rootDir: string

  beforeEach(() => {
    rootDir = makeTempDir()
  })

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true })
  })

  test('generates stubs for unresolved imports', () => {
    seedMinimalProject(rootDir)

    const result = runHydrate(rootDir)

    expect(result.generated).toBeGreaterThan(0)
    expect(result.postScanRuntimeMisses).toBe(0)

    // Stub file should exist
    const stubPath = path.join(rootDir, 'lib', 'greeter.ts')
    expect(existsSync(stubPath)).toBe(true)

    // Stub should contain provenance header
    const content = readFileSync(stubPath, 'utf8')
    expect(content).toContain('RECONSTRUCTION STUB')
    expect(content).toContain('auto-generated by reconstruct-hydrate')
    expect(content).toContain('lib/greeter.ts')
  })

  test('generates stubs with correct named exports', () => {
    seedMinimalProject(rootDir)

    const result = runHydrate(rootDir)
    const stubPath = path.join(rootDir, 'lib', 'greeter.ts')
    const content = readFileSync(stubPath, 'utf8')

    // Should export the `greet` function referenced in entry.ts
    expect(content).toContain('export function greet(')
  })

  test('writes manifest with correct structure', () => {
    seedMinimalProject(rootDir)

    const result = runHydrate(rootDir)

    const manifestPath = path.join(rootDir, 'reconstruction', 'manifest.json')
    expect(existsSync(manifestPath)).toBe(true)

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
    expect(manifest.version).toBe(1)
    expect(manifest.status).toBe('active')
    expect(Array.isArray(manifest.entries)).toBe(true)
    expect(Array.isArray(manifest.unresolvedRuntimeBaseline)).toBe(true)
  })

  test('manifest entries have all required fields', () => {
    seedMinimalProject(rootDir)

    const result = runHydrate(rootDir)

    for (const entry of result.manifest.entries) {
      expect(typeof entry.modulePath).toBe('string')
      expect(['recovered_exact', 'recovered_adapted', 'stubbed']).toContain(entry.status)
      expect(['npm-tarball', 'public-repo', 'manual-adapted', 'auto-stub']).toContain(entry.sourceKind)
      expect(typeof entry.sourceRef).toBe('string')
      expect(typeof entry.hash).toBe('string')
      expect(entry.hash.length).toBe(16)
      expect(typeof entry.updatedAt).toBe('string')
      expect(typeof entry.owner).toBe('string')
    }
  })

  test('manifest entries are sorted by modulePath', () => {
    seedMultiImportProject(rootDir)

    const result = runHydrate(rootDir)
    const paths = result.manifest.entries.map((e) => e.modulePath)
    const sorted = [...paths].sort()
    expect(paths).toEqual(sorted)
  })

  test('writes hydration-delta.json report', () => {
    seedMinimalProject(rootDir)

    runHydrate(rootDir)

    const deltaPath = path.join(rootDir, 'reconstruction', 'reports', 'hydration-delta.json')
    expect(existsSync(deltaPath)).toBe(true)

    const delta = JSON.parse(readFileSync(deltaPath, 'utf8'))
    expect(delta.version).toBe(1)
    expect(typeof delta.generatedAt).toBe('string')
    expect(delta.preScanRuntimeMisses).toBeGreaterThan(0)
    expect(delta.postScanRuntimeMisses).toBe(0)
    expect(Array.isArray(delta.resolvedByHydration)).toBe(true)
    expect(Array.isArray(delta.stillUnresolved)).toBe(true)
  })

  test('recovery sources take priority over auto-stubs', () => {
    seedMinimalProject(rootDir)

    // Place a recovery source
    const sourcesDir = path.join(rootDir, 'reconstruction', 'sources')
    mkdirSync(path.join(sourcesDir, 'lib'), { recursive: true })
    writeFileSync(
      path.join(sourcesDir, 'lib', 'greeter.ts'),
      `export function greet(name: string): string { return \`Hello \${name}\` }\n`,
    )

    const result = runHydrate(rootDir)

    expect(result.recovered).toBeGreaterThanOrEqual(1)

    // The file should contain the recovered content, not a stub
    const content = readFileSync(path.join(rootDir, 'lib', 'greeter.ts'), 'utf8')
    expect(content).toContain('Hello')
    expect(content).not.toContain('RECONSTRUCTION STUB')

    // Manifest should reflect recovered status
    const recovered = result.manifest.entries.find(
      (e) => e.modulePath === 'lib/greeter.ts',
    )
    expect(recovered).toBeDefined()
    expect(recovered!.status).toBe('recovered_adapted')
    expect(recovered!.sourceKind).toBe('manual-adapted')
  })

  test('preserves already-existing files without overwriting', () => {
    seedMinimalProject(rootDir)

    // Pre-create the missing module — scan will not report it as unresolved
    mkdirSync(path.join(rootDir, 'lib'), { recursive: true })
    const originalContent = `export function greet(name: string) { return name }\n`
    writeFileSync(path.join(rootDir, 'lib', 'greeter.ts'), originalContent)

    const result = runHydrate(rootDir)

    // Pre-existing module should not appear in scan results, so 0 generated
    expect(result.generated).toBe(0)
    expect(result.preScanRuntimeMisses).toBe(0)

    // Content should be untouched
    const content = readFileSync(path.join(rootDir, 'lib', 'greeter.ts'), 'utf8')
    expect(content).toBe(originalContent)
  })

  test('is idempotent — running twice produces same result', () => {
    seedMinimalProject(rootDir)

    const result1 = runHydrate(rootDir)
    expect(result1.generated).toBeGreaterThan(0)

    const result2 = runHydrate(rootDir)

    // Second run: stubs already exist, scanner finds 0 unresolved
    expect(result2.generated).toBe(0)
    expect(result2.preScanRuntimeMisses).toBe(0)
    expect(result2.postScanRuntimeMisses).toBe(0)

    // Manifest should be rewritten but with no entries (0 unresolved = 0 modules to track)
    // The previous manifest's entries are gone because no module appears in scan
    expect(result2.manifest.status).toBe('active')
  })

  test('generates .d.ts stubs for declaration imports', () => {
    // Use a standalone project with just the .d.ts import
    const dtsRoot = makeTempDir()
    try {
      writeFileSync(
        path.join(dtsRoot, 'entry.ts'),
        `import './globals.d.ts'\nconst x = 1\n`,
      )
      mkdirSync(path.join(dtsRoot, 'reconstruction'), { recursive: true })
      writeFileSync(
        path.join(dtsRoot, 'reconstruction', 'features.json'),
        JSON.stringify({
          version: 1,
          generatedAt: '2026-04-03T00:00:00.000Z',
          flags: Object.fromEntries(
            Array.from({ length: 95 }, (_, i) => [`FLAG_${i}`, false]),
          ),
        }),
      )
      writeFileSync(
        path.join(dtsRoot, 'reconstruction', 'macros.json'),
        JSON.stringify({
          version: 1,
          generatedAt: '2026-04-03T00:00:00.000Z',
          macros: {
            VERSION: '0.0.0-test',
            BUILD_TIME: '2026-04-03T00:00:00.000Z',
            PACKAGE_URL: 'test',
            NATIVE_PACKAGE_URL: null,
            FEEDBACK_CHANNEL: 'test',
            ISSUES_EXPLAINER: 'test',
            VERSION_CHANGELOG: '',
          },
        }),
      )

      runHydrate(dtsRoot)

      const dtsPath = path.join(dtsRoot, 'globals.d.ts')
      expect(existsSync(dtsPath)).toBe(true)
      const content = readFileSync(dtsPath, 'utf8')
      expect(content).toContain('RECONSTRUCTION STUB (declaration)')
    } finally {
      rmSync(dtsRoot, { recursive: true, force: true })
    }
  })

  test('generates .md stubs for markdown imports', () => {
    seedMultiImportProject(rootDir)

    runHydrate(rootDir)

    const mdPath = path.join(rootDir, 'docs', 'guide.md')
    expect(existsSync(mdPath)).toBe(true)
    const content = readFileSync(mdPath, 'utf8')
    expect(content).toContain('reconstruction stub')
    expect(content).toContain('# guide')
  })

  test('generates type exports for type-only imports', () => {
    seedMultiImportProject(rootDir)

    runHydrate(rootDir)

    const typedPath = path.join(rootDir, 'lib', 'typed.ts')
    expect(existsSync(typedPath)).toBe(true)
    const content = readFileSync(typedPath, 'utf8')
    expect(content).toContain('export type MyType')
  })

  test('generates default export for default imports', () => {
    seedMultiImportProject(rootDir)

    runHydrate(rootDir)

    const widgetPath = path.join(rootDir, 'lib', 'widget.ts')
    expect(existsSync(widgetPath)).toBe(true)
    const content = readFileSync(widgetPath, 'utf8')
    expect(content).toContain('export default function Widget(')
  })

  test('generates empty module for dynamic imports', () => {
    seedMultiImportProject(rootDir)

    runHydrate(rootDir)

    const lazyPath = path.join(rootDir, 'lib', 'lazy.ts')
    expect(existsSync(lazyPath)).toBe(true)
    const content = readFileSync(lazyPath, 'utf8')
    expect(content).toContain('export {}')
  })

  test('generates re-exported named stubs', () => {
    seedMultiImportProject(rootDir)

    runHydrate(rootDir)

    const reexportPath = path.join(rootDir, 'lib', 'reexported.ts')
    expect(existsSync(reexportPath)).toBe(true)
    const content = readFileSync(reexportPath, 'utf8')
    expect(content).toContain('export function helper(')
  })
})

// ---------------------------------------------------------------------------
// Tests: validateManifestCoverage (spec 2.3.3)
// ---------------------------------------------------------------------------

describe('validateManifestCoverage', () => {
  let rootDir: string

  beforeEach(() => {
    rootDir = makeTempDir()
  })

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true })
  })

  test('returns invalid when manifest does not exist', () => {
    seedMinimalProject(rootDir)
    const result = validateManifestCoverage(rootDir)
    expect(result.valid).toBe(false)
  })

  test('returns valid after full hydration', () => {
    seedMinimalProject(rootDir)
    runHydrate(rootDir)
    const result = validateManifestCoverage(rootDir)
    expect(result.valid).toBe(true)
    expect(result.missingEntries).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Tests: stub runtime behavior
// ---------------------------------------------------------------------------

describe('stub runtime behavior', () => {
  let rootDir: string

  beforeEach(() => {
    rootDir = makeTempDir()
  })

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true })
  })

  test('stub functions throw with actionable error messages', () => {
    seedMinimalProject(rootDir)
    runHydrate(rootDir)

    const stubPath = path.join(rootDir, 'lib', 'greeter.ts')
    const content = readFileSync(stubPath, 'utf8')

    // Verify error message contains module path and guidance
    expect(content).toContain('[reconstruction]')
    expect(content).toContain('lib/greeter.ts')
    expect(content).toContain('stub')
    expect(content).toContain('manifest.json')
  })

  test('stubs include provenance header with required fields', () => {
    seedMinimalProject(rootDir)
    runHydrate(rootDir)

    const stubPath = path.join(rootDir, 'lib', 'greeter.ts')
    const content = readFileSync(stubPath, 'utf8')

    expect(content).toContain('source: auto-stub')
    expect(content).toContain('module: lib/greeter.ts')
    expect(content).toContain('status: stubbed')
    expect(content).toContain('retrievedAt:')
    expect(content).toContain('transform:')
  })
})

// ---------------------------------------------------------------------------
// Tests: baseline enforcement after hydration
// ---------------------------------------------------------------------------

describe('baseline enforcement', () => {
  let rootDir: string

  beforeEach(() => {
    rootDir = makeTempDir()
  })

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true })
  })

  test('manifest unresolvedRuntimeBaseline captures all pre-hydration import keys', () => {
    seedMinimalProject(rootDir)

    const result = runHydrate(rootDir)

    expect(result.manifest.unresolvedRuntimeBaseline.length).toBe(
      result.preScanRuntimeMisses,
    )

    // All baseline entries should be strings in "importer::specifier" format
    for (const key of result.manifest.unresolvedRuntimeBaseline) {
      expect(typeof key).toBe('string')
      expect(key).toContain('::')
    }
  })
})
