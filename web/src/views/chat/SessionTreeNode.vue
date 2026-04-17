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
      <div class="tree-main">
        <span class="tree-label">{{ node.label }}</span>
        <span class="tree-subtitle">{{ node.directoryLabel }}</span>
      </div>

      <span class="tree-time">{{ formattedTime }}</span>

      <div class="tree-actions" @click.stop>
        <el-button text size="small" @click="handleRename">重命名</el-button>
        <el-popconfirm title="删除后无法恢复，继续吗？" @confirm="handleRemove">
          <template #reference>
            <el-button text size="small" type="danger">删除</el-button>
          </template>
        </el-popconfirm>
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
  paddingLeft: `${props.depth * 16 + 12}px`,
}))

const formattedTime = computed(() => {
  if (!props.node.updatedAt) return ''
  return new Date(props.node.updatedAt).toLocaleString('zh-CN', {
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
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  border-bottom: 1px solid #eceff3;
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
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}

.tree-row--session {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 12px;
  cursor: pointer;
  padding-right: 12px;
}

.tree-row--active {
  background: #f7f9fc;
}

.tree-icon {
  color: #6b7280;
  flex-shrink: 0;
}

.tree-main {
  min-width: 0;
  display: grid;
  gap: 2px;
  padding: 8px 0;
}

.tree-label,
.tree-subtitle,
.tree-time {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-label {
  font-size: 13px;
}

.tree-subtitle,
.tree-time,
.tree-count {
  color: #6b7280;
  font-size: 11px;
}

.tree-count {
  margin-left: auto;
  padding-right: 12px;
}

.tree-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
}

.tree-row--session:hover .tree-actions,
.tree-row--active .tree-actions,
.tree-row--folder:hover .tree-actions,
.tree-actions--folder {
  opacity: 1;
}
</style>
