import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import {
  buildGeneratedMacroDeclaration,
  buildGeneratedMacroModule,
  generateMacroArtifacts,
  parseAndValidateConfig,
  type MacroConfig,
} from './reconstruct-macros.ts'

function makeValidConfig(): MacroConfig {
  return {
    version: 1,
    generatedAt: '2026-04-03T00:00:00.000Z',
    notes: 'test',
    macros: {
      VERSION: '0.0.0-test',
      BUILD_TIME: '2026-04-03T00:00:00.000Z',
      PACKAGE_URL: '@anthropic-ai/claude-code',
      NATIVE_PACKAGE_URL: null,
      FEEDBACK_CHANNEL: 'https://example.test/feedback',
      ISSUES_EXPLAINER: 'https://example.test/issues',
      VERSION_CHANGELOG: '',
    },
  }
}

describe('parseAndValidateConfig', () => {
  test('accepts a valid macro config', () => {
    const config = makeValidConfig()
    expect(parseAndValidateConfig(config)).toEqual(config)
  })

  test('rejects unknown top-level keys', () => {
    const config = {
      ...makeValidConfig(),
      extra: true,
    }

    expect(() => parseAndValidateConfig(config)).toThrow(
      'reconstruction/macros.json has unknown key: extra',
    )
  })

  test('rejects non-ISO generatedAt', () => {
    const config = {
      ...makeValidConfig(),
      generatedAt: 'not-a-date',
    }

    expect(() => parseAndValidateConfig(config)).toThrow(
      'reconstruction/macros.json generatedAt must be an ISO-8601 date string',
    )
  })

  test('rejects unknown macro keys', () => {
    const config = makeValidConfig() as MacroConfig & {
      macros: Record<string, unknown>
    }
    config.macros = {
      ...config.macros,
      EXTRA_MACRO: 'x',
    }

    expect(() => parseAndValidateConfig(config)).toThrow(
      'reconstruction/macros.json macros has unknown key: EXTRA_MACRO',
    )
  })

  test('rejects missing required macro keys', () => {
    const config = makeValidConfig() as MacroConfig & {
      macros: Record<string, unknown>
    }
    delete config.macros.VERSION

    expect(() => parseAndValidateConfig(config)).toThrow(
      'reconstruction/macros.json macros is missing required key: VERSION',
    )
  })
})

describe('macro artifact generation', () => {
  test('buildGeneratedMacroModule embeds macro values and global assignment', () => {
    const moduleText = buildGeneratedMacroModule(makeValidConfig())
    expect(moduleText).toContain('export const MACRO: MacroValues = {')
    expect(moduleText).toContain('"VERSION": "0.0.0-test"')
    expect(moduleText).toContain('globalScope.MACRO = MACRO')
  })

  test('buildGeneratedMacroDeclaration declares global MACRO', () => {
    const dtsText = buildGeneratedMacroDeclaration()
    expect(dtsText).toContain("import type { MacroValues } from './macros.js'")
    expect(dtsText).toContain('declare global {')
    expect(dtsText).toContain('const MACRO: MacroValues')
  })

  test('generateMacroArtifacts writes macros.ts and macro-globals.d.ts', () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), 'reconstruct-macros-test-'))
    const reconstructionDir = path.join(rootDir, 'reconstruction')
    mkdirSync(reconstructionDir, { recursive: true })
    writeFileSync(
      path.join(reconstructionDir, 'macros.json'),
      `${JSON.stringify(makeValidConfig(), null, 2)}\n`,
    )

    const {
      generatedDir,
      generatedModulePath,
      generatedDeclarationPath,
    } = generateMacroArtifacts(rootDir)

    const generatedModule = readFileSync(generatedModulePath, 'utf8')
    const generatedDeclaration = readFileSync(generatedDeclarationPath, 'utf8')

    expect(generatedDir).toBe(path.join(rootDir, 'reconstruction', 'generated'))
    expect(generatedModule).toContain('"VERSION": "0.0.0-test"')
    expect(generatedModule).toContain('globalScope.MACRO = MACRO')
    expect(generatedDeclaration).toContain('declare global {')
    expect(generatedDeclaration).toContain('const MACRO: MacroValues')
  })
})
