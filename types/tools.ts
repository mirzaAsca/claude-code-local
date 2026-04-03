import type { Message } from './message.js'

type BaseProgress = {
  type: string
  [key: string]: unknown
}

export type ShellProgress = BaseProgress & {
  type: 'shell_progress' | 'bash_progress' | 'powershell_progress' | string
  output?: string
  fullOutput?: string
  elapsedTimeSeconds?: number
  totalLines?: number
  totalBytes?: number
  timeoutMs?: number
  taskId?: string
}

export type BashProgress = ShellProgress & {
  type: 'bash_progress' | 'shell_progress' | string
}

export type PowerShellProgress = ShellProgress & {
  type: 'powershell_progress' | 'shell_progress' | string
}

export type AgentToolProgress = BaseProgress & {
  type: 'agent_progress' | string
  message: Message
  agentId?: string
  agentType?: string
  description?: string
}

export type SkillToolProgress = BaseProgress & {
  type: 'skill_progress' | string
  message: Message
  skillName?: string
}

export type MCPProgress = BaseProgress & {
  type: 'mcp_progress' | string
  progress?: number
  total?: number
  progressMessage?: string
}

export type REPLToolProgress = BaseProgress & {
  type: 'repl_progress' | string
  text?: string
}

export type TaskOutputProgress = BaseProgress & {
  type: 'task_output_progress' | string
  taskId?: string
  output?: string
}

export type WebSearchProgress =
  | {
      type: 'query_update'
      query: string
      [key: string]: unknown
    }
  | {
      type: 'search_results_received'
      query: string
      resultCount: number
      [key: string]: unknown
    }
  | BaseProgress

export type SdkWorkflowProgress = BaseProgress & {
  type: string
  index: number
  phaseIndex?: number
  label?: string
  status?: string
}

export type ToolProgressData =
  | AgentToolProgress
  | BashProgress
  | MCPProgress
  | PowerShellProgress
  | REPLToolProgress
  | ShellProgress
  | SkillToolProgress
  | TaskOutputProgress
  | WebSearchProgress
  | SdkWorkflowProgress

