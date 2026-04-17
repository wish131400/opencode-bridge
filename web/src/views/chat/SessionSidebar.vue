<template>
  <aside class="session-sidebar">
    <section class="sidebar-head">
      <div>
        <div class="eyebrow">Bridge</div>
        <h2>会话</h2>
      </div>
      <el-button type="primary" @click="$emit('create')">新建项目</el-button>
    </section>

    <el-input
      ref="searchInputRef"
      v-model="keyword"
      class="search"
      clearable
      placeholder="搜索会话标题或目录"
    >
      <template #prefix>
        <el-icon><Search /></el-icon>
      </template>
    </el-input>

    <div class="search-hint">`Ctrl/Cmd + K` 聚焦搜索</div>

    <div class="session-list">
      <div v-if="loading" class="loading-card">
        <el-skeleton :rows="5" animated />
      </div>
      <template v-else-if="treeData.length > 0">
        <SessionTreeNode
          v-for="node in treeData"
          :key="node.id"
          :node="node"
          :depth="0"
          :active-session-id="activeSessionId"
          :expanded-folders="expandedFolders"
          :searching="Boolean(keyword.trim())"
          @select="$emit('select', $event)"
          @rename="handleRenameById"
          @remove="$emit('remove', $event)"
          @toggle-folder="toggleFolder"
          @create-in-directory="$emit('create-in-directory', $event)"
        />
      </template>

      <div v-if="!loading && treeData.length === 0" class="loading-card empty-card">
        <strong>{{ keyword.trim() ? '没有匹配的会话' : '还没有会话' }}</strong>
        <p>
          {{ keyword.trim() ? '尝试清空搜索，或者直接创建新的会话。' : '从左上角创建一个新会话，或者直接在主区输入问题开始。' }}
        </p>
        <el-button v-if="!keyword.trim()" type="primary" plain size="small" @click="$emit('create')">
          立即新建
        </el-button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessageBox, type InputInstance } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import type { ChatSessionSummary } from '../../api'
import SessionTreeNode from './SessionTreeNode.vue'
import type { SessionTreeNodeData } from './session-tree'

const props = defineProps<{
  sessions: ChatSessionSummary[]
  activeSessionId: string | null
  loading: boolean
}>()

const emit = defineEmits<{
  create: []
  'create-in-directory': [string?]
  select: [string]
  rename: [{ sessionId: string; title: string }]
  remove: [string]
}>()

const keyword = ref('')
const searchInputRef = ref<InputInstance>()
const expandedFolders = ref<Set<string>>(new Set())

const filteredSessions = computed(() => {
  const search = keyword.value.trim().toLowerCase()
  if (!search) return props.sessions
  return props.sessions.filter(session =>
    session.title.toLowerCase().includes(search) ||
    (session.directory || '').toLowerCase().includes(search)
  )
})

const treeData = computed(() => buildSessionTree(filteredSessions.value))

watch(
  treeData,
  nodes => {
    const folderIds = collectFolderIds(nodes)
    if (folderIds.length === 0) {
      expandedFolders.value = new Set()
      return
    }

    if (keyword.value.trim() || expandedFolders.value.size === 0) {
      expandedFolders.value = new Set(folderIds)
      return
    }

    const next = new Set(expandedFolders.value)
    for (const folderId of folderIds) {
      next.add(folderId)
    }
    expandedFolders.value = next
  },
  { immediate: true }
)

async function handleRename(session: ChatSessionSummary): Promise<void> {
  const result = await ElMessageBox.prompt('输入新的会话标题', '重命名会话', {
    inputValue: session.title,
    confirmButtonText: '保存',
    cancelButtonText: '取消',
  }).catch(() => null)

  const title = result?.value?.trim()
  if (!title || title === session.title) return
  emit('rename', { sessionId: session.id, title })
}

function handleRenameById(payload: { sessionId: string; title: string }): void {
  const session = props.sessions.find(item => item.id === payload.sessionId)
  if (!session) return
  void handleRename(session)
}

function toggleFolder(folderId: string): void {
  const next = new Set(expandedFolders.value)
  if (next.has(folderId)) {
    next.delete(folderId)
  } else {
    next.add(folderId)
  }
  expandedFolders.value = next
}

function focusSearch(): void {
  searchInputRef.value?.focus()
}

function normalizeDirectory(directory?: string): string {
  return (directory || '').trim().replace(/\\/g, '/')
}

function getDirectorySegments(directory?: string): string[] {
  const normalized = normalizeDirectory(directory)
  if (!normalized) return ['默认工作区']
  return normalized.replace(/^\/+/, '').split('/').filter(Boolean)
}

function buildSessionTree(sessions: ChatSessionSummary[]): SessionTreeNodeData[] {
  const roots: SessionTreeNodeData[] = []

  function getOrCreateFolder(children: SessionTreeNodeData[], id: string, label: string): SessionTreeNodeData {
    const existing = children.find(item => item.id === id && item.type === 'folder')
    if (existing) return existing

    const next: SessionTreeNodeData = {
      id,
      type: 'folder',
      label,
      count: 0,
      children: [],
    }
    children.push(next)
    return next
  }

  for (const session of sessions) {
    const normalizedDirectory = normalizeDirectory(session.directory)
    const segments = getDirectorySegments(session.directory)
    const directoryLabel = session.directory || '默认工作区'
    const rootPrefix = normalizedDirectory.startsWith('/') ? '/' : ''
    let children = roots
    let currentPath = ''

    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : `${rootPrefix}${segment}`
      const folderId = `folder:${currentPath}`
      const folder = getOrCreateFolder(children, folderId, segment)
      folder.directory = normalizedDirectory ? currentPath : undefined
      children = folder.children
    }

    children.push({
      id: `session:${session.id}`,
      type: 'session',
      label: session.title,
      directoryLabel,
      updatedAt: session.updatedAt,
      count: 1,
      session,
      children: [],
    })
  }

  return sortAndCount(roots)
}

function sortAndCount(nodes: SessionTreeNodeData[]): SessionTreeNodeData[] {
  nodes.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === 'folder' ? -1 : 1
    }

    if (left.type === 'folder' && right.type === 'folder') {
      return left.label.localeCompare(right.label, 'zh-Hans-CN')
    }

    return (right.updatedAt || 0) - (left.updatedAt || 0)
  })

  for (const node of nodes) {
    if (node.type === 'folder') {
      node.children = sortAndCount(node.children)
      node.count = node.children.reduce((sum, child) => sum + child.count, 0)
    }
  }

  return nodes
}

function collectFolderIds(nodes: SessionTreeNodeData[]): string[] {
  const result: string[] = []
  for (const node of nodes) {
    if (node.type !== 'folder') continue
    result.push(node.id, ...collectFolderIds(node.children))
  }
  return result
}

defineExpose({
  focusSearch,
})
</script>

<style scoped>
.session-sidebar {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #ffffff;
  color: #111827;
  border-right: 1px solid #e5e7eb;
}

.sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-bottom: 1px solid #e5e7eb;
}

.sidebar-head h2 {
  margin-top: 4px;
  font-size: 18px;
  font-weight: 600;
}

.eyebrow {
  color: #6b7280;
}

.eyebrow {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 700;
}

.search {
  padding: 0 12px;
}

.search :deep(.el-input__wrapper) {
  border-radius: 0;
  box-shadow: inset 0 0 0 1px #d1d5db;
}

.search-hint {
  padding: 0 12px 4px;
  font-size: 11px;
  color: #6b7280;
}

.session-list {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.loading-card {
  margin: 12px;
  padding: 16px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
}

.empty-card {
  display: grid;
  gap: 10px;
  color: #4b5563;
  line-height: 1.6;
}

.session-list :deep(.tree-node) {
  flex-shrink: 0;
}
</style>
