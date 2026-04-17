<template>
  <section class="panel">
    <div class="panel-head">
      <h3>看板</h3>
      <span class="count">{{ tasks.length }}</span>
    </div>

    <div v-if="tasks.length === 0" class="placeholder">
      当前还没有 TodoWrite 任务。触发相关工具后会在这里同步展示。
    </div>

    <div v-else class="task-list">
      <Task
        v-for="task in tasks"
        :key="task.id"
        :task="task"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import Task from '../../components/ai-elements/Task.vue'
import type { ChatTodoItem } from '../../composables/chat-model'

defineProps<{
  tasks: ChatTodoItem[]
}>()
</script>

<style scoped>
.panel {
  padding: 12px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.panel-head h3 {
  font-size: 14px;
  color: #111827;
}

.count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 26px;
  border: 1px solid #d1d5db;
  color: #4b5563;
  font-size: 12px;
  font-weight: 700;
}

.placeholder {
  color: #6b7280;
  line-height: 1.6;
  font-size: 13px;
}

.task-list {
  display: grid;
  gap: 10px;
}
</style>
