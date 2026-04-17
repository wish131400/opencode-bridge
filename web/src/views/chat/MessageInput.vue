<template>
  <div class="message-input">
    <div class="toolbar">
      <div class="selector-column">
        <div class="selector-field">
          <label>模型</label>
          <span class="field-tip">未选时走系统默认模型。</span>
          <el-select
            :model-value="selectedModelKey"
            placeholder="选择模型"
            clearable
            filterable
            @update:model-value="handleModelChange"
          >
            <el-option label="系统默认模型" value="" />
            <el-option-group
              v-for="group in modelOptionGroups"
              :key="group.providerId"
              :label="group.providerName"
            >
              <el-option
                v-for="option in group.options"
                :key="option.key"
                :label="option.label"
                :value="option.key"
              />
            </el-option-group>
          </el-select>
        </div>

        <div class="selector-field">
          <label>思考强度</label>
          <span class="field-tip">仅保存在当前页面内存，重启或刷新后失效。</span>
          <el-select
            :model-value="variant || ''"
            placeholder="默认强度"
            clearable
            @update:model-value="handleVariantChange"
          >
            <el-option label="默认强度" value="" />
            <el-option
              v-for="item in normalizedVariants"
              :key="item"
              :label="formatEffortLabel(item)"
              :value="item"
            />
          </el-select>
        </div>

        <div class="selector-field">
          <label>代理人</label>
          <span class="field-tip">这里只选主角色，不选子角色。</span>
          <el-select
            :model-value="agentName || ''"
            placeholder="默认代理人"
            clearable
            filterable
            @update:model-value="handleAgentChange"
          >
            <el-option label="默认代理人" value="" />
            <el-option
              v-for="agent in normalizedAgents"
              :key="agent.name"
              :label="buildAgentLabel(agent)"
              :value="agent.name"
            />
          </el-select>
        </div>
      </div>

      <div class="hint">输入 `/` 打开命令面板，`Enter` 发送，`Ctrl + Enter` 或 `Shift + Enter` 换行</div>
    </div>

    <div class="composer">
      <el-input
        v-model="draftModel"
        type="textarea"
        resize="none"
        :rows="4"
        :disabled="disabled"
        placeholder="输入你的问题。输入 / 可查看 OpenCode 或 Bridge 内置命令，Enter 发送，Ctrl + Enter 或 Shift + Enter 换行。"
        @keydown="handleKeydown"
      />

      <div v-if="showSlashPalette" class="slash-panel">
        <div class="slash-panel__head">
          <strong>/ 命令</strong>
          <span>{{ filteredCommands.length }} 条</span>
        </div>

        <div v-if="commandsLoading" class="slash-panel__state">正在读取命令...</div>
        <div v-else-if="commandsError" class="slash-panel__state slash-panel__state--error">{{ commandsError }}</div>
        <div v-else-if="filteredCommands.length === 0" class="slash-panel__state">
          未找到命令。可继续输入筛选，或检查 OpenCode command.list API。
        </div>
        <template v-else>
          <button
            v-for="(command, index) in filteredCommands"
            :key="`${command.source || 'command'}-${command.name}`"
            type="button"
            :class="['slash-item', { 'slash-item--active': index === highlightedCommandIndex }]"
            @mousedown.prevent="applySlashCommand(command)"
          >
            <div class="slash-item__title">
              <span>/{{ command.name }}</span>
              <span class="slash-item__source">{{ formatCommandSource(command.source) }}</span>
            </div>
            <div class="slash-item__desc">{{ command.description || command.template }}</div>
          </button>
        </template>
      </div>

      <div class="actions">
        <span class="char-count">{{ draftModel.trim().length }} 字</span>
        <div class="action-buttons">
          <el-button
            v-if="canAbort"
            type="danger"
            plain
            :loading="aborting"
            @click="$emit('abort')"
          >
            中止
          </el-button>
          <el-button
            type="primary"
            :loading="sending && !canAbort"
            :disabled="submitDisabled"
            @click="submit"
          >
            发送
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ChatAgentInfo, ChatCommandInfo, ChatModelProviderInfo } from '../../api'
import { getSlashCommands } from './slash-command-cache'

interface ModelOption {
  key: string
  label: string
}

const EFFORT_LABELS: Record<string, string> = {
  none: 'none',
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
  max: 'max',
  xhigh: 'xhigh',
}

const props = defineProps<{
  providers?: ChatModelProviderInfo[]
  draft: string
  providerId?: string
  modelId?: string
  variant?: string
  variants?: string[]
  agentName?: string
  agents?: ChatAgentInfo[]
  disabled: boolean
  sending: boolean
  canAbort: boolean
  aborting: boolean
}>()

const emit = defineEmits<{
  submit: [{ text: string; providerId?: string; modelId?: string; variant?: string; agent?: string }]
  abort: []
  'update:draft': [string]
  'update:model-selection': [{ providerId?: string; modelId?: string }]
  'update:providerId': [string?]
  'update:modelId': [string?]
  'update:variant': [string?]
  'update:agentName': [string?]
}>()

const commands = ref<ChatCommandInfo[]>([])
const commandsLoading = ref(false)
const commandsError = ref('')
const highlightedCommandIndex = ref(0)

const normalizedProviders = computed(() => Array.isArray(props.providers) ? props.providers : [])
const normalizedAgents = computed(() => Array.isArray(props.agents) ? props.agents : [])
const normalizedVariants = computed(() => Array.isArray(props.variants) ? props.variants : [])
const draftModel = computed({
  get: () => props.draft,
  set: value => emit('update:draft', value),
})

const modelOptionGroups = computed(() => {
  return normalizedProviders.value.map(provider => ({
    providerId: provider.id,
    providerName: provider.name,
    options: (provider.models || []).map<ModelOption>(model => ({
      key: `${provider.id}::${model.id}`,
      label: model.name === model.id ? model.id : `${model.name} · ${model.id}`,
    })),
  })).filter(group => group.options.length > 0)
})

const selectedModelKey = computed(() => {
  if (!props.providerId || !props.modelId) {
    return ''
  }
  return `${props.providerId}::${props.modelId}`
})

const submitDisabled = computed(() => props.disabled || props.sending || !draftModel.value.trim())

const slashMatch = computed(() => {
  const match = draftModel.value.match(/(^|\s)(\/[^\s]*)$/)
  if (!match) return null

  return {
    token: match[2],
    query: match[2].slice(1).trim().toLowerCase(),
  }
})

const filteredCommands = computed(() => {
  const source = Array.isArray(commands.value) ? commands.value : []
  const query = slashMatch.value?.query || ''
  if (!query) return source.slice(0, 12)

  return source
    .filter(command => {
      const haystack = [
        command.name,
        command.description || '',
        command.template || '',
      ].join(' ').toLowerCase()
      return haystack.includes(query)
    })
    .slice(0, 12)
})

const showSlashPalette = computed(() => Boolean(slashMatch.value) && !props.disabled)

watch(showSlashPalette, visible => {
  if (!visible) {
    highlightedCommandIndex.value = 0
    return
  }
  void ensureCommands()
})

watch(filteredCommands, commandsList => {
  if (commandsList.length === 0) {
    highlightedCommandIndex.value = 0
    return
  }

  if (highlightedCommandIndex.value >= commandsList.length) {
    highlightedCommandIndex.value = commandsList.length - 1
  }
})

function buildAgentLabel(agent: ChatAgentInfo): string {
  const prefix = agent.mode === 'subagent' ? '子' : '主'
  const title = agent.description?.trim() || agent.name
  return `(${prefix}) ${title}`
}

function formatEffortLabel(value: string): string {
  return EFFORT_LABELS[value] || value
}

function handleModelChange(value?: string): void {
  const nextValue = typeof value === 'string' ? value.trim() : ''
  if (!nextValue) {
    emit('update:model-selection', { providerId: undefined, modelId: undefined })
    emit('update:providerId', undefined)
    emit('update:modelId', undefined)
    return
  }

  const [provider, model] = nextValue.split('::')
  emit('update:model-selection', {
    providerId: provider || undefined,
    modelId: model || undefined,
  })
  emit('update:providerId', provider || undefined)
  emit('update:modelId', model || undefined)
}

function handleVariantChange(value?: string): void {
  const nextValue = typeof value === 'string' ? value.trim() : ''
  emit('update:variant', nextValue || undefined)
}

function handleAgentChange(value?: string): void {
  const nextValue = typeof value === 'string' ? value.trim() : ''
  emit('update:agentName', nextValue || undefined)
}

async function ensureCommands(): Promise<void> {
  commandsLoading.value = true
  commandsError.value = ''
  try {
    commands.value = await getSlashCommands()
  } catch (error) {
    commands.value = []
    commandsError.value = error instanceof Error ? error.message : '命令加载失败'
  } finally {
    commandsLoading.value = false
  }
}

function formatCommandSource(source?: string): string {
  if (source === 'mcp') return 'MCP'
  if (source === 'skill') return '技能'
  if (source === 'bridge-doc') return '内置'
  return 'OpenCode'
}

function applySlashCommand(command: ChatCommandInfo): void {
  const token = slashMatch.value?.token
  if (!token) return

  const template = command.template?.trim() || `/${command.name}`
  const replacement = template.endsWith(' ') ? template : `${template} `
  draftModel.value = draftModel.value.replace(/(^|\s)(\/[^\s]*)$/, (_full, prefix) => `${prefix}${replacement}`)
  highlightedCommandIndex.value = 0
}

function submit(): void {
  const text = draftModel.value.trim()
  if (!text || props.sending) return
  emit('submit', {
    text,
    providerId: props.providerId,
    modelId: props.modelId,
    variant: props.variant,
    agent: props.agentName,
  })
  emit('update:draft', '')
}

function handleKeydown(event: KeyboardEvent): void {
  if (showSlashPalette.value && filteredCommands.value.length > 0) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      highlightedCommandIndex.value = (highlightedCommandIndex.value + 1) % filteredCommands.value.length
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      highlightedCommandIndex.value = (highlightedCommandIndex.value - 1 + filteredCommands.value.length) % filteredCommands.value.length
      return
    }

    if ((event.key === 'Enter' || event.key === 'Tab') && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
      event.preventDefault()
      applySlashCommand(filteredCommands.value[highlightedCommandIndex.value])
      return
    }

    if (event.key === 'Escape') {
      highlightedCommandIndex.value = 0
      return
    }
  }

  if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
    event.preventDefault()
    submit()
  }
}
</script>

<style scoped>
.message-input {
  border-top: 1px solid #e5e7eb;
  background: #ffffff;
}

.toolbar {
  display: grid;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid #e5e7eb;
}

.selector-column {
  display: grid;
  gap: 10px;
}

.selector-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.selector-field label {
  font-size: 12px;
  font-weight: 600;
  color: #111827;
}

.field-tip,
.hint,
.char-count {
  font-size: 11px;
  color: #6b7280;
}

.composer {
  padding: 12px;
  display: grid;
  gap: 12px;
}

.composer :deep(.el-textarea__inner) {
  min-height: 112px !important;
  border-radius: 0;
  box-shadow: inset 0 0 0 1px #d1d5db;
  padding: 12px;
}

.slash-panel {
  display: grid;
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid #d1d5db;
  background: #ffffff;
}

.slash-panel__head,
.slash-panel__state,
.slash-item {
  padding: 10px 12px;
  border-bottom: 1px solid #eceff3;
}

.slash-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
}

.slash-panel__state {
  font-size: 12px;
  color: #6b7280;
}

.slash-panel__state--error {
  color: #b91c1c;
}

.slash-item {
  display: grid;
  gap: 4px;
  border-left: 0;
  border-right: 0;
  border-top: 0;
  background: #ffffff;
  text-align: left;
  cursor: pointer;
}

.slash-item--active,
.slash-item:hover {
  background: #f7f9fc;
}

.slash-item__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  font-weight: 600;
  color: #111827;
}

.slash-item__source,
.slash-item__desc {
  font-size: 11px;
  color: #6b7280;
}

.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 720px) {
  .actions {
    flex-direction: column;
    align-items: stretch;
  }

  .action-buttons {
    justify-content: flex-end;
  }
}
</style>
