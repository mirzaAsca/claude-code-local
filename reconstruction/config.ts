import { readFileSync } from 'fs'

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

export const MACRO_KEYS = [
  'VERSION',
  'BUILD_TIME',
  'PACKAGE_URL',
  'NATIVE_PACKAGE_URL',
  'FEEDBACK_CHANNEL',
  'ISSUES_EXPLAINER',
  'VERSION_CHANGELOG',
] as const

export const FEATURE_FLAG_KEYS = [
  'ABLATION_BASELINE',
  'AGENT_MEMORY_SNAPSHOT',
  'AGENT_TRIGGERS',
  'AGENT_TRIGGERS_REMOTE',
  'ALLOW_TEST_VERSIONS',
  'ANTI_DISTILLATION_CC',
  'AUTO_THEME',
  'AWAY_SUMMARY',
  'BASH_CLASSIFIER',
  'BG_SESSIONS',
  'BREAK_CACHE_COMMAND',
  'BRIDGE_MODE',
  'BUDDY',
  'BUILDING_CLAUDE_APPS',
  'BUILTIN_EXPLORE_PLAN_AGENTS',
  'BYOC_ENVIRONMENT_RUNNER',
  'CACHED_MICROCOMPACT',
  'CCR_AUTO_CONNECT',
  'CCR_MIRROR',
  'CCR_REMOTE_SETUP',
  'CHICAGO_MCP',
  'COMMIT_ATTRIBUTION',
  'COMPACTION_REMINDERS',
  'CONNECTOR_TEXT',
  'CONTEXT_COLLAPSE',
  'COORDINATOR_MODE',
  'COWORKER_TYPE_TELEMETRY',
  'DAEMON',
  'DIRECT_CONNECT',
  'DOWNLOAD_USER_SETTINGS',
  'DUMP_SYSTEM_PROMPT',
  'ENHANCED_TELEMETRY_BETA',
  'EXPERIMENTAL_SKILL_SEARCH',
  'EXTRACT_MEMORIES',
  'FILE_PERSISTENCE',
  'FORK_SUBAGENT',
  'HARD_FAIL',
  'HISTORY_PICKER',
  'HISTORY_SNIP',
  'HOOK_PROMPTS',
  'IS_LIBC_GLIBC',
  'IS_LIBC_MUSL',
  'KAIROS',
  'KAIROS_BRIEF',
  'KAIROS_CHANNELS',
  'KAIROS_DREAM',
  'KAIROS_GITHUB_WEBHOOKS',
  'KAIROS_PUSH_NOTIFICATION',
  'LODESTONE',
  'MCP_RICH_OUTPUT',
  'MCP_SKILLS',
  'MEMORY_SHAPE_TELEMETRY',
  'MESSAGE_ACTIONS',
  'MONITOR_TOOL',
  'NATIVE_CLIENT_ATTESTATION',
  'NATIVE_CLIPBOARD_IMAGE',
  'NEW_INIT',
  'OVERFLOW_TEST_TOOL',
  'PERFETTO_TRACING',
  'POWERSHELL_AUTO_MODE',
  'PROACTIVE',
  'PROMPT_CACHE_BREAK_DETECTION',
  'QUICK_SEARCH',
  'REACTIVE_COMPACT',
  'REVIEW_ARTIFACT',
  'RUN_SKILL_GENERATOR',
  'SELF_HOSTED_RUNNER',
  'SHOT_STATS',
  'SKILL_IMPROVEMENT',
  'SKIP_DETECTION_WHEN_AUTOUPDATES_DISABLED',
  'SLOW_OPERATION_LOGGING',
  'SSH_REMOTE',
  'STREAMLINED_OUTPUT',
  'TEAMMEM',
  'TEMPLATES',
  'TERMINAL_PANEL',
  'TOKEN_BUDGET',
  'TORCH',
  'TRANSCRIPT_CLASSIFIER',
  'TREE_SITTER_BASH',
  'TREE_SITTER_BASH_SHADOW',
  'UDS_INBOX',
  'ULTRAPLAN',
  'ULTRATHINK',
  'UNATTENDED_RETRY',
  'UPLOAD_USER_SETTINGS',
  'VERIFICATION_AGENT',
  'VOICE_MODE',
  'WEB_BROWSER_TOOL',
  'WORKFLOW_SCRIPTS',
] as const

export type FeatureFlagName = (typeof FEATURE_FLAG_KEYS)[number]

export type FeatureConfig = {
  version: number
  generatedAt: string
  notes?: string
  flags: Record<FeatureFlagName, boolean>
}

const SHARED_TOP_LEVEL_KEYS = ['version', 'generatedAt', 'notes'] as const
const MACRO_TOP_LEVEL_KEYS = new Set<string>([...SHARED_TOP_LEVEL_KEYS, 'macros'])
const FEATURE_TOP_LEVEL_KEYS = new Set<string>([
  ...SHARED_TOP_LEVEL_KEYS,
  'flags',
])
const ALLOWED_MACRO_KEYS = new Set<string>(MACRO_KEYS)
const ALLOWED_FEATURE_FLAG_KEYS = new Set<string>(FEATURE_FLAG_KEYS)

function assertObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }

  return value as Record<string, unknown>
}

function assertNoUnknownKeys(
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

function assertString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`)
  }

  return value
}

function assertISODateString(value: unknown, fieldName: string): string {
  const parsed = assertString(value, fieldName)
  if (Number.isNaN(Date.parse(parsed))) {
    throw new Error(`${fieldName} must be an ISO-8601 date string`)
  }

  return parsed
}

function assertVersion(value: unknown, fieldName: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1
  ) {
    throw new Error(`${fieldName} must be a positive integer`)
  }

  return value
}

function parseSharedTopLevelFields(
  parsed: unknown,
  label: string,
  allowedTopLevelKeys: Set<string>,
): {
  object: Record<string, unknown>
  version: number
  generatedAt: string
  notes: string | undefined
} {
  const object = assertObject(parsed, label)
  assertNoUnknownKeys(object, allowedTopLevelKeys, label)

  const version = assertVersion(object.version, `${label} version`)
  const generatedAt = assertISODateString(
    object.generatedAt,
    `${label} generatedAt`,
  )

  if (object.notes !== undefined && typeof object.notes !== 'string') {
    throw new Error(`${label} notes must be a string when provided`)
  }

  return {
    object,
    version,
    generatedAt,
    notes: object.notes as string | undefined,
  }
}

export function parseAndValidateMacroConfig(parsed: unknown): MacroConfig {
  const {
    object,
    version,
    generatedAt,
    notes,
  } = parseSharedTopLevelFields(
    parsed,
    'reconstruction/macros.json',
    MACRO_TOP_LEVEL_KEYS,
  )

  const macroRecord = assertObject(
    object.macros,
    'reconstruction/macros.json macros',
  )
  assertNoUnknownKeys(
    macroRecord,
    ALLOWED_MACRO_KEYS,
    'reconstruction/macros.json macros',
  )

  for (const key of MACRO_KEYS) {
    if (!(key in macroRecord)) {
      throw new Error(
        `reconstruction/macros.json macros is missing required key: ${key}`,
      )
    }
  }

  return {
    version,
    generatedAt,
    notes,
    macros: {
      VERSION: assertString(
        macroRecord.VERSION,
        'reconstruction/macros.json macros.VERSION',
      ),
      BUILD_TIME: assertString(
        macroRecord.BUILD_TIME,
        'reconstruction/macros.json macros.BUILD_TIME',
      ),
      PACKAGE_URL: assertString(
        macroRecord.PACKAGE_URL,
        'reconstruction/macros.json macros.PACKAGE_URL',
      ),
      NATIVE_PACKAGE_URL:
        macroRecord.NATIVE_PACKAGE_URL === null
          ? null
          : assertString(
              macroRecord.NATIVE_PACKAGE_URL,
              'reconstruction/macros.json macros.NATIVE_PACKAGE_URL',
            ),
      FEEDBACK_CHANNEL: assertString(
        macroRecord.FEEDBACK_CHANNEL,
        'reconstruction/macros.json macros.FEEDBACK_CHANNEL',
      ),
      ISSUES_EXPLAINER: assertString(
        macroRecord.ISSUES_EXPLAINER,
        'reconstruction/macros.json macros.ISSUES_EXPLAINER',
      ),
      VERSION_CHANGELOG: assertString(
        macroRecord.VERSION_CHANGELOG,
        'reconstruction/macros.json macros.VERSION_CHANGELOG',
      ),
    },
  }
}

export function parseAndValidateFeatureConfig(parsed: unknown): FeatureConfig {
  const {
    object,
    version,
    generatedAt,
    notes,
  } = parseSharedTopLevelFields(
    parsed,
    'reconstruction/features.json',
    FEATURE_TOP_LEVEL_KEYS,
  )

  const flagsRecord = assertObject(
    object.flags,
    'reconstruction/features.json flags',
  )
  assertNoUnknownKeys(
    flagsRecord,
    ALLOWED_FEATURE_FLAG_KEYS,
    'reconstruction/features.json flags',
  )

  for (const key of FEATURE_FLAG_KEYS) {
    if (!(key in flagsRecord)) {
      throw new Error(
        `reconstruction/features.json flags is missing required key: ${key}`,
      )
    }

    if (typeof flagsRecord[key] !== 'boolean') {
      throw new Error(
        `reconstruction/features.json flags.${key} must be a boolean`,
      )
    }
  }

  return {
    version,
    generatedAt,
    notes,
    flags: flagsRecord as FeatureConfig['flags'],
  }
}

export function readAndValidateMacroConfig(configPath: string): MacroConfig {
  const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as unknown
  return parseAndValidateMacroConfig(parsed)
}

export function readAndValidateFeatureConfig(configPath: string): FeatureConfig {
  const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as unknown
  return parseAndValidateFeatureConfig(parsed)
}
