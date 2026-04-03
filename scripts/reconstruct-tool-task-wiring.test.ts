import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
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

// ===========================================================================
// SPEC 3.1.3.1 — Tool.ts, tools.ts, toolExecution.ts, toolOrchestration.ts
// ===========================================================================

describe('spec 3.1.3.1: core tool module files exist', () => {
  const TOOL_FILES = [
    'Tool.ts',
    'tools.ts',
    'services/tools/toolExecution.ts',
    'services/tools/toolOrchestration.ts',
    'services/tools/toolHooks.ts',
    'services/tools/StreamingToolExecutor.ts',
  ]

  for (const file of TOOL_FILES) {
    test(`${file} exists`, () => {
      expect(existsSync(path.join(ROOT, file))).toBe(true)
    })
  }
})

describe('spec 3.1.3.1: Tool.ts exports', () => {
  test('Tool.ts can be imported without error', async () => {
    const mod = await import(path.join(ROOT, 'Tool.ts'))
    expect(mod).toBeDefined()
  })

  test('exports buildTool factory function', async () => {
    const { buildTool } = await import(path.join(ROOT, 'Tool.ts'))
    expect(typeof buildTool).toBe('function')
  })

  test('exports findToolByName utility', async () => {
    const { findToolByName } = await import(path.join(ROOT, 'Tool.ts'))
    expect(typeof findToolByName).toBe('function')
  })

  test('exports toolMatchesName utility', async () => {
    const { toolMatchesName } = await import(path.join(ROOT, 'Tool.ts'))
    expect(typeof toolMatchesName).toBe('function')
  })

  test('exports getEmptyToolPermissionContext', async () => {
    const { getEmptyToolPermissionContext } = await import(
      path.join(ROOT, 'Tool.ts')
    )
    expect(typeof getEmptyToolPermissionContext).toBe('function')
    const ctx = getEmptyToolPermissionContext()
    expect(ctx.mode).toBe('default')
    expect(ctx.isBypassPermissionsModeAvailable).toBe(false)
  })

  test('exports filterToolProgressMessages', async () => {
    const { filterToolProgressMessages } = await import(
      path.join(ROOT, 'Tool.ts')
    )
    expect(typeof filterToolProgressMessages).toBe('function')
  })
})

describe('spec 3.1.3.1: toolMatchesName correctness', () => {
  test('matches by primary name', async () => {
    const { toolMatchesName } = await import(path.join(ROOT, 'Tool.ts'))
    expect(toolMatchesName({ name: 'Bash' }, 'Bash')).toBe(true)
    expect(toolMatchesName({ name: 'Bash' }, 'Read')).toBe(false)
  })

  test('matches by alias', async () => {
    const { toolMatchesName } = await import(path.join(ROOT, 'Tool.ts'))
    expect(
      toolMatchesName({ name: 'Bash', aliases: ['Shell', 'Terminal'] }, 'Shell'),
    ).toBe(true)
    expect(
      toolMatchesName(
        { name: 'Bash', aliases: ['Shell', 'Terminal'] },
        'Terminal',
      ),
    ).toBe(true)
    expect(
      toolMatchesName({ name: 'Bash', aliases: ['Shell', 'Terminal'] }, 'Zsh'),
    ).toBe(false)
  })

  test('returns false for empty aliases', async () => {
    const { toolMatchesName } = await import(path.join(ROOT, 'Tool.ts'))
    expect(toolMatchesName({ name: 'Bash', aliases: [] }, 'Shell')).toBe(false)
  })

  test('returns false when aliases not provided', async () => {
    const { toolMatchesName } = await import(path.join(ROOT, 'Tool.ts'))
    expect(toolMatchesName({ name: 'Bash' }, 'Shell')).toBe(false)
  })
})

describe('spec 3.1.3.1: findToolByName correctness', () => {
  test('finds tool by primary name', async () => {
    const { findToolByName } = await import(path.join(ROOT, 'Tool.ts'))
    const tools = [
      { name: 'Bash', aliases: [] },
      { name: 'Read', aliases: [] },
      { name: 'Edit', aliases: [] },
    ] as any
    const result = findToolByName(tools, 'Read')
    expect(result).toBeDefined()
    expect(result!.name).toBe('Read')
  })

  test('finds tool by alias', async () => {
    const { findToolByName } = await import(path.join(ROOT, 'Tool.ts'))
    const tools = [
      { name: 'Bash', aliases: ['Shell'] },
      { name: 'Read', aliases: ['Cat'] },
    ] as any
    const result = findToolByName(tools, 'Cat')
    expect(result).toBeDefined()
    expect(result!.name).toBe('Read')
  })

  test('returns undefined for unknown tool', async () => {
    const { findToolByName } = await import(path.join(ROOT, 'Tool.ts'))
    const tools = [{ name: 'Bash', aliases: [] }] as any
    expect(findToolByName(tools, 'NonExistent')).toBeUndefined()
  })

  test('returns undefined for empty tools array', async () => {
    const { findToolByName } = await import(path.join(ROOT, 'Tool.ts'))
    expect(findToolByName([], 'Bash')).toBeUndefined()
  })
})

describe('spec 3.1.3.1: buildTool provides defaults', () => {
  test('buildTool fills in default isEnabled (true)', async () => {
    const { buildTool } = await import(path.join(ROOT, 'Tool.ts'))
    const tool = buildTool({
      name: 'TestTool',
      maxResultSizeChars: 1000,
      inputSchema: {} as any,
      call: async () => ({ data: null }),
      description: async () => 'test',
      prompt: async () => 'test',
      renderToolUseMessage: () => null,
      mapToolResultToToolResultBlockParam: () => ({} as any),
      checkPermissions: async (input: any) => ({
        behavior: 'allow' as const,
        updatedInput: input,
      }),
      toAutoClassifierInput: () => '',
      userFacingName: () => 'TestTool',
    })
    expect(tool.isEnabled()).toBe(true)
  })

  test('buildTool fills in default isConcurrencySafe (false)', async () => {
    const { buildTool } = await import(path.join(ROOT, 'Tool.ts'))
    const tool = buildTool({
      name: 'TestTool',
      maxResultSizeChars: 1000,
      inputSchema: {} as any,
      call: async () => ({ data: null }),
      description: async () => 'test',
      prompt: async () => 'test',
      renderToolUseMessage: () => null,
      mapToolResultToToolResultBlockParam: () => ({} as any),
    })
    expect(tool.isConcurrencySafe({})).toBe(false)
  })

  test('buildTool fills in default isReadOnly (false)', async () => {
    const { buildTool } = await import(path.join(ROOT, 'Tool.ts'))
    const tool = buildTool({
      name: 'TestTool',
      maxResultSizeChars: 1000,
      inputSchema: {} as any,
      call: async () => ({ data: null }),
      description: async () => 'test',
      prompt: async () => 'test',
      renderToolUseMessage: () => null,
      mapToolResultToToolResultBlockParam: () => ({} as any),
    })
    expect(tool.isReadOnly({})).toBe(false)
  })

  test('buildTool fills in default userFacingName from name', async () => {
    const { buildTool } = await import(path.join(ROOT, 'Tool.ts'))
    const tool = buildTool({
      name: 'MySpecialTool',
      maxResultSizeChars: 1000,
      inputSchema: {} as any,
      call: async () => ({ data: null }),
      description: async () => 'test',
      prompt: async () => 'test',
      renderToolUseMessage: () => null,
      mapToolResultToToolResultBlockParam: () => ({} as any),
    })
    expect(tool.userFacingName(undefined)).toBe('MySpecialTool')
  })
})

describe('spec 3.1.3.1: tools.ts module loads and exports', () => {
  test('tools.ts can be imported without error', async () => {
    const mod = await import(path.join(ROOT, 'tools.ts'))
    expect(mod).toBeDefined()
  })

  test('exports getAllBaseTools', async () => {
    const { getAllBaseTools } = await import(path.join(ROOT, 'tools.ts'))
    expect(typeof getAllBaseTools).toBe('function')
  })

  test('getAllBaseTools returns non-empty array', async () => {
    const { getAllBaseTools } = await import(path.join(ROOT, 'tools.ts'))
    const tools = getAllBaseTools()
    expect(Array.isArray(tools)).toBe(true)
    expect(tools.length).toBeGreaterThan(10)
  })

  test('every tool has required interface properties', async () => {
    const { getAllBaseTools } = await import(path.join(ROOT, 'tools.ts'))
    const tools = getAllBaseTools()
    for (const tool of tools) {
      expect(typeof tool.name).toBe('string')
      expect(tool.name.length).toBeGreaterThan(0)
      expect(typeof tool.call).toBe('function')
      expect(typeof tool.description).toBe('function')
      expect(typeof tool.isEnabled).toBe('function')
      expect(typeof tool.isConcurrencySafe).toBe('function')
      expect(typeof tool.isReadOnly).toBe('function')
      expect(typeof tool.checkPermissions).toBe('function')
      expect(typeof tool.prompt).toBe('function')
      expect(typeof tool.renderToolUseMessage).toBe('function')
      expect(typeof tool.mapToolResultToToolResultBlockParam).toBe('function')
      expect(typeof tool.maxResultSizeChars).toBe('number')
    }
  })

  test('tool names are unique (no duplicates)', async () => {
    const { getAllBaseTools } = await import(path.join(ROOT, 'tools.ts'))
    const tools = getAllBaseTools()
    const names = tools.map(t => t.name)
    const unique = new Set(names)
    expect(unique.size).toBe(names.length)
  })

  test('core tools are present in getAllBaseTools', async () => {
    const { getAllBaseTools } = await import(path.join(ROOT, 'tools.ts'))
    const tools = getAllBaseTools()
    const names = new Set(tools.map(t => t.name))
    // These core tools must always be present
    expect(names.has('Agent')).toBe(true)
    expect(names.has('Bash')).toBe(true)
    expect(names.has('Read')).toBe(true)
    expect(names.has('Edit')).toBe(true)
    expect(names.has('Write')).toBe(true)
    expect(names.has('WebFetch')).toBe(true)
    expect(names.has('WebSearch')).toBe(true)
    expect(names.has('TodoWrite')).toBe(true)
    expect(names.has('Skill')).toBe(true)
  })

  test('exports getTools', async () => {
    const { getTools } = await import(path.join(ROOT, 'tools.ts'))
    expect(typeof getTools).toBe('function')
  })

  test('exports assembleToolPool', async () => {
    const { assembleToolPool } = await import(path.join(ROOT, 'tools.ts'))
    expect(typeof assembleToolPool).toBe('function')
  })

  test('exports getMergedTools', async () => {
    const { getMergedTools } = await import(path.join(ROOT, 'tools.ts'))
    expect(typeof getMergedTools).toBe('function')
  })

  test('exports filterToolsByDenyRules', async () => {
    const { filterToolsByDenyRules } = await import(
      path.join(ROOT, 'tools.ts')
    )
    expect(typeof filterToolsByDenyRules).toBe('function')
  })

  test('exports parseToolPreset', async () => {
    const { parseToolPreset } = await import(path.join(ROOT, 'tools.ts'))
    expect(typeof parseToolPreset).toBe('function')
    expect(parseToolPreset('default')).toBe('default')
    expect(parseToolPreset('nonexistent')).toBeNull()
  })
})

describe('spec 3.1.3.1: feature-gated tool imports use null fallbacks', () => {
  const toolsSrc = readFileSync(path.join(ROOT, 'tools.ts'), 'utf-8')

  const FEATURE_GATED_TOOLS = [
    { flag: 'PROACTIVE', module: './tools/SleepTool/SleepTool.js' },
    { flag: 'AGENT_TRIGGERS', module: './tools/ScheduleCronTool/CronCreateTool.js' },
    { flag: 'AGENT_TRIGGERS_REMOTE', module: './tools/RemoteTriggerTool/RemoteTriggerTool.js' },
    { flag: 'MONITOR_TOOL', module: './tools/MonitorTool/MonitorTool.js' },
    { flag: 'OVERFLOW_TEST_TOOL', module: './tools/OverflowTestTool/OverflowTestTool.js' },
    { flag: 'CONTEXT_COLLAPSE', module: './tools/CtxInspectTool/CtxInspectTool.js' },
    { flag: 'TERMINAL_PANEL', module: './tools/TerminalCaptureTool/TerminalCaptureTool.js' },
    { flag: 'WEB_BROWSER_TOOL', module: './tools/WebBrowserTool/WebBrowserTool.js' },
    { flag: 'HISTORY_SNIP', module: './tools/SnipTool/SnipTool.js' },
    { flag: 'UDS_INBOX', module: './tools/ListPeersTool/ListPeersTool.js' },
    { flag: 'WORKFLOW_SCRIPTS', module: './tools/WorkflowTool/WorkflowTool.js' },
  ]

  for (const { flag, module: mod } of FEATURE_GATED_TOOLS) {
    test(`${mod} is guarded by feature('${flag}')`, () => {
      const requirePattern = mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      expect(toolsSrc).toContain(`feature('${flag}')`)
      expect(toolsSrc).toMatch(new RegExp(requirePattern))
    })
  }

  test('all feature-gated tool flags exist in features.json', () => {
    const flags = loadFeatures()
    for (const { flag } of FEATURE_GATED_TOOLS) {
      expect(flags).toHaveProperty(flag)
    }
  })

  test('all feature-gated tool flags are currently disabled', () => {
    const flags = loadFeatures()
    for (const { flag } of FEATURE_GATED_TOOLS) {
      expect(flags[flag]).toBe(false)
    }
  })
})

describe('spec 3.1.3.1: toolOrchestration.ts exports', () => {
  test('toolOrchestration.ts can be imported without error', async () => {
    const mod = await import(
      path.join(ROOT, 'services/tools/toolOrchestration.ts')
    )
    expect(mod).toBeDefined()
  })

  test('exports runTools async generator', async () => {
    const { runTools } = await import(
      path.join(ROOT, 'services/tools/toolOrchestration.ts')
    )
    expect(typeof runTools).toBe('function')
  })
})

describe('spec 3.1.3.1: toolExecution.ts exports', () => {
  test('toolExecution.ts can be imported without error', async () => {
    const mod = await import(
      path.join(ROOT, 'services/tools/toolExecution.ts')
    )
    expect(mod).toBeDefined()
  })

  test('exports runToolUse', async () => {
    const { runToolUse } = await import(
      path.join(ROOT, 'services/tools/toolExecution.ts')
    )
    expect(typeof runToolUse).toBe('function')
  })
})

// ===========================================================================
// SPEC 3.1.3.2 — Permission pipeline remains intact
// ===========================================================================

describe('spec 3.1.3.2: permission pipeline files exist', () => {
  const PERM_FILES = [
    'utils/permissions/permissions.ts',
    'utils/permissions/permissionsLoader.ts',
    'utils/permissions/permissionSetup.ts',
    'utils/permissions/permissionRuleParser.ts',
    'utils/permissions/permissionExplainer.ts',
    'utils/permissions/denialTracking.ts',
    'utils/permissions/PermissionMode.ts',
    'utils/permissions/PermissionResult.ts',
    'utils/permissions/PermissionRule.ts',
    'utils/permissions/PermissionUpdate.ts',
  ]

  for (const file of PERM_FILES) {
    test(`${file} exists`, () => {
      expect(existsSync(path.join(ROOT, file))).toBe(true)
    })
  }
})

describe('spec 3.1.3.2: permissions.ts can be imported and exports key functions', () => {
  test('permissions.ts can be imported without error', async () => {
    const mod = await import(
      path.join(ROOT, 'utils/permissions/permissions.ts')
    )
    expect(mod).toBeDefined()
  })

  test('exports getDenyRuleForTool', async () => {
    const { getDenyRuleForTool } = await import(
      path.join(ROOT, 'utils/permissions/permissions.ts')
    )
    expect(typeof getDenyRuleForTool).toBe('function')
  })

  test('exports permissionRuleSourceDisplayString', async () => {
    const { permissionRuleSourceDisplayString } = await import(
      path.join(ROOT, 'utils/permissions/permissions.ts')
    )
    expect(typeof permissionRuleSourceDisplayString).toBe('function')
  })

  test('exports createPermissionRequestMessage', async () => {
    const { createPermissionRequestMessage } = await import(
      path.join(ROOT, 'utils/permissions/permissions.ts')
    )
    expect(typeof createPermissionRequestMessage).toBe('function')
  })
})

describe('spec 3.1.3.2: permission classifier is feature-gated', () => {
  test('classifierDecision import is behind TRANSCRIPT_CLASSIFIER flag', () => {
    const src = readFileSync(
      path.join(ROOT, 'utils/permissions/permissions.ts'),
      'utf-8',
    )
    expect(src).toContain("feature('TRANSCRIPT_CLASSIFIER')")
    expect(src).toContain("require('./classifierDecision.js')")
  })

  test('TRANSCRIPT_CLASSIFIER flag is disabled', () => {
    const flags = loadFeatures()
    expect(flags['TRANSCRIPT_CLASSIFIER']).toBe(false)
  })
})

describe('spec 3.1.3.2: permission type modules exist and export', () => {
  test('PermissionResult.ts exports types', async () => {
    const mod = await import(
      path.join(ROOT, 'utils/permissions/PermissionResult.ts')
    )
    expect(mod).toBeDefined()
  })

  test('PermissionRule.ts exports types', async () => {
    const mod = await import(
      path.join(ROOT, 'utils/permissions/PermissionRule.ts')
    )
    expect(mod).toBeDefined()
  })

  test('PermissionMode.ts exports permissionModeTitle', async () => {
    const { permissionModeTitle } = await import(
      path.join(ROOT, 'utils/permissions/PermissionMode.ts')
    )
    expect(typeof permissionModeTitle).toBe('function')
  })

  test('permissionRuleParser.ts exports parse utilities', async () => {
    const mod = await import(
      path.join(ROOT, 'utils/permissions/permissionRuleParser.ts')
    )
    expect(mod.permissionRuleValueFromString).toBeDefined()
    expect(mod.permissionRuleValueToString).toBeDefined()
  })
})

// ===========================================================================
// SPEC 3.1.3.3 — Task polling/storage path functional
// ===========================================================================

describe('spec 3.1.3.3: task module files exist', () => {
  const TASK_FILES = [
    'Task.ts',
    'tasks.ts',
    'utils/task/diskOutput.ts',
    'utils/task/TaskOutput.ts',
    'utils/task/framework.ts',
    'utils/task/outputFormatting.ts',
    'utils/task/sdkProgress.ts',
    'utils/tasks.ts',
  ]

  for (const file of TASK_FILES) {
    test(`${file} exists`, () => {
      expect(existsSync(path.join(ROOT, file))).toBe(true)
    })
  }
})

describe('spec 3.1.3.3: Task.ts exports and correctness', () => {
  test('Task.ts can be imported without error', async () => {
    const mod = await import(path.join(ROOT, 'Task.ts'))
    expect(mod).toBeDefined()
  })

  test('exports generateTaskId', async () => {
    const { generateTaskId } = await import(path.join(ROOT, 'Task.ts'))
    expect(typeof generateTaskId).toBe('function')
  })

  test('exports createTaskStateBase', async () => {
    const { createTaskStateBase } = await import(path.join(ROOT, 'Task.ts'))
    expect(typeof createTaskStateBase).toBe('function')
  })

  test('exports isTerminalTaskStatus', async () => {
    const { isTerminalTaskStatus } = await import(path.join(ROOT, 'Task.ts'))
    expect(typeof isTerminalTaskStatus).toBe('function')
  })

  test('generateTaskId produces correct prefix for each task type', async () => {
    const { generateTaskId } = await import(path.join(ROOT, 'Task.ts'))

    const prefixMap: Record<string, string> = {
      local_bash: 'b',
      local_agent: 'a',
      remote_agent: 'r',
      in_process_teammate: 't',
      local_workflow: 'w',
      monitor_mcp: 'm',
      dream: 'd',
    }

    for (const [type, prefix] of Object.entries(prefixMap)) {
      const id = generateTaskId(type as any)
      expect(id.startsWith(prefix)).toBe(true)
      // prefix + 8 random chars = 9 total
      expect(id.length).toBe(9)
    }
  })

  test('generateTaskId produces unique IDs', async () => {
    const { generateTaskId } = await import(path.join(ROOT, 'Task.ts'))
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) {
      ids.add(generateTaskId('local_bash'))
    }
    expect(ids.size).toBe(100)
  })

  test('generateTaskId uses only lowercase alphanumeric chars', async () => {
    const { generateTaskId } = await import(path.join(ROOT, 'Task.ts'))
    for (let i = 0; i < 50; i++) {
      const id = generateTaskId('local_agent')
      expect(id).toMatch(/^[a-z0-9]+$/)
    }
  })

  test('isTerminalTaskStatus correctly identifies terminal states', async () => {
    const { isTerminalTaskStatus } = await import(path.join(ROOT, 'Task.ts'))
    expect(isTerminalTaskStatus('completed')).toBe(true)
    expect(isTerminalTaskStatus('failed')).toBe(true)
    expect(isTerminalTaskStatus('killed')).toBe(true)
    expect(isTerminalTaskStatus('pending')).toBe(false)
    expect(isTerminalTaskStatus('running')).toBe(false)
  })

  test('createTaskStateBase returns correct shape', async () => {
    const { createTaskStateBase } = await import(path.join(ROOT, 'Task.ts'))
    const state = createTaskStateBase('test-id', 'local_bash', 'test task', 'tool-use-1')
    expect(state.id).toBe('test-id')
    expect(state.type).toBe('local_bash')
    expect(state.status).toBe('pending')
    expect(state.description).toBe('test task')
    expect(state.toolUseId).toBe('tool-use-1')
    expect(typeof state.startTime).toBe('number')
    expect(state.startTime).toBeGreaterThan(0)
    expect(typeof state.outputFile).toBe('string')
    expect(state.outputOffset).toBe(0)
    expect(state.notified).toBe(false)
  })

  test('createTaskStateBase works without optional toolUseId', async () => {
    const { createTaskStateBase } = await import(path.join(ROOT, 'Task.ts'))
    const state = createTaskStateBase('test-id', 'dream', 'dream task')
    expect(state.toolUseId).toBeUndefined()
  })
})

describe('spec 3.1.3.3: tasks.ts registry exports and correctness', () => {
  test('tasks.ts can be imported without error', async () => {
    const mod = await import(path.join(ROOT, 'tasks.ts'))
    expect(mod).toBeDefined()
  })

  test('exports getAllTasks', async () => {
    const { getAllTasks } = await import(path.join(ROOT, 'tasks.ts'))
    expect(typeof getAllTasks).toBe('function')
  })

  test('exports getTaskByType', async () => {
    const { getTaskByType } = await import(path.join(ROOT, 'tasks.ts'))
    expect(typeof getTaskByType).toBe('function')
  })

  test('getAllTasks returns at least 4 core tasks', async () => {
    const { getAllTasks } = await import(path.join(ROOT, 'tasks.ts'))
    const tasks = getAllTasks()
    expect(tasks.length).toBeGreaterThanOrEqual(4)
  })

  test('every task has required Task interface', async () => {
    const { getAllTasks } = await import(path.join(ROOT, 'tasks.ts'))
    const tasks = getAllTasks()
    for (const task of tasks) {
      expect(typeof task.name).toBe('string')
      expect(task.name.length).toBeGreaterThan(0)
      expect(typeof task.type).toBe('string')
      expect(typeof task.kill).toBe('function')
    }
  })

  test('core task types are registered', async () => {
    const { getAllTasks } = await import(path.join(ROOT, 'tasks.ts'))
    const tasks = getAllTasks()
    const types = new Set(tasks.map(t => t.type))
    expect(types.has('local_bash')).toBe(true)
    expect(types.has('local_agent')).toBe(true)
    expect(types.has('remote_agent')).toBe(true)
    expect(types.has('dream')).toBe(true)
  })

  test('getTaskByType finds known task types', async () => {
    const { getTaskByType } = await import(path.join(ROOT, 'tasks.ts'))
    expect(getTaskByType('local_bash')).toBeDefined()
    expect(getTaskByType('local_agent')).toBeDefined()
    expect(getTaskByType('remote_agent')).toBeDefined()
    expect(getTaskByType('dream')).toBeDefined()
  })

  test('getTaskByType returns undefined for unknown type', async () => {
    const { getTaskByType } = await import(path.join(ROOT, 'tasks.ts'))
    expect(getTaskByType('nonexistent' as any)).toBeUndefined()
  })

  test('feature-gated tasks are excluded when flags are false', async () => {
    const { getAllTasks } = await import(path.join(ROOT, 'tasks.ts'))
    const tasks = getAllTasks()
    const types = new Set(tasks.map(t => t.type))
    const flags = loadFeatures()
    if (!flags['WORKFLOW_SCRIPTS']) {
      expect(types.has('local_workflow')).toBe(false)
    }
    if (!flags['MONITOR_TOOL']) {
      expect(types.has('monitor_mcp')).toBe(false)
    }
  })
})

describe('spec 3.1.3.3: task framework exports', () => {
  test('framework.ts can be imported without error', async () => {
    const mod = await import(path.join(ROOT, 'utils/task/framework.ts'))
    expect(mod).toBeDefined()
  })

  test('exports updateTaskState', async () => {
    const { updateTaskState } = await import(
      path.join(ROOT, 'utils/task/framework.ts')
    )
    expect(typeof updateTaskState).toBe('function')
  })

  test('exports POLL_INTERVAL_MS constant', async () => {
    const { POLL_INTERVAL_MS } = await import(
      path.join(ROOT, 'utils/task/framework.ts')
    )
    expect(typeof POLL_INTERVAL_MS).toBe('number')
    expect(POLL_INTERVAL_MS).toBe(1000)
  })

  test('exports STOPPED_DISPLAY_MS constant', async () => {
    const { STOPPED_DISPLAY_MS } = await import(
      path.join(ROOT, 'utils/task/framework.ts')
    )
    expect(typeof STOPPED_DISPLAY_MS).toBe('number')
    expect(STOPPED_DISPLAY_MS).toBe(3000)
  })
})

describe('spec 3.1.3.3: diskOutput exports', () => {
  test('diskOutput.ts can be imported without error', async () => {
    const mod = await import(path.join(ROOT, 'utils/task/diskOutput.ts'))
    expect(mod).toBeDefined()
  })

  test('exports getTaskOutputPath', async () => {
    const { getTaskOutputPath } = await import(
      path.join(ROOT, 'utils/task/diskOutput.ts')
    )
    expect(typeof getTaskOutputPath).toBe('function')
  })

  test('getTaskOutputPath returns a string path', async () => {
    const { getTaskOutputPath } = await import(
      path.join(ROOT, 'utils/task/diskOutput.ts')
    )
    const outputPath = getTaskOutputPath('test-id')
    expect(typeof outputPath).toBe('string')
    expect(outputPath).toContain('test-id')
  })

  test('exports MAX_TASK_OUTPUT_BYTES constant', async () => {
    const { MAX_TASK_OUTPUT_BYTES } = await import(
      path.join(ROOT, 'utils/task/diskOutput.ts')
    )
    expect(typeof MAX_TASK_OUTPUT_BYTES).toBe('number')
    expect(MAX_TASK_OUTPUT_BYTES).toBe(5 * 1024 * 1024 * 1024) // 5GB
  })
})

describe('spec 3.1.3.3: task implementation files exist', () => {
  const TASK_IMPL_FILES = [
    'tasks/LocalShellTask/LocalShellTask.tsx',
    'tasks/LocalAgentTask/LocalAgentTask.tsx',
    'tasks/RemoteAgentTask/RemoteAgentTask.tsx',
    'tasks/DreamTask/DreamTask.ts',
    'tasks/types.ts',
  ]

  for (const file of TASK_IMPL_FILES) {
    test(`${file} exists`, () => {
      expect(existsSync(path.join(ROOT, file))).toBe(true)
    })
  }
})

describe('spec 3.1.3.3: TodoWrite v2 task system (utils/tasks.ts)', () => {
  test('utils/tasks.ts can be imported without error', async () => {
    const mod = await import(path.join(ROOT, 'utils/tasks.ts'))
    expect(mod).toBeDefined()
  })

  test('exports isTodoV2Enabled', async () => {
    const { isTodoV2Enabled } = await import(
      path.join(ROOT, 'utils/tasks.ts')
    )
    expect(typeof isTodoV2Enabled).toBe('function')
  })
})

// ===========================================================================
// Cross-cutting: integration between tool and task registries
// ===========================================================================

describe('cross-cutting: tool and task registries are consistent', () => {
  test('tools.ts uses same feature() import as tasks.ts', () => {
    const toolsSrc = readFileSync(path.join(ROOT, 'tools.ts'), 'utf-8')
    const tasksSrc = readFileSync(path.join(ROOT, 'tasks.ts'), 'utf-8')
    // Both should import feature from the reconstruction shim
    expect(toolsSrc).toContain("from 'src/reconstruction/feature.js'")
    expect(tasksSrc).toContain("from 'src/reconstruction/feature.js'")
  })

  test('MONITOR_TOOL flag gates both MonitorTool and MonitorMcpTask', () => {
    const toolsSrc = readFileSync(path.join(ROOT, 'tools.ts'), 'utf-8')
    const tasksSrc = readFileSync(path.join(ROOT, 'tasks.ts'), 'utf-8')
    expect(toolsSrc).toContain("feature('MONITOR_TOOL')")
    expect(tasksSrc).toContain("feature('MONITOR_TOOL')")
  })

  test('WORKFLOW_SCRIPTS flag gates both WorkflowTool and LocalWorkflowTask', () => {
    const toolsSrc = readFileSync(path.join(ROOT, 'tools.ts'), 'utf-8')
    const tasksSrc = readFileSync(path.join(ROOT, 'tasks.ts'), 'utf-8')
    expect(toolsSrc).toContain("feature('WORKFLOW_SCRIPTS')")
    expect(tasksSrc).toContain("feature('WORKFLOW_SCRIPTS')")
  })

  test('no unresolved runtime imports in tool/task surface', () => {
    const report = JSON.parse(
      readFileSync(
        path.join(ROOT, 'reconstruction/reports/unresolved-runtime.json'),
        'utf-8',
      ),
    )
    expect(report.totalUnresolved).toBe(0)
  })
})
