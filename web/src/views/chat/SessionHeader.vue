<template>
  <header class="session-header">
    <div class="session-meta">
      <div class="eyebrow">AI 工作区</div>
      <h1>{{ session?.title || '新对话' }}</h1>
      <p>
        {{ session?.directory || '当前会话还未绑定目录，直接发送问题即可开始。' }}
      </p>
      <div class="status-line">
        <span>{{ stateLabel }}</span>
        <span>消息 {{ messageCount }}</span>
        <span>模型 {{ modelLabel }}</span>
        <span>思考 {{ effortLabel }}</span>
        <span>代理 {{ agentLabel }}</span>
        <span v-if="canAbort && !aborting">Esc 中断</span>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ChatSessionSummary } from '../../api'
import type { ChatStreamState } from '../../composables/chat-model'

const props = defineProps<{
  session: ChatSessionSummary | null
  messageCount: number
  streamState: ChatStreamState
  sending: boolean
  aborting: boolean
  modelLabel: string
  effortLabel: string
  agentLabel: string
}>()

const canAbort = computed(() => props.sending || props.streamState === 'connected')

const stateLabel = computed(() => {
  if (props.aborting) return '中断中'
  if (props.sending || props.streamState === 'connected') return '流式响应中'
  if (props.streamState === 'idle') return '会话空闲'
  if (props.streamState === 'connecting') return '连接中'
  return '已就绪'
})

</script>

<style scoped>
.session-header {
  padding: 12px;
  border-bottom: 1px solid #e5e7eb;
  background: #ffffff;
}

.session-meta h1 {
  margin: 4px 0 6px;
  font-size: 20px;
  line-height: 1.1;
  color: #111827;
}

.session-meta p,
.eyebrow,
.status-line {
  color: #6b7280;
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 11px;
  font-weight: 700;
}

.status-line {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 12px;
  line-height: 1.6;
  margin-top: 8px;
}

.status-line span::after {
  content: '·';
  margin-left: 10px;
  color: #cbd5e1;
}

.status-line span:last-child::after {
  display: none;
}
</style>
