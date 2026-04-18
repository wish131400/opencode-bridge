import type {
  ChatEvent,
  ChatHistoryMessage,
  ChatMessagePart,
  ChatModelRef,
  ChatPermissionRequest,
  ChatTodoItem,
  ChatTokenUsage,
} from '../api'

export type ChatMessageStatus = 'streaming' | 'done' | 'error'
export type ChatStreamState = 'disconnected' | 'connecting' | 'connected' | 'idle'

export interface ChatToolCallVm {
  id: string
  callId: string
  name: string
  title?: string
  input?: unknown
  output: string
  status: 'running' | 'completed' | 'error'
  isError: boolean
  durationMs?: number
}

export interface ChatMessageVm {
  id: string
  role: 'user' | 'assistant'
  createdAt: number
  text: string
  reasoning: string
  tools: ChatToolCallVm[]
  status: ChatMessageStatus
  usage?: ChatTokenUsage
  finish?: string
  error?: string
  model?: ChatModelRef
  agent?: string
  optimistic?: boolean
}

function isTodoWriteTool(name: string): boolean {
  const normalized = name.trim().toLowerCase()
  return normalized === 'todowrite' || normalized === 'todo_write' || normalized === 'todo-write'
}

function toTodoItems(raw: unknown): ChatTodoItem[] | undefined {
  if (!Array.isArray(raw)) return undefined

  const tasks: ChatTodoItem[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    const contentValue = record.content ?? record.title ?? record.text
    const content = typeof contentValue === 'string' ? contentValue.trim() : ''
    const status = typeof record.status === 'string' && record.status.trim()
      ? record.status.trim()
      : 'pending'

    if (!id || !content) continue
    tasks.push({
      id,
      content,
      status,
      priority: typeof record.priority === 'string' ? record.priority : undefined,
    })
  }

  return tasks.length > 0 ? tasks : undefined
}

function extractTodoItemsFromToolState(state: Extract<ChatMessagePart, { type: 'tool' }>['state']): ChatTodoItem[] | undefined {
  if ('metadata' in state && state.metadata?.todos) {
    const fromMetadata = toTodoItems(state.metadata.todos)
    if (fromMetadata) return fromMetadata
  }

  return toTodoItems(state.input?.todos)
}

function toModelRef(message: ChatHistoryMessage['info']): ChatModelRef | undefined {
  if (message.role === 'user' && message.model?.providerID && message.model?.modelID) {
    return {
      providerId: message.model.providerID,
      modelId: message.model.modelID,
    }
  }

  if (message.role === 'assistant' && message.providerID && message.modelID) {
    return {
      providerId: message.providerID,
      modelId: message.modelID,
    }
  }

  return undefined
}

function toUsage(message: ChatHistoryMessage['info']): ChatTokenUsage | undefined {
  const tokens = message.tokens
  if (!tokens) return undefined
  return {
    input: tokens.input ?? 0,
    output: tokens.output ?? 0,
    reasoning: tokens.reasoning ?? 0,
    cacheRead: tokens.cache?.read ?? 0,
    cacheWrite: tokens.cache?.write ?? 0,
    cost: message.cost,
  }
}

function appendToolPart(tools: ChatToolCallVm[], part: Extract<ChatMessagePart, { type: 'tool' }>): void {
  const existing = tools.find(item => item.id === part.id || item.callId === part.callID)
  const status = part.state.status === 'error'
    ? 'error'
    : part.state.status === 'completed'
      ? 'completed'
      : 'running'
  const output = part.state.status === 'completed'
    ? part.state.output
    : part.state.status === 'error'
      ? part.state.error
      : ''

  const next: ChatToolCallVm = {
    id: part.id,
    callId: part.callID,
    name: part.tool,
    input: part.state.input,
    title: 'title' in part.state ? part.state.title : undefined,
    output,
    status,
    isError: part.state.status === 'error',
  }

  if (existing) {
    Object.assign(existing, next)
    return
  }

  tools.push(next)
}

export function normalizeHistoryMessage(message: ChatHistoryMessage): ChatMessageVm {
  const textParts: string[] = []
  const reasoningParts: string[] = []
  const tools: ChatToolCallVm[] = []

  for (const part of message.parts ?? []) {
    if (part.type === 'text') {
      textParts.push(part.text ?? '')
      continue
    }

    if (part.type === 'reasoning') {
      reasoningParts.push(part.text ?? '')
      continue
    }

    if (part.type === 'tool') {
      appendToolPart(tools, part)
    }
  }

  const error = message.info.error?.data?.message
  const assistantDone = message.info.role === 'assistant' && Boolean(message.info.time.completed)

  return {
    id: message.info.id,
    role: message.info.role,
    createdAt: (message.info.time.created ?? Date.now() / 1000) * 1000,
    text: textParts.join(''),
    reasoning: reasoningParts.join(''),
    tools,
    status: error ? 'error' : assistantDone || message.info.role === 'user' ? 'done' : 'streaming',
    usage: message.info.role === 'assistant' ? toUsage(message.info) : undefined,
    finish: message.info.finish,
    error,
    model: toModelRef(message.info),
    agent: message.info.role === 'assistant' ? message.info.mode : message.info.agent,
  }
}

export function extractTasksFromHistory(history: ChatHistoryMessage[]): ChatTodoItem[] {
  let latestTasks: ChatTodoItem[] = []

  for (const message of history) {
    for (const part of message.parts ?? []) {
      if (part.type !== 'tool' || !isTodoWriteTool(part.tool)) continue
      const nextTasks = extractTodoItemsFromToolState(part.state)
      if (nextTasks) {
        latestTasks = nextTasks
      }
    }
  }

  return latestTasks
}

function createAssistantMessage(msgId: string, createdAt = Date.now()): ChatMessageVm {
  return {
    id: msgId,
    role: 'assistant',
    createdAt,
    text: '',
    reasoning: '',
    tools: [],
    status: 'streaming',
  }
}

function upsertMessage(messages: ChatMessageVm[], message: ChatMessageVm): ChatMessageVm {
  const existing = messages.find(item => item.id === message.id)
  if (existing) {
    Object.assign(existing, message)
    return existing
  }

  messages.push(message)
  messages.sort((left, right) => left.createdAt - right.createdAt)
  return message
}

function ensureAssistant(messages: ChatMessageVm[], msgId: string): ChatMessageVm {
  const existing = messages.find(item => item.id === msgId)
  if (existing) return existing
  return upsertMessage(messages, createAssistantMessage(msgId))
}

function ensureTool(message: ChatMessageVm, toolId: string, callId: string, name: string): ChatToolCallVm {
  let tool = message.tools.find(item => item.id === toolId || item.callId === callId)
  if (!tool) {
    tool = {
      id: toolId,
      callId,
      name,
      output: '',
      status: 'running',
      isError: false,
    }
    message.tools.push(tool)
  }
  return tool
}

export function applyChatEvent(messages: ChatMessageVm[], event: ChatEvent): void {
  switch (event.type) {
    case 'message_start':
      upsertMessage(messages, {
        id: event.msg.id,
        role: event.msg.role,
        createdAt: event.msg.createdAt,
        text: '',
        reasoning: '',
        tools: [],
        status: 'streaming',
        model: event.msg.model,
        agent: event.msg.agent,
      })
      return

    case 'text_delta':
      ensureAssistant(messages, event.msgId).text += event.text
      return

    case 'reasoning_delta':
      ensureAssistant(messages, event.msgId).reasoning += event.text
      return

    case 'tool_start': {
      const message = ensureAssistant(messages, event.msgId)
      const tool = ensureTool(message, event.tool.id, event.tool.callId, event.tool.name)
      tool.input = event.tool.input
      tool.title = event.tool.title
      tool.status = 'running'
      tool.isError = false
      return
    }

    case 'tool_delta': {
      const message = ensureAssistant(messages, event.msgId)
      const tool = ensureTool(message, event.toolId, event.toolId, 'tool')
      tool.output += event.output
      return
    }

    case 'tool_end': {
      const message = ensureAssistant(messages, event.msgId)
      const tool = ensureTool(message, event.toolId, event.callId, event.name)
      tool.title = event.title
      tool.output = event.result
      tool.status = event.isError ? 'error' : 'completed'
      tool.isError = event.isError
      tool.durationMs = event.durationMs
      return
    }

    case 'message_end': {
      const message = ensureAssistant(messages, event.msgId)
      message.status = event.error ? 'error' : 'done'
      message.error = event.error
      message.finish = event.finish
      message.usage = event.usage
      return
    }

    default:
      return
  }
}

export function createOptimisticUserMessage(text: string, model?: ChatModelRef): ChatMessageVm {
  return {
    id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: 'user',
    createdAt: Date.now(),
    text,
    reasoning: '',
    tools: [],
    status: 'done',
    model,
    optimistic: true,
  }
}

export function createErrorAssistantMessage(message: string): ChatMessageVm {
  return {
    id: `error-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: 'assistant',
    createdAt: Date.now(),
    text: '',
    reasoning: '',
    tools: [],
    status: 'error',
    error: message,
  }
}

export function mergeChatMessages(history: ChatMessageVm[], current: ChatMessageVm[]): ChatMessageVm[] {
  const merged = new Map<string, ChatMessageVm>()

  for (const message of history) {
    merged.set(message.id, { ...message, tools: message.tools.map(tool => ({ ...tool })) })
  }

  for (const message of current) {
    const existing = merged.get(message.id)
    if (!existing) {
      merged.set(message.id, { ...message, tools: message.tools.map(tool => ({ ...tool })) })
      continue
    }

    merged.set(message.id, {
      ...existing,
      ...message,
      text: message.text.length >= existing.text.length ? message.text : existing.text,
      reasoning: message.reasoning.length >= existing.reasoning.length ? message.reasoning : existing.reasoning,
      tools: message.tools.length >= existing.tools.length ? message.tools : existing.tools,
      usage: message.usage ?? existing.usage,
      error: message.error ?? existing.error,
      optimistic: message.optimistic || existing.optimistic,
      status: message.status === 'streaming' ? 'streaming' : existing.status === 'error' ? 'error' : message.status,
    })
  }

  return Array.from(merged.values()).sort((left, right) => left.createdAt - right.createdAt)
}

// 支持的思考强度选项映射，用于标准化不同模型的参数名称
export const EFFORT_VARIANT_MAP: Record<string, string> = {
  'none': 'none',
  'minimal': 'minimal',
  'low': 'low',
  'medium': 'medium',
  'high': 'high',
  'max': 'max',
  'xhigh': 'xhigh',
  'fast': 'low',
  'balanced': 'high',
  'deep': 'xhigh',
  // 兼容其他可能的参数名称
  'thinking_low': 'low',
  'thinking_medium': 'medium',
  'thinking_high': 'high',
  'reasoning_low': 'low',
  'reasoning_medium': 'medium',
  'reasoning_high': 'high',
}

// 获取标准化的思考强度选项
export function normalizeVariant(variant: string): string {
  const normalized = variant.trim().toLowerCase()
  return EFFORT_VARIANT_MAP[normalized] || variant
}

export function formatVariantLabel(variant?: string): string {
  if (!variant) return '默认'
  return normalizeVariant(variant)
}

export function resolveSupportedVariant(
  variant: string | undefined,
  supportedVariants: string[]
): string | undefined {
  const nextVariant = typeof variant === 'string' ? variant.trim() : ''
  if (!nextVariant) {
    return undefined
  }

  const exactMatch = supportedVariants.find(item => item === nextVariant)
  if (exactMatch) {
    return exactMatch
  }

  const normalized = normalizeVariant(nextVariant)
  return supportedVariants.find(item => normalizeVariant(item) === normalized)
}

// 检查模型是否支持特定的思考强度
export function isVariantSupported(variant: string, supportedVariants: string[]): boolean {
  return Boolean(resolveSupportedVariant(variant, supportedVariants))
}

export type { ChatPermissionRequest, ChatTodoItem }
