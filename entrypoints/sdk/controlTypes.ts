type AnyRecord = Record<string, unknown>

type BaseIOMessage = {
  uuid?: string
  session_id?: string
  parent_tool_use_id?: string | null
  [key: string]: unknown
}

type SDKAssistantLikeMessage = BaseIOMessage & {
  type: 'assistant'
  message: {
    content: unknown[] | string
    [key: string]: unknown
  }
  error?: unknown
}

type SDKUserLikeMessage = BaseIOMessage & {
  type: 'user'
  message: {
    role?: string
    content: unknown
    [key: string]: unknown
  }
  timestamp?: string
  isSynthetic?: boolean
  tool_use_result?: unknown
}

type SDKSystemLikeMessage = BaseIOMessage & {
  type: 'system'
  subtype?: string
}

type SDKResultLikeMessage = BaseIOMessage & {
  type: 'result'
  subtype?: string
  errors?: string[]
}

type SDKToolProgressLikeMessage = BaseIOMessage & {
  type: 'tool_progress'
  tool_name?: string
  elapsed_time_seconds?: number
  tool_use_id?: string
}

type SDKAuthStatusLikeMessage = BaseIOMessage & {
  type: 'auth_status'
  isAuthenticating?: boolean
  output?: string
  error?: string
}

type SDKRateLimitEventLikeMessage = BaseIOMessage & {
  type: 'rate_limit_event'
}

type SDKToolUseSummaryLikeMessage = BaseIOMessage & {
  type: 'tool_use_summary'
  summary?: string
}

type SDKStreamlinedTextMessage = BaseIOMessage & {
  type: 'streamlined_text'
  text: string
}

type SDKStreamlinedToolUseSummaryMessage = BaseIOMessage & {
  type: 'streamlined_tool_use_summary'
  tool_summary: string
}

type SDKKeepAliveMessage = {
  type: 'keep_alive'
  [key: string]: unknown
}

export type SDKPartialAssistantMessage = BaseIOMessage & {
  type: 'stream_event'
  event: {
    type: string
    [key: string]: unknown
  }
  ttftMs?: number
}

export type SDKControlPermissionRequest = {
  subtype: 'can_use_tool'
  tool_name: string
  input: Record<string, unknown>
  permission_suggestions?: unknown[]
  blocked_path?: string
  decision_reason?: string
  title?: string
  display_name?: string
  tool_use_id: string
  agent_id?: string
  description?: string
  [key: string]: unknown
}

export type SDKControlInitializeRequest = {
  subtype: 'initialize'
  hooks?: Record<
    string,
    Array<{
      matcher?: string
      hookCallbackIds: string[]
      timeout?: number
    }>
  >
  sdkMcpServers?: string[]
  jsonSchema?: Record<string, unknown>
  systemPrompt?: string
  appendSystemPrompt?: string
  agents?: Record<string, unknown>
  promptSuggestions?: boolean
  agentProgressSummaries?: boolean
  [key: string]: unknown
}

export type SDKControlInitializeResponse = {
  commands: Array<{
    name: string
    description: string
    argumentHint?: string
    [key: string]: unknown
  }>
  agents: Array<{
    name: string
    description?: string
    model?: string
    [key: string]: unknown
  }>
  output_style: string
  available_output_styles: string[]
  models: unknown[]
  account: {
    email?: string
    organization?: string
    subscriptionType?: string
    tokenSource?: string
    apiKeySource?: string
    apiProvider?: string
    [key: string]: unknown
  }
  pid?: number
  fast_mode_state?: unknown
  [key: string]: unknown
}

export type SDKControlMcpSetServersResponse = {
  added: string[]
  removed: string[]
  errors: Record<string, string>
  [key: string]: unknown
}

export type SDKControlReloadPluginsResponse = {
  commands: Array<{
    name: string
    description: string
    argumentHint?: string
    [key: string]: unknown
  }>
  agents: Array<{
    name: string
    description?: string
    model?: string
    [key: string]: unknown
  }>
  plugins: Array<{
    name: string
    path?: string
    source?: string
    [key: string]: unknown
  }>
  mcpServers: unknown[]
  error_count: number
  [key: string]: unknown
}

type SDKControlGenericRequest<Subtype extends string> = {
  subtype: Subtype
  [key: string]: unknown
}

type KnownControlRequestSubtype =
  | 'initialize'
  | 'interrupt'
  | 'end_session'
  | 'set_permission_mode'
  | 'set_model'
  | 'set_max_thinking_tokens'
  | 'mcp_status'
  | 'get_context_usage'
  | 'mcp_message'
  | 'rewind_files'
  | 'cancel_async_message'
  | 'seed_read_state'
  | 'mcp_set_servers'
  | 'reload_plugins'
  | 'mcp_reconnect'
  | 'mcp_toggle'
  | 'channel_enable'
  | 'mcp_authenticate'
  | 'mcp_oauth_callback_url'
  | 'claude_authenticate'
  | 'claude_oauth_callback'
  | 'claude_oauth_wait_for_completion'
  | 'mcp_clear_auth'
  | 'apply_flag_settings'
  | 'get_settings'
  | 'stop_task'
  | 'generate_session_title'
  | 'side_question'
  | 'remote_control'
  | 'hook_callback'
  | 'elicitation'
  | 'can_use_tool'

type SDKControlUnknownRequest = {
  subtype: Exclude<string, KnownControlRequestSubtype>
  [key: string]: unknown
}

export type SDKControlRequestInner =
  | SDKControlPermissionRequest
  | SDKControlInitializeRequest
  | SDKControlGenericRequest<
      Exclude<KnownControlRequestSubtype, 'can_use_tool' | 'initialize'>
    >
  | SDKControlUnknownRequest

export type SDKControlRequest = BaseIOMessage & {
  type: 'control_request'
  request_id: string
  request: SDKControlRequestInner
}

export type SDKControlCancelRequest = BaseIOMessage & {
  type: 'control_cancel_request'
  request_id: string
}

type SDKControlSuccessResponse<T = unknown> = {
  subtype: 'success'
  request_id: string
  response: T
  pending_permission_requests?: SDKControlPermissionRequest[]
}

type SDKControlErrorResponse = {
  subtype: 'error'
  request_id: string
  error: string
  pending_permission_requests?: SDKControlPermissionRequest[]
}

export type SDKControlResponse = BaseIOMessage & {
  type: 'control_response'
  response: SDKControlSuccessResponse | SDKControlErrorResponse
}

type SDKUpdateEnvironmentVariablesMessage = {
  type: 'update_environment_variables'
  variables: Record<string, string>
}

export type StdoutMessage =
  | SDKAssistantLikeMessage
  | SDKUserLikeMessage
  | SDKSystemLikeMessage
  | SDKResultLikeMessage
  | SDKToolProgressLikeMessage
  | SDKAuthStatusLikeMessage
  | SDKRateLimitEventLikeMessage
  | SDKToolUseSummaryLikeMessage
  | SDKPartialAssistantMessage
  | SDKStreamlinedTextMessage
  | SDKStreamlinedToolUseSummaryMessage
  | SDKControlRequest
  | SDKControlResponse
  | SDKControlCancelRequest
  | SDKKeepAliveMessage
  | (BaseIOMessage & { type: string; [key: string]: unknown })

export type StdinMessage =
  | SDKUserLikeMessage
  | SDKAssistantLikeMessage
  | SDKSystemLikeMessage
  | SDKControlRequest
  | SDKControlResponse
  | SDKControlCancelRequest
  | SDKKeepAliveMessage
  | SDKUpdateEnvironmentVariablesMessage
  | (AnyRecord & { type: string })

