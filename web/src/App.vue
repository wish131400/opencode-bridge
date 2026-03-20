<template>
  <el-container class="app-container">
    <!-- 侧边栏 -->
    <el-aside width="220px" class="sidebar">
      <div class="logo">
        <el-icon size="24"><Monitor /></el-icon>
        <span>Bridge 配置中心</span>
      </div>
      <el-menu :router="true" :default-active="route.path" class="nav-menu">
        <el-menu-item index="/dashboard">
          <el-icon><DataAnalysis /></el-icon>
          <span>系统状态</span>
        </el-menu-item>
        <el-menu-item index="/platforms">
          <el-icon><ChatDotRound /></el-icon>
          <span>平台接入</span>
        </el-menu-item>
        <el-menu-item index="/opencode">
          <el-icon><Connection /></el-icon>
          <span>OpenCode 对接</span>
        </el-menu-item>
        <el-menu-item index="/reliability">
          <el-icon><Warning /></el-icon>
          <span>高可用配置</span>
        </el-menu-item>
        <el-menu-item index="/routing">
          <el-icon><Setting /></el-icon>
          <span>核心行为</span>
        </el-menu-item>
        <el-menu-item index="/cron">
          <el-icon><Timer /></el-icon>
          <span>Cron 任务管理</span>
          <el-badge v-if="store.cronJobCount > 0" :value="store.runningJobCount" type="success" class="cron-badge" />
        </el-menu-item>
      </el-menu>

      <!-- 底部状态区 -->
      <div class="sidebar-footer">
        <div v-if="status" class="status-info">
          <el-text size="small" type="info">v{{ status.version }}</el-text>
          <el-text size="small" type="info">运行 {{ formatUptime(status.uptime) }}</el-text>
        </div>
        <el-button
          :type="store.pendingRestart ? 'warning' : 'default'"
          size="small"
          :icon="RefreshRight"
          @click="handleRestart"
          class="restart-btn"
        >
          {{ store.pendingRestart ? '需要重启' : '重启服务' }}
        </el-button>
      </div>
    </el-aside>

    <!-- 内容区 -->
    <el-main class="main-content">
      <!-- 待重启提示横幅 -->
      <el-alert
        v-if="store.pendingRestart"
        type="warning"
        :closable="false"
        show-icon
        class="restart-banner"
      >
        <template #title>
          以下配置需要重启服务才能生效：{{ store.pendingRestartKeys.join('、') }}
        </template>
        <template #default>
          <el-button size="small" type="warning" @click="handleRestart">立即重启</el-button>
          <el-button size="small" @click="store.pendingRestart = false">稍后手动重启</el-button>
        </template>
      </el-alert>

      <router-view v-if="!store.loading" />
      <div v-else class="loading-mask">
        <el-icon class="is-loading" size="40"><Loading /></el-icon>
      </div>
    </el-main>
  </el-container>

  <!-- 重启确认弹窗 -->
  <el-dialog v-model="restartDialogVisible" title="确认重启服务" width="420px">
    <p>重启将中断当前所有连接，服务将在 1 秒后退出（需配合 PM2/systemd 自动拉起）。</p>
    <p v-if="store.pendingRestartKeys.length">待生效配置：<strong>{{ store.pendingRestartKeys.join('、') }}</strong></p>
    <template #footer>
      <el-button @click="restartDialogVisible = false">取消</el-button>
      <el-button type="warning" :loading="restarting" @click="confirmRestart">确认重启</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { RefreshRight, DataAnalysis } from '@element-plus/icons-vue'
import { useConfigStore } from './stores/config'
import type { ServiceStatus } from './api/index'

const route = useRoute()
const router = useRouter()
const store = useConfigStore()
const status = ref<ServiceStatus | null>(null)
const restartDialogVisible = ref(false)
const restarting = ref(false)
const loginError = ref(false)

onMounted(async () => {
  try {
    await Promise.all([store.fetchConfig(), store.fetchStatus(), store.fetchCronJobs()])
    status.value = store.status
  } catch (e: any) {
    if (e.response?.status === 401) {
      loginError.value = true
      localStorage.removeItem('admin_token')
      router.push('/login')
    }
  }
})

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`
  return `${Math.floor(seconds / 3600)}小时`
}

function handleRestart() {
  restartDialogVisible.value = true
}

async function confirmRestart() {
  restarting.value = true
  try {
    await store.restart()
    ElMessage.success('重启指令已发送，服务即将退出...')
    restartDialogVisible.value = false
  } catch {
    ElMessage.error('重启失败，请手动执行')
  } finally {
    restarting.value = false
  }
}
</script>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f7fa; }

.app-container { height: 100vh; }

.sidebar {
  background: #1a1a2e;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 16px;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  border-bottom: 1px solid #2a2a4a;
}

.nav-menu {
  flex: 1;
  border-right: none;
  background: transparent;
  --el-menu-bg-color: transparent;
  --el-menu-text-color: #a0a8c0;
  --el-menu-active-color: #fff;
  --el-menu-hover-bg-color: rgba(255,255,255,0.08);
  --el-menu-item-height: 48px;
}

.nav-menu .el-menu-item.is-active {
  background-color: rgba(64, 158, 255, 0.2) !important;
  color: #409eff;
}

.cron-badge { margin-left: auto; }

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid #2a2a4a;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-info { display: flex; flex-direction: column; gap: 2px; }
.restart-btn { width: 100%; }

.main-content {
  padding: 24px;
  overflow-y: auto;
  background: #f5f7fa;
}

.restart-banner { margin-bottom: 20px; }
.loading-mask {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 300px;
}
</style>
