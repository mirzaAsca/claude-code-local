import { readFileSync } from 'fs'
import path from 'path'
import {
  readAndValidateFeatureConfig,
  readAndValidateMacroConfig,
} from '../reconstruction/config.js'

const REQUIRED_REPORT_FILES = [
  'unresolved-runtime.json',
  'unresolved-types.json',
  'scan-summary.json',
] as const

function validateReconstructionConfigFiles(rootDir: string): void {
  const reconstructionDir = path.join(rootDir, 'reconstruction')
  readAndValidateFeatureConfig(path.join(reconstructionDir, 'features.json'))
  readAndValidateMacroConfig(path.join(reconstructionDir, 'macros.json'))
}

function readRequiredReport(
  reportsDir: string,
  filename: (typeof REQUIRED_REPORT_FILES)[number],
): unknown {
  const fullPath = path.join(reportsDir, filename)

  try {
    return JSON.parse(readFileSync(fullPath, 'utf8')) as unknown
  } catch {
    throw new Error(`Missing or invalid JSON report: ${fullPath}`)
  }
}

export function runVerify(rootDir: string = process.cwd()): number {
  try {
    validateReconstructionConfigFiles(rootDir)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error)
    console.error(`Invalid reconstruction config: ${message}`)
    return 1
  }

  const reportsDir = path.join(rootDir, 'reconstruction', 'reports')

  let parsedReports: unknown[]
  try {
    parsedReports = REQUIRED_REPORT_FILES.map((filename) =>
      readRequiredReport(reportsDir, filename),
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error)
    console.error(message)
    return 1
  }

  const unresolvedRuntime = parsedReports[0] as {
    status?: string
    unresolved?: unknown[]
  }

  if (unresolvedRuntime.status === 'not_implemented') {
    console.warn(
      'reconstruct:verify is running in scaffold mode. Implement Item 2.1/2.2 for authoritative verification.',
    )
  }

  const unresolvedCount = Array.isArray(unresolvedRuntime.unresolved)
    ? unresolvedRuntime.unresolved.length
    : 0

  console.log(
    `reconstruct:verify completed (scaffold mode). unresolved runtime entries: ${unresolvedCount}`,
  )
  return 0
}

if (import.meta.main) {
  process.exit(runVerify())
}
