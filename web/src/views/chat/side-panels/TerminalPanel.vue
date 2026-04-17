<template>
  <div class="workspace-tool">
    <div class="tool-header">
      <div>
        <h4>终端</h4>
        <p>当前阶段先保留明确占位，不接半成品 PTY。</p>
      </div>
    </div>

    <div class="placeholder">
      <strong>Phase E 说明</strong>
      <p>
        OpenCode PTY / WebSocket 终端还没有并入这套新工作区，因此这里先不伪造一个不可交互的终端。
        当前建议直接使用上面的 Git 与文件面板；等 PTY 路由稳定后，再把这里接成真实终端。
      </p>
      <p>
        当前工作目录：{{ directory || '未绑定目录' }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  directory?: string
}>()
</script>

<style scoped>
.workspace-tool {
  display: grid;
  gap: 12px;
}

.tool-header h4 {
  color: #10223d;
}

.tool-header p {
  margin-top: 6px;
  color: #6b7280;
  line-height: 1.6;
  font-size: 13px;
}

.placeholder {
  padding: 16px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #374151;
}

.placeholder strong {
  display: block;
  margin-bottom: 10px;
}

.placeholder p + p {
  margin-top: 10px;
}
</style>
