import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'fs'
import path from 'path'

export type ImportKind =
  | 'import-from'
  | 'import-side-effect'
  | 'export-from'
  | 'dynamic-import'

export type ImportReference = {
  importerPath: string
  specifier: string
  kind: ImportKind
  isTypeOnly: boolean
  line: number
}

export type UnresolvedImport = {
  key: string
  importer: string
  line: number
  specifier: string
  kind: ImportKind
  expectedModulePath: string
  candidatePaths: string[]
  recoverability: 'recoverable' | 'non_recoverable'
}

export type ScanProjectResult = {
  generatedAt: string
  filesScanned: number
  importReferencesScanned: number
  unresolvedRuntime: UnresolvedImport[]
  unresolvedTypes: UnresolvedImport[]
}

export type RuntimeBaseline = {
  enabled: boolean
  manifestPath: string
  knownImportKeys: Set<string>
  knownModulePaths: Set<string>
}

export type ScanRunResult = {
  exitCode: number
  reportsDir: string
  scan: ScanProjectResult
  baseline: RuntimeBaseline
  newRuntimeMisses: UnresolvedImport[]
}

const SOURCE_FILE_EXTENSIONS = new Set(['.ts', '.tsx'])
const EXCLUDED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist'])
const RESOLUTION_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json']

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/')
}

function normalizeModulePath(rootDir: string, filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  if (path.isAbsolute(normalized)) {
    return toPosixPath(path.relative(rootDir, normalized))
  }
  return normalized.replace(/^\.\//, '')
}

function getLineNumber(content: string, index: number): number {
  let line = 1
  for (let i = 0; i < index; i += 1) {
    if (content.charCodeAt(i) === 10) {
      line += 1
    }
  }
  return line
}

function isTypeOnlyNamedClause(rawClause: string): boolean {
  const clause = rawClause.trim()
  if (!clause.startsWith('{')) {
    return false
  }

  const closingBraceIndex = clause.lastIndexOf('}')
  if (closingBraceIndex === -1) {
    return false
  }

  const trailing = clause.slice(closingBraceIndex + 1).trim()
  if (trailing.length > 0) {
    return false
  }

  const inside = clause.slice(1, closingBraceIndex).trim()
  if (!inside) {
    return false
  }

  const specifiers = inside
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  if (specifiers.length === 0) {
    return false
  }

  return specifiers.every((specifier) => specifier.startsWith('type '))
}

export function parseImportReferences(
  importerPath: string,
  content: string,
): ImportReference[] {
  const refs: ImportReference[] = []

  const importFromPattern = /\bimport\s+(type\s+)?([\s\S]*?)\s+from\s*(['"])([^'"]+)\3/gm
  for (const match of content.matchAll(importFromPattern)) {
    const explicitType = Boolean(match[1])
    const clause = match[2] ?? ''
    const specifier = match[4]
    const line = getLineNumber(content, match.index ?? 0)
    refs.push({
      importerPath,
      specifier,
      kind: 'import-from',
      isTypeOnly: explicitType || isTypeOnlyNamedClause(clause),
      line,
    })
  }

  const importSideEffectPattern = /(?:^|[;\n\r])\s*import\s*(['"])([^'"]+)\1/gm
  for (const match of content.matchAll(importSideEffectPattern)) {
    const specifier = match[2]
    const line = getLineNumber(content, match.index ?? 0)
    refs.push({
      importerPath,
      specifier,
      kind: 'import-side-effect',
      isTypeOnly: false,
      line,
    })
  }

  const exportFromPattern = /\bexport\s+(type\s+)?([\s\S]*?)\s+from\s*(['"])([^'"]+)\3/gm
  for (const match of content.matchAll(exportFromPattern)) {
    const explicitType = Boolean(match[1])
    const clause = match[2] ?? ''
    const specifier = match[4]
    const line = getLineNumber(content, match.index ?? 0)
    refs.push({
      importerPath,
      specifier,
      kind: 'export-from',
      isTypeOnly: explicitType || isTypeOnlyNamedClause(clause),
      line,
    })
  }

  const dynamicImportPattern = /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/gm
  for (const match of content.matchAll(dynamicImportPattern)) {
    const specifier = match[2]
    const line = getLineNumber(content, match.index ?? 0)
    refs.push({
      importerPath,
      specifier,
      kind: 'dynamic-import',
      isTypeOnly: false,
      line,
    })
  }

  return refs
}

function addUniqueCandidate(list: string[], candidate: string): void {
  if (!list.includes(candidate)) {
    list.push(candidate)
  }
}

function createResolutionCandidates(basePath: string, extension: string): string[] {
  const candidates: string[] = []

  if (extension) {
    if (extension === '.js') {
      addUniqueCandidate(candidates, `${basePath.slice(0, -3)}.ts`)
      addUniqueCandidate(candidates, `${basePath.slice(0, -3)}.tsx`)
      addUniqueCandidate(candidates, `${basePath.slice(0, -3)}.mts`)
      addUniqueCandidate(candidates, `${basePath.slice(0, -3)}.cts`)
    } else if (extension === '.mjs') {
      addUniqueCandidate(candidates, `${basePath.slice(0, -4)}.mts`)
    } else if (extension === '.cjs') {
      addUniqueCandidate(candidates, `${basePath.slice(0, -4)}.cts`)
    }

    addUniqueCandidate(candidates, basePath)
    return candidates
  }

  for (const ext of RESOLUTION_EXTENSIONS) {
    addUniqueCandidate(candidates, `${basePath}${ext}`)
  }

  for (const ext of RESOLUTION_EXTENSIONS) {
    addUniqueCandidate(candidates, path.join(basePath, `index${ext}`))
  }

  return candidates
}

function classifySpecifier(
  specifier: string,
): 'relative' | 'src-alias' | 'absolute' | 'external' {
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    return 'relative'
  }

  if (/^src\/+/.test(specifier)) {
    return 'src-alias'
  }

  if (specifier.startsWith('/')) {
    return 'absolute'
  }

  return 'external'
}

function isFile(pathToCheck: string): boolean {
  try {
    return statSync(pathToCheck).isFile()
  } catch {
    return false
  }
}

export type ImportResolution = {
  isLocal: boolean
  resolvedPath?: string
  expectedModulePath?: string
  candidatePaths: string[]
  recoverability: 'recoverable' | 'non_recoverable'
}

export function resolveProjectImport(
  rootDir: string,
  importerPath: string,
  specifier: string,
): ImportResolution {
  const kind = classifySpecifier(specifier)
  if (kind === 'external') {
    return {
      isLocal: false,
      candidatePaths: [],
      recoverability: 'non_recoverable',
    }
  }

  let basePath: string
  if (kind === 'relative') {
    basePath = path.resolve(path.dirname(importerPath), specifier)
  } else if (kind === 'src-alias') {
    const trimmed = specifier.replace(/^src\/+/, '')
    basePath = path.resolve(rootDir, trimmed)
  } else {
    basePath = path.resolve(specifier)
  }

  const extension = path.extname(basePath)
  const candidates = createResolutionCandidates(basePath, extension)
  const resolvedPath = candidates.find((candidate) => isFile(candidate))
  const expectedModulePath = candidates.length > 0
    ? normalizeModulePath(rootDir, candidates[0])
    : normalizeModulePath(rootDir, basePath)

  return {
    isLocal: true,
    resolvedPath,
    expectedModulePath,
    candidatePaths: candidates.map((candidate) => normalizeModulePath(rootDir, candidate)),
    recoverability: 'recoverable',
  }
}

export function collectSourceFiles(rootDir: string): string[] {
  const files: string[] = []

  function walk(currentDir: string): void {
    const entries = readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)

      if (entry.isDirectory()) {
        if (EXCLUDED_DIRECTORIES.has(entry.name)) {
          continue
        }
        walk(fullPath)
        continue
      }

      if (!entry.isFile()) {
        continue
      }

      const extension = path.extname(entry.name)
      if (SOURCE_FILE_EXTENSIONS.has(extension)) {
        files.push(fullPath)
      }
    }
  }

  walk(rootDir)
  return files
}

export function scanProject(rootDir: string): ScanProjectResult {
  const files = collectSourceFiles(rootDir)
  const unresolvedRuntime: UnresolvedImport[] = []
  const unresolvedTypes: UnresolvedImport[] = []
  let importReferencesScanned = 0

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf8')
    const refs = parseImportReferences(filePath, content)
    importReferencesScanned += refs.length

    for (const ref of refs) {
      const resolution = resolveProjectImport(rootDir, filePath, ref.specifier)
      if (!resolution.isLocal || resolution.resolvedPath) {
        continue
      }

      const importer = normalizeModulePath(rootDir, filePath)
      const expectedModulePath = resolution.expectedModulePath ?? ref.specifier
      const baselineKey = `${importer}::${ref.specifier}`

      const unresolved: UnresolvedImport = {
        key: baselineKey,
        importer,
        line: ref.line,
        specifier: ref.specifier,
        kind: ref.kind,
        expectedModulePath,
        candidatePaths: resolution.candidatePaths,
        recoverability: resolution.recoverability,
      }

      if (ref.isTypeOnly) {
        unresolvedTypes.push(unresolved)
      } else {
        unresolvedRuntime.push(unresolved)
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    filesScanned: files.length,
    importReferencesScanned,
    unresolvedRuntime,
    unresolvedTypes,
  }
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item) => typeof item === 'string')
    .map((item) => item.replace(/\\/g, '/').replace(/^\.\//, ''))
}

export function loadRuntimeBaseline(rootDir: string): RuntimeBaseline {
  const manifestPath = path.join(rootDir, 'reconstruction', 'manifest.json')
  const knownImportKeys = new Set<string>()
  const knownModulePaths = new Set<string>()

  if (!existsSync(manifestPath)) {
    return {
      enabled: false,
      manifestPath,
      knownImportKeys,
      knownModulePaths,
    }
  }

  let manifest: Record<string, unknown>
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
  } catch {
    return {
      enabled: false,
      manifestPath,
      knownImportKeys,
      knownModulePaths,
    }
  }

  for (const key of ['runtimeImportBaseline', 'runtimeMissingBaseline', 'unresolvedRuntimeBaseline']) {
    for (const importKey of readStringArray(manifest[key])) {
      knownImportKeys.add(importKey)
    }
  }

  const entries = manifest.entries
  if (Array.isArray(entries)) {
    for (const entry of entries) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        continue
      }
      const modulePath = (entry as Record<string, unknown>).modulePath
      if (typeof modulePath === 'string') {
        knownModulePaths.add(normalizeModulePath(rootDir, modulePath))
      }
    }
  }

  return {
    enabled: knownImportKeys.size > 0 || knownModulePaths.size > 0,
    manifestPath,
    knownImportKeys,
    knownModulePaths,
  }
}

export function computeNewRuntimeMisses(
  unresolvedRuntime: UnresolvedImport[],
  baseline: RuntimeBaseline,
): UnresolvedImport[] {
  if (!baseline.enabled) {
    return []
  }

  return unresolvedRuntime.filter((entry) => {
    if (baseline.knownImportKeys.has(entry.key)) {
      return false
    }

    return !baseline.knownModulePaths.has(entry.expectedModulePath)
  })
}

function writeJsonFile(filePath: string, payload: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`)
}

export function runScan(rootDir: string = process.cwd()): ScanRunResult {
  const reportsDir = path.join(rootDir, 'reconstruction', 'reports')
  mkdirSync(reportsDir, { recursive: true })

  const scan = scanProject(rootDir)
  const baseline = loadRuntimeBaseline(rootDir)
  const newRuntimeMisses = computeNewRuntimeMisses(
    scan.unresolvedRuntime,
    baseline,
  )

  const failedNewRuntimeMisses = baseline.enabled && newRuntimeMisses.length > 0
  const status = failedNewRuntimeMisses ? 'failed_new_runtime_missing' : 'ok'

  const unresolvedRuntimeReport = {
    version: 1,
    generatedAt: scan.generatedAt,
    status,
    totalUnresolved: scan.unresolvedRuntime.length,
    newMissingCount: newRuntimeMisses.length,
    unresolved: scan.unresolvedRuntime,
  }

  const unresolvedTypesReport = {
    version: 1,
    generatedAt: scan.generatedAt,
    status: 'ok',
    totalUnresolved: scan.unresolvedTypes.length,
    unresolved: scan.unresolvedTypes,
  }

  const runtimeRecoverableCount = scan.unresolvedRuntime.filter(
    (entry) => entry.recoverability === 'recoverable',
  ).length

  const summary = {
    version: 1,
    generatedAt: scan.generatedAt,
    status,
    filesScanned: scan.filesScanned,
    importReferencesScanned: scan.importReferencesScanned,
    runtimeMisses: scan.unresolvedRuntime.length,
    typeMisses: scan.unresolvedTypes.length,
    recoverableRuntimeMisses: runtimeRecoverableCount,
    nonRecoverableRuntimeMisses:
      scan.unresolvedRuntime.length - runtimeRecoverableCount,
    baseline: {
      enabled: baseline.enabled,
      manifestPath: normalizeModulePath(rootDir, baseline.manifestPath),
      knownImportKeys: baseline.knownImportKeys.size,
      knownModulePaths: baseline.knownModulePaths.size,
      newRuntimeMisses,
    },
  }

  writeJsonFile(
    path.join(reportsDir, 'unresolved-runtime.json'),
    unresolvedRuntimeReport,
  )
  writeJsonFile(
    path.join(reportsDir, 'unresolved-types.json'),
    unresolvedTypesReport,
  )
  writeJsonFile(path.join(reportsDir, 'scan-summary.json'), summary)

  return {
    exitCode: failedNewRuntimeMisses ? 1 : 0,
    reportsDir,
    scan,
    baseline,
    newRuntimeMisses,
  }
}

export function main(rootDir: string = process.cwd()): void {
  const result = runScan(rootDir)

  console.log(`Wrote scan reports to ${result.reportsDir}`)
  console.log(
    `Runtime misses: ${result.scan.unresolvedRuntime.length}; type misses: ${result.scan.unresolvedTypes.length}`,
  )

  if (result.baseline.enabled) {
    console.log(
      `Baseline check active from ${result.baseline.manifestPath} (known imports: ${result.baseline.knownImportKeys.size}, known module paths: ${result.baseline.knownModulePaths.size})`,
    )
  } else {
    console.log('Baseline check disabled (no manifest baseline entries found)')
  }

  if (result.exitCode !== 0) {
    console.error(
      `New unresolved runtime imports detected: ${result.newRuntimeMisses.length}`,
    )
    for (const miss of result.newRuntimeMisses.slice(0, 20)) {
      console.error(
        `  - ${miss.importer}:${miss.line} -> ${miss.specifier} (expected ${miss.expectedModulePath})`,
      )
    }
    process.exit(result.exitCode)
  }
}

if (import.meta.main) {
  main()
}
