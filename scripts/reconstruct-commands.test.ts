import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import path from 'path'

const ROOT = path.resolve(import.meta.dir, '..')

// ---------------------------------------------------------------------------
// Helper: parse features.json
// ---------------------------------------------------------------------------
function loadFeatures(): Record<string, boolean> {
  const raw = JSON.parse(
    readFileSync(path.join(ROOT, 'reconstruction/features.json'), 'utf-8'),
  )
  return raw.flags
}

// ---------------------------------------------------------------------------
// 1. Feature-gated imports use null fallbacks (spec 3.1.2.1)
// ---------------------------------------------------------------------------

describe('command registry: feature-gated imports have null fallbacks', () => {
  const commandsSrc = readFileSync(
    path.join(ROOT, 'commands.ts'),
    'utf-8',
  )

  // Every feature-gated require() must use the ternary pattern:
  //   feature('FLAG') ? require(...) : null
  // This guarantees missing modules don't crash when the flag is false.
  const FEATURE_GATED_MODULES = [
    { flag: 'PROACTIVE', module: './commands/proactive.js' },
    { flag: 'KAIROS', module: './commands/assistant/index.js' },
    { flag: 'BRIDGE_MODE', module: './commands/bridge/index.js' },
    { flag: 'VOICE_MODE', module: './commands/voice/index.js' },
    { flag: 'HISTORY_SNIP', module: './commands/force-snip.js' },
    { flag: 'WORKFLOW_SCRIPTS', module: './commands/workflows/index.js' },
    { flag: 'CCR_REMOTE_SETUP', module: './commands/remote-setup/index.js' },
    { flag: 'EXPERIMENTAL_SKILL_SEARCH', module: './services/skillSearch/localSearch.js' },
    { flag: 'KAIROS_GITHUB_WEBHOOKS', module: './commands/subscribe-pr.js' },
    { flag: 'ULTRAPLAN', module: './commands/ultraplan.js' },
    { flag: 'TORCH', module: './commands/torch.js' },
    { flag: 'UDS_INBOX', module: './commands/peers/index.js' },
    { flag: 'FORK_SUBAGENT', module: './commands/fork/index.js' },
    { flag: 'BUDDY', module: './commands/buddy/index.js' },
    { flag: 'WORKFLOW_SCRIPTS', module: './tools/WorkflowTool/createWorkflowCommand.js' },
  ]

  for (const { flag, module: mod } of FEATURE_GATED_MODULES) {
    test(`${mod} is guarded by feature('${flag}') with null fallback`, () => {
      // The require() for this module must appear inside a ternary with : null
      const requirePattern = mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(
        `feature\\(['"](${flag}|[A-Z_]+)['"]\\)[^?]*\\?[\\s\\S]*?require\\(['"]${requirePattern}['"]\\)[\\s\\S]*?:\\s*null`,
      )
      expect(commandsSrc).toMatch(regex)
    })
  }

  test('all feature-gated requires have corresponding flags in features.json', () => {
    const flags = loadFeatures()
    for (const { flag } of FEATURE_GATED_MODULES) {
      expect(flags).toHaveProperty(flag)
    }
  })

  test('all feature-gated flags are currently disabled (false)', () => {
    const flags = loadFeatures()
    for (const { flag } of FEATURE_GATED_MODULES) {
      expect(flags[flag]).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// 2. isEnabled() and feature gates hide unavailable commands (spec 3.1.2.2)
// ---------------------------------------------------------------------------

describe('command registry: isEnabled() and availability gating', () => {
  test('isCommandEnabled defaults to true when isEnabled is absent', async () => {
    const { isCommandEnabled } = await import(
      path.join(ROOT, 'types/command.ts')
    )
    const cmd = { name: 'test-cmd', description: 'test' }
    expect(isCommandEnabled(cmd)).toBe(true)
  })

  test('isCommandEnabled returns false when isEnabled returns false', async () => {
    const { isCommandEnabled } = await import(
      path.join(ROOT, 'types/command.ts')
    )
    const cmd = {
      name: 'test-cmd',
      description: 'test',
      isEnabled: () => false,
    }
    expect(isCommandEnabled(cmd)).toBe(false)
  })

  test('isCommandEnabled returns true when isEnabled returns true', async () => {
    const { isCommandEnabled } = await import(
      path.join(ROOT, 'types/command.ts')
    )
    const cmd = {
      name: 'test-cmd',
      description: 'test',
      isEnabled: () => true,
    }
    expect(isCommandEnabled(cmd)).toBe(true)
  })

  test('getCommandName falls back to cmd.name when userFacingName is absent', async () => {
    const { getCommandName } = await import(
      path.join(ROOT, 'types/command.ts')
    )
    const cmd = { name: 'test-cmd', description: 'test' }
    expect(getCommandName(cmd)).toBe('test-cmd')
  })

  test('getCommandName uses userFacingName when provided', async () => {
    const { getCommandName } = await import(
      path.join(ROOT, 'types/command.ts')
    )
    const cmd = {
      name: 'internal-name',
      description: 'test',
      userFacingName: () => 'display-name',
    }
    expect(getCommandName(cmd)).toBe('display-name')
  })

  test('COMMANDS() spreads feature-gated commands only when non-null', () => {
    const src = readFileSync(path.join(ROOT, 'commands.ts'), 'utf-8')
    // Feature-gated commands use the spread pattern: ...(varName ? [varName] : [])
    // This ensures null values never pollute the array
    const featureGatedVars = [
      'webCmd',
      'forkCmd',
      'buddy',
      'proactive',
      'briefCommand',
      'assistantCommand',
      'bridge',
      'remoteControlServerCommand',
      'voiceCommand',
      'peersCmd',
      'workflowsCmd',
      'torch',
    ]
    for (const varName of featureGatedVars) {
      const pattern = new RegExp(
        `\\.\\.\\.\\(${varName}\\s*\\?\\s*\\[${varName}\\]\\s*:\\s*\\[\\]\\)`,
      )
      expect(src).toMatch(pattern)
    }
  })
})

// ---------------------------------------------------------------------------
// 3. findCommand / getCommands do not throw (spec 3.1.2.3)
// ---------------------------------------------------------------------------

describe('command registry: findCommand does not throw', () => {
  test('findCommand returns undefined for unknown command', async () => {
    const { findCommand } = await import(path.join(ROOT, 'commands.ts'))
    const result = findCommand('nonexistent-command-xyz', [])
    expect(result).toBeUndefined()
  })

  test('findCommand matches by name', async () => {
    const { findCommand } = await import(path.join(ROOT, 'commands.ts'))
    const cmd = {
      type: 'local' as const,
      name: 'test',
      description: 'a test command',
      supportsNonInteractive: false,
      load: async () => ({ call: async () => ({ type: 'skip' as const }) }),
    }
    const result = findCommand('test', [cmd])
    expect(result).toBe(cmd)
  })

  test('findCommand matches by alias', async () => {
    const { findCommand } = await import(path.join(ROOT, 'commands.ts'))
    const cmd = {
      type: 'local' as const,
      name: 'original',
      aliases: ['alt-name'],
      description: 'a test command',
      supportsNonInteractive: false,
      load: async () => ({ call: async () => ({ type: 'skip' as const }) }),
    }
    const result = findCommand('alt-name', [cmd])
    expect(result).toBe(cmd)
  })

  test('findCommand matches by userFacingName', async () => {
    const { findCommand } = await import(path.join(ROOT, 'commands.ts'))
    const cmd = {
      type: 'local' as const,
      name: 'internal',
      description: 'a test command',
      userFacingName: () => 'public-name',
      supportsNonInteractive: false,
      load: async () => ({ call: async () => ({ type: 'skip' as const }) }),
    }
    const result = findCommand('public-name', [cmd])
    expect(result).toBe(cmd)
  })

  test('hasCommand returns false for unknown command', async () => {
    const { hasCommand } = await import(path.join(ROOT, 'commands.ts'))
    expect(hasCommand('nonexistent-xyz', [])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 4. getSkills wraps errors gracefully (spec 3.1.2.3)
// ---------------------------------------------------------------------------

describe('command registry: error handling in skill loading', () => {
  test('getSkills catch blocks exist in commands.ts', () => {
    const src = readFileSync(path.join(ROOT, 'commands.ts'), 'utf-8')
    // getSkills wraps each skill loader in .catch()
    expect(src).toContain('getSkillDirCommands(cwd).catch(')
    expect(src).toContain('getPluginSkills().catch(')
    // Outer try/catch in getSkills
    expect(src).toContain('Unexpected error in getSkills, returning empty')
  })

  test('getSlashCommandToolSkills has try/catch fallback', () => {
    const src = readFileSync(path.join(ROOT, 'commands.ts'), 'utf-8')
    expect(src).toContain('Returning empty skills array due to load failure')
  })
})

// ---------------------------------------------------------------------------
// 5. commands.ts module loads without throwing (spec 3.1.2.3)
// ---------------------------------------------------------------------------

describe('command registry: module-level import succeeds', () => {
  test('commands.ts can be imported without error', async () => {
    // This is the critical test: importing commands.ts triggers all
    // top-level imports and feature-gated requires. If any non-gated
    // import is missing or any gated require fires despite its flag
    // being false, this will throw.
    const mod = await import(path.join(ROOT, 'commands.ts'))
    expect(mod).toBeDefined()
    expect(typeof mod.findCommand).toBe('function')
    expect(typeof mod.hasCommand).toBe('function')
    expect(typeof mod.getCommand).toBe('function')
    expect(typeof mod.getCommands).toBe('function')
    expect(typeof mod.meetsAvailabilityRequirement).toBe('function')
    expect(typeof mod.filterCommandsForRemoteMode).toBe('function')
    expect(typeof mod.isBridgeSafeCommand).toBe('function')
    expect(typeof mod.clearCommandsCache).toBe('function')
    expect(typeof mod.builtInCommandNames).toBe('function')
  })

  test('builtInCommandNames returns a non-empty Set', async () => {
    const { builtInCommandNames } = await import(
      path.join(ROOT, 'commands.ts')
    )
    const names = builtInCommandNames()
    expect(names).toBeInstanceOf(Set)
    expect(names.size).toBeGreaterThan(0)
    // Core commands must be present
    expect(names.has('help')).toBe(true)
    expect(names.has('config')).toBe(true)
    expect(names.has('clear')).toBe(true)
  })

  test('REMOTE_SAFE_COMMANDS is a non-empty Set', async () => {
    const { REMOTE_SAFE_COMMANDS } = await import(
      path.join(ROOT, 'commands.ts')
    )
    expect(REMOTE_SAFE_COMMANDS).toBeInstanceOf(Set)
    expect(REMOTE_SAFE_COMMANDS.size).toBeGreaterThan(0)
  })

  test('BRIDGE_SAFE_COMMANDS is a Set (may be empty if commands are null-gated)', async () => {
    const { BRIDGE_SAFE_COMMANDS } = await import(
      path.join(ROOT, 'commands.ts')
    )
    expect(BRIDGE_SAFE_COMMANDS).toBeInstanceOf(Set)
  })
})

// ---------------------------------------------------------------------------
// 6. meetsAvailabilityRequirement filters correctly (spec 3.1.2.2)
// ---------------------------------------------------------------------------

describe('command registry: availability filtering', () => {
  test('commands without availability pass the filter', async () => {
    const { meetsAvailabilityRequirement } = await import(
      path.join(ROOT, 'commands.ts')
    )
    const cmd = {
      type: 'local' as const,
      name: 'universal',
      description: 'available everywhere',
      supportsNonInteractive: false,
      load: async () => ({ call: async () => ({ type: 'skip' as const }) }),
    }
    expect(meetsAvailabilityRequirement(cmd)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 7. isBridgeSafeCommand routing logic (spec 3.1.2.2)
// ---------------------------------------------------------------------------

describe('command registry: bridge safety routing', () => {
  test('local-jsx commands are never bridge-safe', async () => {
    const { isBridgeSafeCommand } = await import(
      path.join(ROOT, 'commands.ts')
    )
    const cmd = {
      type: 'local-jsx' as const,
      name: 'test-jsx',
      description: 'test',
      load: async () => ({
        call: async () => null as unknown as React.ReactNode,
      }),
    }
    expect(isBridgeSafeCommand(cmd)).toBe(false)
  })

  test('prompt commands are always bridge-safe', async () => {
    const { isBridgeSafeCommand } = await import(
      path.join(ROOT, 'commands.ts')
    )
    const cmd = {
      type: 'prompt' as const,
      name: 'test-prompt',
      description: 'test',
      progressMessage: 'testing',
      contentLength: 0,
      source: 'builtin' as const,
      getPromptForCommand: async () => [],
    }
    expect(isBridgeSafeCommand(cmd)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 8. formatDescriptionWithSource (spec 3.1.2.2)
// ---------------------------------------------------------------------------

describe('command registry: formatDescriptionWithSource', () => {
  test('non-prompt commands return description unchanged', async () => {
    const { formatDescriptionWithSource } = await import(
      path.join(ROOT, 'commands.ts')
    )
    const cmd = {
      type: 'local' as const,
      name: 'test',
      description: 'My description',
      supportsNonInteractive: false,
      load: async () => ({ call: async () => ({ type: 'skip' as const }) }),
    }
    expect(formatDescriptionWithSource(cmd)).toBe('My description')
  })

  test('workflow commands get (workflow) suffix', async () => {
    const { formatDescriptionWithSource } = await import(
      path.join(ROOT, 'commands.ts')
    )
    const cmd = {
      type: 'prompt' as const,
      name: 'test-wf',
      description: 'A workflow',
      kind: 'workflow' as const,
      progressMessage: 'running',
      contentLength: 0,
      source: 'builtin' as const,
      getPromptForCommand: async () => [],
    }
    expect(formatDescriptionWithSource(cmd)).toBe('A workflow (workflow)')
  })

  test('builtin prompt commands return description unchanged', async () => {
    const { formatDescriptionWithSource } = await import(
      path.join(ROOT, 'commands.ts')
    )
    const cmd = {
      type: 'prompt' as const,
      name: 'test-builtin',
      description: 'Builtin desc',
      progressMessage: 'running',
      contentLength: 0,
      source: 'builtin' as const,
      getPromptForCommand: async () => [],
    }
    expect(formatDescriptionWithSource(cmd)).toBe('Builtin desc')
  })
})
