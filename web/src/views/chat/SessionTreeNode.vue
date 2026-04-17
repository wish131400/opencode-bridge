<template>
  <div class="tree-node">
    <div
      v-if="node.type === 'folder'"
      class="tree-row tree-row--folder"
      :style="rowStyle"
    >
      <button
        type="button"
        class="tree-folder-main"
        @click="$emit('toggle-folder', node.id)"
      >
        <el-icon class="tree-icon">
          <component :is="isExpanded ? FolderOpened : Folder" />
        </el-icon>
        <span class="tree-label">{{ node.label }}</span>
        <span class="tree-count">{{ node.count }}</span>
      </button>

      <div class="tree-actions tree-actions--folder" @click.stop>
        <el-button
          text
          size="small"
          title="在该目录下新建会话"
          @click="$emit('create-in-directory', node.directory)"
        >
          +
        </el-button>
      </div>
    </div>

    <div
      v-else
      :class="['tree-row tree-row--session', { 'tree-row--active': node.session?.id === activeSessionId }]"
      :style="rowStyle"
      role="button"
      tabindex="0"
      @click="handleSelect"
      @keydown.enter="handleSelect"
    >
      <span class="tree-time" :title="fullTime">{{ relativeTime }}</span>

      <div class="tree-main">
        <span class="tree-label">{{ node.label }}</span>
      </div>

      <div class="tree-more-wrap" @click.stop>
        <el-popover
          placement="bottom-start"
          trigger="click"
          :width="140"
          popper-class="session-action-popover"
        >
          <template #reference>
            <button type="button" class="tree-more-btn" title="更多操作">&middot;&middot;&middot;</button>
          </template>
          <div class="session-action-menu">
            <button type="button" class="session-action-item" @click="handleRename">重命名</button>
            <button type="button" class="session-action-item" @click="handleCopy">复制对话</button>
            <button type="button" class="session-action-item session-action-item--danger" @click="handleRemove">删除对话</button>
          </div>
        </el-popover>
      </div>
    </div>

    <div
      v-if="node.type === 'folder' && (searching || isExpanded)"
      class="tree-children"
    >
      <SessionTreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :active-session-id="activeSessionId"
        :expanded-folders="expandedFolders"
        :searching="searching"
        @select="$emit('select', $event)"
        @rename="$emit('rename', $event)"
        @remove="$emit('remove', $event)"
        @toggle-folder="$emit('toggle-folder', $event)"
        @create-in-directory="$emit('create-in-directory', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Folder, FolderOpened } from '@element-plus/icons-vue'
import type { SessionTreeNodeData } from './session-tree'

defineOptions({
  name: 'SessionTreeNode',
})

const props = defineProps<{
  node: SessionTreeNodeData
  depth: number
  activeSessionId: string | null
  expandedFolders: Set<string>
  searching: boolean
}>()

const emit = defineEmits<{
  select: [string]
  rename: [{ sessionId: string; title: string }]
  remove: [string]
  'toggle-folder': [string]
  'create-in-directory': [string?]
}>()

const isExpanded = computed(() => props.expandedFolders.has(props.node.id))
const rowStyle = computed(() => ({
  paddingLeft: `${props.depth * 16 + 8}px`,
}))

const relativeTime = computed(() => {
  if (!props.node.updatedAt) return ''
  const now = Date.now()
  const diff = now - props.node.updatedAt
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}时`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}天`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}月`
  return `${Math.floor(months / 12)}年`
})

const fullTime = computed(() => {
  if (!props.node.updatedAt) return ''
  return new Date(props.node.updatedAt).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
})

function handleSelect(): void {
  const sessionId = props.node.session?.id
  if (!sessionId) return
  emit('select', sessionId)
}

function handleRename(): void {
  const session = props.node.session
  if (!session) return
  emit('rename', { sessionId: session.id, title: session.title })
}

function handleCopy(): void {
  const session = props.node.session
  if (!session) return
  const text = `${session.title}\n${session.directory || ''}`
  navigator.clipboard.writeText(text.trim()).then(() => {
    ElMessage.success('已复制对话信息')
  }).catch(() => {
    ElMessage.error('复制失败')
  })
}

function handleRemove(): void {
  const sessionId = props.node.session?.id
  if (!sessionId) return
  emit('remove', sessionId)
}
</script>

<style scoped>
.tree-node {
  position: relative;
  display: flex;
  flex-direction: column;
}

.tree-children {
  display: flex;
  flex-direction: column;
  margin-left: 14px;
  border-left: 1px dashed #cbd5e1;
}

.tree-row {
  width: 100%;
  min-height: 32px;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 0;
  border-bottom: 1px solid #f3f4f6;
  background: #ffffff;
  color: #1f2937;
  text-align: left;
}

.tree-row--folder {
  justify-content: space-between;
  padding-right: 8px;
}

.tree-folder-main {
  flex: 1;
  min-width: 0;
  min-height: 32px;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}

.tree-row--session {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 8px;
  cursor: pointer;
  padding-right: 8px;
  transition: background 0.1s;
}

.tree-row--session:hover {
  background: #f7f9fc;
}

.tree-row--active {
  background: #eff6ff;
}

.tree-icon {
  color: #6b7280;
  flex-shrink: 0;
}

.tree-main {
  min-width: 0;
  display: flex;
  align-items: center;
  padding: 6px 0;
}

.tree-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
}

.tree-time {
  flex-shrink: 0;
  color: #9ca3af;
  font-size: 11px;
  min-width: 28px;
  text-align: right;
  cursor: default;
}

.tree-count {
  color: #6b7280;
  font-size: 11px;
  margin-left: auto;
  padding-right: 12px;
}

.tree-more-wrap {
  display: flex;
  align-items: center;
  opacity: 0;
  transition: opacity 0.1s;
}

.tree-row--session:hover .tree-more-wrap,
.tree-row--active .tree-more-wrap {
  opacity: 1;
}

.tree-more-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  color: #6b7280;
  letter-spacing: 1px;
  padding: 2px 4px;
  line-height: 1;
}

.tree-more-btn:hover {
  color: #111827;
}

.tree-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
}

.tree-row--folder:hover .tree-actions,
.tree-actions--folder {
  opacity: 1;
}

.session-action-menu {
  display: flex;
  flex-direction: column;
}

.session-action-item {
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  padding: 6px 10px;
  font-size: 13px;
  color: #374151;
  transition: background 0.1s;
}

.session-action-item:hover {
  background: #f3f4f6;
}

.session-action-item--danger {
  color: #dc2626;
}

.session-action-item--danger:hover {
  background: #fef2f2;
}
</style>
