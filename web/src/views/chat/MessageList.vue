<template>
  <div class="message-list">
    <div v-if="loading" class="state-card">
      <el-skeleton :rows="4" animated />
    </div>
    <div v-else-if="!session" class="state-card empty-card">
      <div class="empty-title">选择会话或直接开始</div>
      <p>左侧切换历史会话，也可以直接发送一条消息自动创建新会话。</p>
    </div>
    <div v-else-if="messages.length === 0" class="state-card empty-card">
      <div class="empty-title">从一个问题开始</div>
      <p>当前会话还没有消息。可以直接提问，也可以先在左侧创建新的会话。</p>
    </div>
    <template v-else>
      <div v-if="hasMore || hiddenMessageCount > 0" class="history-toolbar">
        <span>已隐藏 {{ hiddenMessageCount }} 条更早消息</span>
        <el-button
          size="small"
          :loading="loadingMore"
          :disabled="loadingMore || !hasMore"
          @click="$emit('load-more')"
        >
          加载更早 10 条
        </el-button>
      </div>

      <Conversation class="message-stack">
        <MessageItem
          v-for="(message, index) in messages"
          :key="message.id"
          :message="message"
          :undo-disabled="undoDisabled"
          :auto-expand="index === messages.length - 1 && message.role === 'assistant' && message.status === 'streaming'"
          @revert="$emit('revert', $event)"
        />
      </Conversation>
    </template>
  </div>
</template>

<script setup lang="ts">
import Conversation from '../../components/ai-elements/Conversation.vue'
import MessageItem from './MessageItem.vue'
import type { ChatSessionSummary } from '../../api'
import type { ChatMessageVm } from '../../composables/chat-model'

defineProps<{
  session: ChatSessionSummary | null
  messages: ChatMessageVm[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  hiddenMessageCount: number
  undoDisabled?: boolean
}>()

defineEmits<{
  'load-more': []
  revert: [ChatMessageVm]
}>()
</script>

<style scoped>
.message-list {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #ffffff;
}

.message-stack {
  flex: 1;
  min-height: 0;
}

.history-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid #eceff3;
  background: #f9fafb;
  font-size: 12px;
  color: #6b7280;
}

.state-card {
  margin: 12px;
  padding: 20px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
}

.empty-card {
  min-height: 220px;
  display: grid;
  place-content: center;
  text-align: center;
  gap: 10px;
  color: #6b7280;
}

.empty-title {
  font-size: 20px;
  font-weight: 700;
  color: #111827;
}
</style>
