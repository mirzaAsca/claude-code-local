import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'

export type MacroValues = {
  VERSION: string
  BUILD_TIME: string
  PACKAGE_URL: string
  NATIVE_PACKAGE_URL: string | null
  FEEDBACK_CHANNEL: string
  ISSUES_EXPLAINER: string
  VERSION_CHANGELOG: string
}

export type MacroConfig = {
  version: number
  generatedAt: string
  notes?: string
  macros: MacroValues
}

const MACRO_CONFIG_PATH = path.join('reconstruction', 'macros.json')
const GENERATED_DIR_PATH = path.join('reconstruction', 'generated')

const TOP_LEVEL_KEYS = new Set(['version', 'generatedAt', 'notes', 'macros'])
export const MACRO_KEYS = [
  'VERSION',
  'BUILD_TIME',
  'PACKAGE_URL',
  'NATIVE_PACKAGE_URL',
  'FEEDBACK_CHANNEL',
  'ISSUES_EXPLAINER',
  'VERSION_CHANGELOG',
] as const

export function assertObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

export function assertNoUnknownKeys(
  record: Record<string, unknown>,
  allowedKeys: Set<string>,
  label: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${label} has unknown key: ${key}`)
    }
  }
}

export function assertString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`)
  }
  return value
}

export function parseAndValidateConfig(parsed: unknown): MacroConfig {
  const topLevel = assertObject(parsed, 'reconstruction/macros.json')
  assertNoUnknownKeys(topLevel, TOP_LEVEL_KEYS, 'reconstruction/macros.json')

  const version = topLevel.version
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    throw new Error('reconstruction/macros.json version must be an integer')
  }

  const generatedAt = assertString(topLevel.generatedAt, 'generatedAt')
  if (!generatedAt) {
    throw new Error('generatedAt cannot be empty')
  }

  if (
    topLevel.notes !== undefined &&
    typeof topLevel.notes !== 'string'
  ) {
    throw new Error('notes must be a string when provided')
  }

  const macroRecord = assertObject(topLevel.macros, 'macros')
  const allowedMacroKeys = new Set<string>(MACRO_KEYS)
  assertNoUnknownKeys(macroRecord, allowedMacroKeys, 'macros')

  for (const key of MACRO_KEYS) {
    if (!(key in macroRecord)) {
      throw new Error(`macros is missing required key: ${key}`)
    }
  }

  const config: MacroConfig = {
    version,
    generatedAt,
    notes: topLevel.notes as string | undefined,
    macros: {
      VERSION: assertString(macroRecord.VERSION, 'macros.VERSION'),
      BUILD_TIME: assertString(macroRecord.BUILD_TIME, 'macros.BUILD_TIME'),
      PACKAGE_URL: assertString(macroRecord.PACKAGE_URL, 'macros.PACKAGE_URL'),
      NATIVE_PACKAGE_URL:
        macroRecord.NATIVE_PACKAGE_URL === null
          ? null
          : assertString(
              macroRecord.NATIVE_PACKAGE_URL,
              'macros.NATIVE_PACKAGE_URL',
            ),
      FEEDBACK_CHANNEL: assertString(
        macroRecord.FEEDBACK_CHANNEL,
        'macros.FEEDBACK_CHANNEL',
      ),
      ISSUES_EXPLAINER: assertString(
        macroRecord.ISSUES_EXPLAINER,
        'macros.ISSUES_EXPLAINER',
      ),
      VERSION_CHANGELOG: assertString(
        macroRecord.VERSION_CHANGELOG,
        'macros.VERSION_CHANGELOG',
      ),
    },
  }

  return config
}

export function readAndValidateConfig(configPath: string): MacroConfig {
  const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as unknown
  return parseAndValidateConfig(parsed)
}

export function buildGeneratedMacroModule(config: MacroConfig): string {
  const macrosLiteral = JSON.stringify(config.macros, null, 2)
  return `// Generated file. Do not edit directly.
// Source: reconstruction/macros.json
// Regenerate with: bun run reconstruct:macros

export type MacroValues = {
  VERSION: string
  BUILD_TIME: string
  PACKAGE_URL: string
  NATIVE_PACKAGE_URL: string | null
  FEEDBACK_CHANNEL: string
  ISSUES_EXPLAINER: string
  VERSION_CHANGELOG: string
}

export const MACRO: MacroValues = ${macrosLiteral}

const globalScope = globalThis as typeof globalThis & { MACRO?: MacroValues }
globalScope.MACRO = MACRO
`
}

export function buildGeneratedMacroDeclaration(): string {
  return `// Generated file. Do not edit directly.
// Source: reconstruction/macros.json
// Regenerate with: bun run reconstruct:macros

import type { MacroValues } from './macros.js'

declare global {
  const MACRO: MacroValues
}

export {}
`
}

export function generateMacroArtifacts(rootDir: string): {
  configPath: string
  generatedDir: string
  generatedModulePath: string
  generatedDeclarationPath: string
} {
  const configPath = path.join(rootDir, MACRO_CONFIG_PATH)
  const generatedDir = path.join(rootDir, GENERATED_DIR_PATH)
  const generatedModulePath = path.join(generatedDir, 'macros.ts')
  const generatedDeclarationPath = path.join(
    generatedDir,
    'macro-globals.d.ts',
  )

  const config = readAndValidateConfig(configPath)
  mkdirSync(generatedDir, { recursive: true })

  writeFileSync(generatedModulePath, `${buildGeneratedMacroModule(config)}\n`)
  writeFileSync(
    generatedDeclarationPath,
    `${buildGeneratedMacroDeclaration()}\n`,
  )

  return {
    configPath,
    generatedDir,
    generatedModulePath,
    generatedDeclarationPath,
  }
}

export function main(rootDir: string = process.cwd()): void {
  const { generatedDir } = generateMacroArtifacts(rootDir)
  console.log(`Generated macro compatibility files in ${generatedDir}`)
}

if (import.meta.main) {
  main()
}
