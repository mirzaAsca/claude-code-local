import { describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { FEATURE_FLAG_KEYS } from '../reconstruction/config.js'
import { runVerify } from './reconstruct-verify.ts'

function makeValidFeaturesConfig(): Record<string, unknown> {
  return {
    version: 1,
    generatedAt: '2026-04-03T00:00:00.000Z',
    notes: 'test',
    flags: Object.fromEntries(FEATURE_FLAG_KEYS.map((key) => [key, false])),
  }
}

function makeValidMacrosConfig(): Record<string, unknown> {
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

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function setupVerifyFixture(rootDir: string): void {
  const reconstructionDir = path.join(rootDir, 'reconstruction')
  const reportsDir = path.join(reconstructionDir, 'reports')
  mkdirSync(reportsDir, { recursive: true })

  writeJson(path.join(reconstructionDir, 'features.json'), makeValidFeaturesConfig())
  writeJson(path.join(reconstructionDir, 'macros.json'), makeValidMacrosConfig())
  writeJson(path.join(reportsDir, 'unresolved-runtime.json'), {
    unresolved: [],
  })
  writeJson(path.join(reportsDir, 'unresolved-types.json'), {
    unresolved: [],
  })
  writeJson(path.join(reportsDir, 'scan-summary.json'), {
    filesScanned: 0,
  })
}

describe('runVerify', () => {
  test('returns 0 for valid reconstruction config and reports', () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), 'reconstruct-verify-test-'))
    setupVerifyFixture(rootDir)

    expect(runVerify(rootDir)).toBe(0)
  })

  test('returns 1 when reconstruction config fails schema checks', () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), 'reconstruct-verify-test-'))
    setupVerifyFixture(rootDir)

    writeJson(path.join(rootDir, 'reconstruction', 'features.json'), {
      ...makeValidFeaturesConfig(),
      extra: true,
    })

    expect(runVerify(rootDir)).toBe(1)
  })
})
