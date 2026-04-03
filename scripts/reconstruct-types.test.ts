import { describe, expect, test } from 'bun:test'
import {
  type AssistantMessage,
  type CollapsedReadSearchGroup,
  type GroupedToolUseMessage,
  type Message,
  type NormalizedUserMessage,
  type ProgressMessage,
  type RenderableMessage,
  type StreamEvent,
  type SystemAPIErrorMessage,
  type UserMessage,
} from '../types/message.js'
import type {
  AgentToolProgress,
  MCPProgress,
  ShellProgress,
  ToolProgressData,
  WebSearchProgress,
} from '../types/tools.js'
import {
  type SDKControlInitializeRequest,
  type SDKControlRequest,
  type SDKControlResponse,
  type SDKPartialAssistantMessage,
  type StdoutMessage,
} from '../entrypoints/sdk/controlTypes.js'
import { scanProject } from './reconstruct-scan.ts'

describe('reconstructed type surfaces', () => {
  test('support critical message/progress/control shapes used across runtime', () => {
    const user: UserMessage = {
      type: 'user',
      uuid: 'u1',
      timestamp: new Date().toISOString(),
      message: { role: 'user', content: 'hello' },
      origin: { kind: 'human' },
    }

    const assistant: AssistantMessage = {
      type: 'assistant',
      uuid: 'a1',
      timestamp: new Date().toISOString(),
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'hi' }],
      },
    }

    const streamEvent: StreamEvent = {
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta' } },
    }

    const apiError: SystemAPIErrorMessage = {
      type: 'system',
      subtype: 'api_error',
      level: 'error',
      uuid: 's1',
      timestamp: new Date().toISOString(),
      error: new Error('failed'),
      retryInMs: 1000,
      retryAttempt: 1,
      maxRetries: 5,
    }

    const normalizedResult: NormalizedUserMessage = {
      ...user,
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }],
      },
    }

    const grouped: GroupedToolUseMessage = {
      type: 'grouped_tool_use',
      toolName: 'Read',
      messages: [assistant],
      results: [normalizedResult],
      displayMessage: assistant,
      uuid: 'g1',
      timestamp: new Date().toISOString(),
      messageId: 'msg_1',
    }

    const collapsed: CollapsedReadSearchGroup = {
      type: 'collapsed_read_search',
      uuid: 'c1',
      timestamp: new Date().toISOString(),
      searchCount: 1,
      readCount: 2,
      listCount: 0,
      replCount: 0,
      memorySearchCount: 0,
      memoryReadCount: 0,
      memoryWriteCount: 0,
      readFilePaths: ['README.md'],
      searchArgs: ['readme'],
      messages: [assistant],
      displayMessage: assistant,
    }

    const shellProgress: ShellProgress = {
      type: 'shell_progress',
      output: 'running',
      elapsedTimeSeconds: 1,
      totalLines: 1,
    }
    const agentProgress: AgentToolProgress = {
      type: 'agent_progress',
      message: assistant,
    }
    const mcpProgress: MCPProgress = {
      type: 'mcp_progress',
      progress: 1,
      total: 2,
    }
    const webProgress: WebSearchProgress = {
      type: 'search_results_received',
      query: 'bun',
      resultCount: 3,
    }

    const progressMessage: ProgressMessage<ToolProgressData> = {
      type: 'progress',
      uuid: 'p1',
      timestamp: new Date().toISOString(),
      toolUseID: 'tool_1',
      data: shellProgress,
    }

    const initRequest: SDKControlInitializeRequest = {
      subtype: 'initialize',
      promptSuggestions: true,
    }
    const controlRequest: SDKControlRequest = {
      type: 'control_request',
      request_id: 'r1',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        input: { command: 'ls' },
        tool_use_id: 'tool_1',
      },
    }
    const controlResponse: SDKControlResponse = {
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: 'r1',
        response: { behavior: 'allow' },
      },
    }
    const partialAssistant: SDKPartialAssistantMessage = {
      type: 'stream_event',
      uuid: 'e1',
      session_id: 'sess_1',
      parent_tool_use_id: null,
      event: { type: 'message_start', message: { id: 'msg_1' } },
    }

    const messages: Message[] = [user, assistant, apiError, progressMessage]
    const renderable: RenderableMessage[] = [assistant, grouped, collapsed]
    const stdout: StdoutMessage[] = [
      controlRequest,
      controlResponse,
      partialAssistant,
    ]

    expect(initRequest.subtype).toBe('initialize')
    expect(streamEvent.type).toBe('stream_event')
    expect(messages.length).toBe(4)
    expect(renderable.length).toBe(3)
    expect(stdout.length).toBe(3)
    expect(agentProgress.message.type).toBe('assistant')
    expect(mcpProgress.total).toBe(2)
    expect(webProgress.type).toBe('search_results_received')
  })
})

describe('reconstruct scan coverage', () => {
  test('does not report reconstructed type surfaces as unresolved type imports', () => {
    const scan = scanProject(process.cwd())
    const resolvedTargets = new Set([
      'types/message.ts',
      'types/tools.ts',
      'entrypoints/sdk/controlTypes.ts',
    ])

    const unresolved = scan.unresolvedTypes.filter((entry) =>
      resolvedTargets.has(entry.expectedModulePath),
    )

    expect(unresolved).toHaveLength(0)
  })
})

