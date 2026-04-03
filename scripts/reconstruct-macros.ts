import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import {
  MACRO_KEYS,
  type MacroConfig,
  parseAndValidateMacroConfig,
  readAndValidateMacroConfig,
} from '../reconstruction/config.js'

export { MACRO_KEYS, type MacroConfig }

const MACRO_CONFIG_PATH = path.join('reconstruction', 'macros.json')
const GENERATED_DIR_PATH = path.join('reconstruction', 'generated')

export function parseAndValidateConfig(parsed: unknown): MacroConfig {
  return parseAndValidateMacroConfig(parsed)
}

export function readAndValidateConfig(configPath: string): MacroConfig {
  return readAndValidateMacroConfig(configPath)
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
