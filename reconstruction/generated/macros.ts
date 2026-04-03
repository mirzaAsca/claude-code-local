// Generated file. Do not edit directly.
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

export const MACRO: MacroValues = {
  "VERSION": "0.0.0-local",
  "BUILD_TIME": "2026-04-03T00:00:00.000Z",
  "PACKAGE_URL": "@anthropic-ai/claude-code",
  "NATIVE_PACKAGE_URL": null,
  "FEEDBACK_CHANNEL": "https://github.com/anthropics/claude-code/issues",
  "ISSUES_EXPLAINER": "https://github.com/anthropics/claude-code/issues",
  "VERSION_CHANGELOG": ""
}

const globalScope = globalThis as typeof globalThis & { MACRO?: MacroValues }
globalScope.MACRO = MACRO

