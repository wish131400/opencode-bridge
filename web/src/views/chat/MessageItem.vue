<template>
  <article :class="['message-item', `message-item--${message.role}`]">
    <div class="message-card">
      <header class="message-head">
        <div class="meta-left">
          <span class="role">{{ roleLabel }}</span>
          <span class="time">{{ formatTime(message.createdAt) }}</span>
          <span v-if="message.model" class="tag">{{ message.model.providerId }}/{{ message.model.modelId }}</span>
          <span v-if="message.agent" class="tag">{{ message.agent }}</span>
          <span v-if="message.status === 'streaming'" class="status status--streaming">生成中</span>
          <span v-else-if="message.status === 'error'" class="status status--error">出错</span>
        </div>

        <div class="meta-right">
          <el-button text size="small" @click="copyMessage">复制</el-button>
          <el-button text size="small" :disabled="undoDisabled" @click="$emit('revert', message)">{回退}</el-button>
          <el-button text size="small" @click="expanded = !expanded">
            {{ expanded ? '收缩' : '展开' }}
          </el-button>
        </div>
      </header>

      <div v-if="!expanded" class="message-summary">
        {{ summary }}
      </div>

      <div v-else class="message-body">
        <Message :role="message.role" :error="message.status === 'error'">
          <template v-for="block in blocks" :key="block.id">
            <div v-if="block.type === 'text'" class="block block--text">
              <StreamingMessage
                v-if="block.streaming"
                :text="message.text"
              />
              <template v-else>
                <template v-for="segment in block.segments" :key="segment.id">
                  <Markdown v-if="segment.type === 'markdown'" :source="segment.content" />
                  <CodeBlock v-else :code="segment.code" :language="segment.language" />
                </template>
              </template>
            </div>

            <Reasoning
              v-else-if="block.type === 'reasoning'"
              :source="block.text"
            />

            <Tool
              v-else-if="block.type === 'tool'"
              :tool="block.tool"
            />

            <div v-else class="error-text">{{ block.text }}</div>
          </template>
        </Message>

        <footer v-if="message.usage" class="usage">
          输入 {{ message.usage.input }} / 输出 {{ message.usage.output }} / 推理 {{ message.usage.reasoning }}
        </footer>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import CodeBlock from '../../components/ai-elements/CodeBlock.vue'
import Markdown from '../../components/ai-elements/Markdown.vue'
import Message from '../../components/ai-elements/Message.vue'
import Reasoning from '../../components/ai-elements/Reasoning.vue'
import Tool from '../../components/ai-elements/Tool.vue'
import { splitMarkdownSegments } from '../../components/ai-elements/markdown-utils'
import StreamingMessage from './StreamingMessage.vue'
import type { ChatMessageVm, ChatToolCallVm } from '../../composables/chat-model'

const props = defineProps<{
  message: ChatMessageVm
  autoExpand?: boolean
  undoDisabled?: boolean
}>()

defineEmits<{
  revert: [ChatMessageVm]
}>()

type MessageBlock =
  | { id: string; type: 'text'; segments: ReturnType<typeof splitMarkdownSegments>; streaming: boolean }
  | { id: string; type: 'reasoning'; text: string }
  | { id: string; type: 'tool'; tool: ChatToolCallVm }
  | { id: string; type: 'error'; text: string }

const expanded = ref(Boolean(props.autoExpand) || props.message.role === 'user')

watch(
  () => props.autoExpand,
  value => {
    if (value) {
      expanded.value = true
    }
  },
  { immediate: true }
)

const roleLabel = computed(() => props.message.role === 'user' ? '用户' : 'chat:opencode')

const blocks = computed<MessageBlock[]>(() => {
  const nextBlocks: MessageBlock[] = []

  if (props.message.text || props.message.role === 'assistant') {
    nextBlocks.push({
      id: `${props.message.id}-text`,
      type: 'text',
      segments: splitMarkdownSegments(props.message.text),
      streaming: props.message.role === 'assistant' && props.message.status === 'streaming',
    })
  }

  if (props.message.reasoning) {
    nextBlocks.push({
      id: `${props.message.id}-reasoning`,
      type: 'reasoning',
      text: props.message.reasoning,
    })
  }

  for (const tool of props.message.tools) {
    nextBlocks.push({
      id: `${props.message.id}-tool-${tool.id}`,
      type: 'tool',
      tool,
    })
  }

  if (props.message.error) {
    nextBlocks.push({
      id: `${props.message.id}-error`,
      type: 'error',
      text: props.message.error,
    })
  }

  return nextBlocks
})

const summary = computed(() => {
  const text = compactText(props.message.text)
  if (text) return trimSummary(text)

  const reasoning = compactText(props.message.reasoning)
  if (reasoning) return trimSummary(`推理: ${reasoning}`)

  if (props.message.tools.length > 0) {
    const labels = props.message.tools
      .slice(0, 2)
      .map(tool => tool.title || tool.name)
      .join('，')
    return trimSummary(`工具: ${labels}${props.message.tools.length > 2 ? ` 等 ${props.message.tools.length} 项` : ''}`)
  }

  if (props.message.error) {
    return trimSummary(`错误: ${compactText(props.message.error)}`)
  }

  return '空消息'
})

const copyText = computed(() => {
  const sections: string[] = []
  const text = compactText(props.message.text)
  if (text) {
    sections.push(text)
  }

  const reasoning = compactText(props.message.reasoning)
  if (reasoning) {
    sections.push(`推理\n${reasoning}`)
  }

  for (const tool of props.message.tools) {
    const label = tool.title || tool.name
    const output = compactText(tool.output)
    sections.push(output ? `工具 ${label}\n${output}` : `工具 ${label}`)
  }

  if (props.message.error) {
    sections.push(`错误\n${compactText(props.message.error)}`)
  }

  return sections.join('\n\n').trim()
})

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function trimSummary(value: string): string {
  return value.length > 120 ? `${value.slice(0, 120)}…` : value
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function copyMessage(): Promise<void> {
  const text = copyText.value
  if (!text) {
    ElMessage.warning('当前消息没有可复制内容')
    return
  }

  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制消息内容')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '复制失败')
  }
}
</script>

<style scoped>
.message-item {
  display: flex;
  padding: 12px;
}

.message-item--assistant {
  justify-content: flex-start;
}

.message-item--user {
  justify-content: flex-end;
}

.message-card {
  width: min(100%, 78%);
  border: 1px solid #eceff3;
  background: #ffffff;
}

.message-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid #eceff3;
}

.meta-left,
.meta-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.role {
  font-size: 12px;
  font-weight: 700;
  color: #111827;
}

.time,
.tag {
  font-size: 11px;
  color: #6b7280;
}

.tag,
.status {
  padding: 2px 6px;
  border: 1px solid #d1d5db;
  background: #f9fafb;
}

.status--streaming {
  color: #b45309;
}

.status--error {
  color: #b91c1c;
}

.message-summary {
  padding: 0 12px 10px;
  font-size: 13px;
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.message-body {
  padding: 0 12px 12px;
}

.block + .block {
  margin-top: 12px;
}

.block--text:empty {
  min-height: 1px;
}

.error-text {
  color: #b91c1c;
  font-size: 13px;
  line-height: 1.6;
}

.usage {
  margin-top: 8px;
  color: #6b7280;
  font-size: 11px;
}

@media (max-width: 900px) {
  .message-card {
    width: 100%;
  }
}
</style>
