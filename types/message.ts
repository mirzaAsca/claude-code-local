import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import type { UUID } from 'crypto'

type AnyRecord = Record<string, unknown>

type BaseMessage = {
  uuid: UUID | string
  timestamp: string
  isMeta?: boolean
  isVirtual?: true
  [key: string]: unknown
}

type UserMessagePayload = {
  role: 'user'
  content: string | ContentBlockParam[]
  [key: string]: unknown
}

type AssistantMessagePayload = {
  id?: string
  model?: string
  role: 'assistant'
  content: ContentBlockParam[] | string
  [key: string]: unknown
}

export type MessageOrigin =
  | { kind: 'human' }
  | { kind: 'task-notification' }
  | { kind: 'channel'; server: string }
  | { kind: 'coordinator' }
  | { kind: string; [key: string]: unknown }

export type PartialCompactDirection = 'from' | 'to'

export type CompactMetadata = {
  trigger: 'manual' | 'auto' | string
  preTokens: number
  userContext?: string
  messagesSummarized?: number
  preservedSegment?: {
    headUuid: UUID | string
    anchorUuid: UUID | string
    tailUuid: UUID | string
  }
}

export type StopHookInfo = {
  command: string
  promptText?: string
  durationMs?: number
}

export type UserMessage = BaseMessage & {
  type: 'user'
  message: UserMessagePayload
  isVisibleInTranscriptOnly?: true
  isCompactSummary?: true
  summarizeMetadata?: {
    messagesSummarized: number
    userContext?: string
    direction?: PartialCompactDirection
  }
  toolUseResult?: unknown
  mcpMeta?: {
    _meta?: AnyRecord
    structuredContent?: AnyRecord
  }
  imagePasteIds?: number[]
  sourceToolAssistantUUID?: UUID | string
  permissionMode?: string
  origin?: MessageOrigin
}

export type AssistantMessage = BaseMessage & {
  type: 'assistant'
  message: AssistantMessagePayload
  requestId?: string
  apiError?: string
  error?: unknown
  errorDetails?: string
  isApiErrorMessage?: boolean
  advisorModel?: string
}

type AttachmentPayload = {
  type: string
  [key: string]: unknown
}

export type AttachmentMessage<TAttachment extends AttachmentPayload = AttachmentPayload> = BaseMessage & {
  type: 'attachment'
  attachment: TAttachment
  toolUseID?: string
  parentToolUseID?: string
}

export type HookResultAttachment = AttachmentPayload & {
  type:
    | 'hook_blocking_error'
    | 'hook_non_blocking_error'
    | 'hook_error_during_execution'
    | 'hook_stopped_continuation'
    | 'hook_success'
    | 'hook_additional_context'
    | 'hook_system_message'
    | 'hook_cancelled'
    | 'hook_permission_decision'
}

export type HookResultMessage = AttachmentMessage<HookResultAttachment>

export type ProgressMessage<P = unknown> = BaseMessage & {
  type: 'progress'
  data: P
  toolUseID?: string
  parentToolUseID?: string
}

export type RequestStartEvent = {
  type: 'stream_request_start'
  uuid?: UUID | string
  timestamp?: string
  [key: string]: unknown
}

export type StreamEvent = {
  type: 'stream_event'
  event: {
    type: string
    [key: string]: unknown
  }
  ttftMs?: number
  [key: string]: unknown
}

export type TombstoneMessage = {
  type: 'tombstone'
  message: Message
  uuid?: UUID | string
  timestamp?: string
  [key: string]: unknown
}

export type ToolUseSummaryMessage = {
  type: 'tool_use_summary'
  summary: string
  precedingToolUseIds: string[]
  uuid: UUID | string
  timestamp: string
  [key: string]: unknown
}

export type SystemMessageLevel = 'info' | 'warning' | 'error'

type SystemMessageBase = BaseMessage & {
  type: 'system'
  subtype: string
  content?: string
  level?: SystemMessageLevel
  toolUseID?: string
  preventContinuation?: boolean
}

export type SystemInformationalMessage = SystemMessageBase & {
  subtype: 'informational'
  content: string
  level: SystemMessageLevel
}

export type SystemPermissionRetryMessage = SystemMessageBase & {
  subtype: 'permission_retry'
  commands: string[]
}

export type SystemBridgeStatusMessage = SystemMessageBase & {
  subtype: 'bridge_status'
  url: string
  upgradeNudge?: string
}

export type SystemScheduledTaskFireMessage = SystemMessageBase & {
  subtype: 'scheduled_task_fire'
  content: string
}

export type SystemStopHookSummaryMessage = SystemMessageBase & {
  subtype: 'stop_hook_summary'
  hookCount: number
  hookInfos: StopHookInfo[]
  hookErrors: string[]
  preventedContinuation: boolean
  stopReason?: string
  hasOutput: boolean
  hookLabel?: string
  totalDurationMs?: number
}

export type SystemTurnDurationMessage = SystemMessageBase & {
  subtype: 'turn_duration'
  durationMs: number
  budgetTokens?: number
  budgetLimit?: number
  budgetNudges?: number
  messageCount?: number
}

export type SystemAwaySummaryMessage = SystemMessageBase & {
  subtype: 'away_summary'
  content: string
}

export type SystemMemorySavedMessage = SystemMessageBase & {
  subtype: 'memory_saved'
  writtenPaths: string[]
}

export type SystemAgentsKilledMessage = SystemMessageBase & {
  subtype: 'agents_killed'
}

export type SystemApiMetricsMessage = SystemMessageBase & {
  subtype: 'api_metrics'
  ttftMs: number
  otps: number
  isP50?: boolean
  hookDurationMs?: number
  turnDurationMs?: number
  toolDurationMs?: number
  classifierDurationMs?: number
  toolCount?: number
  hookCount?: number
  classifierCount?: number
  configWriteCount?: number
}

export type SystemLocalCommandMessage = SystemMessageBase & {
  subtype: 'local_command'
  content: string
}

export type SystemCompactBoundaryMessage = SystemMessageBase & {
  subtype: 'compact_boundary'
  compactMetadata: CompactMetadata
  logicalParentUuid?: UUID | string
}

export type SystemMicrocompactBoundaryMessage = SystemMessageBase & {
  subtype: 'microcompact_boundary'
  microcompactMetadata: {
    trigger: 'auto' | string
    preTokens: number
    tokensSaved: number
    compactedToolIds: string[]
    clearedAttachmentUUIDs: string[]
  }
}

export type SystemAPIErrorMessage = SystemMessageBase & {
  subtype: 'api_error'
  level: 'error'
  error: unknown
  cause?: Error
  retryInMs: number
  retryAttempt: number
  maxRetries: number
}

export type SystemFileSnapshotMessage = SystemMessageBase & {
  subtype: 'file_snapshot'
  snapshotFiles: Array<{
    key: string
    path: string
    content: string
  }>
}

export type SystemThinkingMessage = SystemMessageBase & {
  subtype: 'thinking'
  content?: string
  isStreaming?: boolean
  streamingEndedAt?: number
}

export type SystemMessage =
  | SystemInformationalMessage
  | SystemPermissionRetryMessage
  | SystemBridgeStatusMessage
  | SystemScheduledTaskFireMessage
  | SystemStopHookSummaryMessage
  | SystemTurnDurationMessage
  | SystemAwaySummaryMessage
  | SystemMemorySavedMessage
  | SystemAgentsKilledMessage
  | SystemApiMetricsMessage
  | SystemLocalCommandMessage
  | SystemCompactBoundaryMessage
  | SystemMicrocompactBoundaryMessage
  | SystemAPIErrorMessage
  | SystemFileSnapshotMessage
  | SystemThinkingMessage
  | SystemMessageBase

export type Message =
  | UserMessage
  | AssistantMessage
  | AttachmentMessage
  | ProgressMessage
  | SystemMessage

export type NormalizedUserMessage = Omit<UserMessage, 'message'> & {
  message: Omit<UserMessagePayload, 'content'> & {
    content: ContentBlockParam[]
  }
}

export type NormalizedAssistantMessage = AssistantMessage

export type NormalizedMessage =
  | NormalizedUserMessage
  | NormalizedAssistantMessage
  | AttachmentMessage
  | ProgressMessage
  | SystemMessage

export type CollapsibleMessage =
  | NormalizedUserMessage
  | NormalizedAssistantMessage
  | AttachmentMessage
  | SystemMessage

export type GroupedToolUseMessage = {
  type: 'grouped_tool_use'
  toolName: string
  messages: NormalizedAssistantMessage[]
  results: NormalizedUserMessage[]
  displayMessage: NormalizedAssistantMessage
  uuid: UUID | string
  timestamp: string
  messageId: string
  [key: string]: unknown
}

export type CollapsedReadSearchGroup = {
  type: 'collapsed_read_search'
  searchCount: number
  readCount: number
  listCount: number
  replCount: number
  memorySearchCount: number
  memoryReadCount: number
  memoryWriteCount: number
  readFilePaths: string[]
  searchArgs: string[]
  latestDisplayHint?: string
  messages: CollapsibleMessage[]
  displayMessage: CollapsibleMessage
  uuid: UUID | string
  timestamp: string
  teamMemorySearchCount?: number
  teamMemoryReadCount?: number
  teamMemoryWriteCount?: number
  mcpCallCount?: number
  mcpServerNames?: string[]
  bashCount?: number
  gitOpBashCount?: number
  commits?: string[]
  pushes?: string[]
  branches?: string[]
  prs?: string[]
  hookTotalMs?: number
  hookCount?: number
  hookInfos?: StopHookInfo[]
  relevantMemories?: Array<{ path: string; content: string; mtimeMs: number }>
  [key: string]: unknown
}

export type RenderableMessage =
  | Exclude<NormalizedMessage, ProgressMessage>
  | GroupedToolUseMessage
  | CollapsedReadSearchGroup
