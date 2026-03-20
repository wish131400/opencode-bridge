<template>
  <div class="page">
    <div class="page-header">
      <h2>📊 系统状态</h2>
      <p class="desc">查看服务运行状态、配置概览与统计信息</p>
    </div>

    <!-- 核心状态卡片 -->
    <el-row :gutter="20" class="stat-row">
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)">
            <el-icon size="28"><Monitor /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-label">服务版本</div>
            <div class="stat-value">{{ status?.version || '-' }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%)">
            <el-icon size="28"><Timer /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-label">运行时长</div>
            <div class="stat-value">{{ formatUptime(status?.uptime || 0) }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)">
            <el-icon size="28"><DataLine /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-label">配置存储</div>
            <div class="stat-value">{{ dbStatus }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)">
            <el-icon size="28"><Clock /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-label">启动时间</div>
            <div class="stat-value">{{ formatStartTime(status?.startedAt) }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 平台状态 -->
    <el-row :gutter="20" class="stat-row">
      <el-col :span="8">
        <el-card shadow="hover" class="platform-card">
          <template #header>
            <div class="platform-header">
              <el-icon size="20"><ChatDotRound /></el-icon>
              <span>飞书平台</span>
            </div>
          </template>
          <div class="platform-status">
            <div class="status-row">
              <span class="status-label">App ID:</span>
              <span class="status-value">{{ maskId(settings.FEISHU_APP_ID) }}</span>
            </div>
            <div class="status-row">
              <span class="status-label">配置状态:</span>
              <el-tag :type="settings.FEISHU_APP_ID && settings.FEISHU_APP_SECRET ? 'success' : 'warning'" size="small">
                {{ settings.FEISHU_APP_ID && settings.FEISHU_APP_SECRET ? '已配置' : '未配置' }}
              </el-tag>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover" class="platform-card">
          <template #header>
            <div class="platform-header">
              <el-icon size="20"><Connection /></el-icon>
              <span>Discord 平台</span>
            </div>
          </template>
          <div class="platform-status">
            <div class="status-row">
              <span class="status-label">Client ID:</span>
              <span class="status-value">{{ maskId(settings.DISCORD_CLIENT_ID) }}</span>
            </div>
            <div class="status-row">
              <span class="status-label">配置状态:</span>
              <el-tag :type="settings.DISCORD_ENABLED === 'true' && settings.DISCORD_BOT_TOKEN ? 'success' : 'info'" size="small">
                {{ settings.DISCORD_ENABLED === 'true' ? '已启用' : '已禁用' }}
              </el-tag>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover" class="platform-card">
          <template #header>
            <div class="platform-header">
              <el-icon size="20"><Cpu /></el-icon>
              <span>OpenCode 服务</span>
            </div>
          </template>
          <div class="platform-status">
            <div class="status-row">
              <span class="status-label">地址:</span>
              <span class="status-value">{{ settings.OPENCODE_HOST || 'localhost' }}:{{ settings.OPENCODE_PORT || '4096' }}</span>
            </div>
            <div class="status-row">
              <span class="status-label">自动启动:</span>
              <el-tag :type="settings.OPENCODE_AUTO_START === 'true' ? 'success' : 'info'" size="small">
                {{ settings.OPENCODE_AUTO_START === 'true' ? '启用' : '禁用' }}
              </el-tag>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Cron 任务概览 -->
    <el-card shadow="never" class="config-card">
      <template #header>
        <div class="card-header-row">
          <span class="card-title">⏱️ Cron 任务概览</span>
          <el-button size="small" @click="$router.push('/cron')">管理任务</el-button>
        </div>
      </template>
      <el-row :gutter="20">
        <el-col :span="6">
          <div class="cron-stat">
            <div class="cron-stat-num">{{ jobs.length }}</div>
            <div class="cron-stat-label">全部任务</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="cron-stat">
            <div class="cron-stat-num green">{{ runningCount }}</div>
            <div class="cron-stat-label">运行中</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="cron-stat">
            <div class="cron-stat-num gray">{{ pausedCount }}</div>
            <div class="cron-stat-label">已暂停</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="cron-stat">
            <div class="cron-stat-num red">{{ errorCount }}</div>
            <div class="cron-stat-label">有错误</div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- 配置摘要 -->
    <el-card shadow="never" class="config-card">
      <template #header>
        <span class="card-title"> 配置摘要</span>
      </template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="路由模式">{{ settings.ROUTER_MODE || 'legacy' }}</el-descriptions-item>
        <el-descriptions-item label="会话绑定">{{ settings.ENABLE_MANUAL_SESSION_BIND === 'true' ? '允许' : '禁止' }}</el-descriptions-item>
        <el-descriptions-item label="显示思维链">{{ settings.SHOW_THINKING_CHAIN === 'true' ? '是' : '否' }}</el-descriptions-item>
        <el-descriptions-item label="显示工具链">{{ settings.SHOW_TOOL_CHAIN === 'true' ? '是' : '否' }}</el-descriptions-item>
        <el-descriptions-item label="工作目录白名单">
          <el-text v-if="settings.ALLOWED_DIRECTORIES" type="primary" size="small">{{ settings.ALLOWED_DIRECTORIES }}</el-text>
          <el-text v-else type="info" size="small">未配置</el-text>
        </el-descriptions-item>
        <el-descriptions-item label="工具白名单">
          <el-text v-if="settings.TOOL_WHITELIST" type="primary" size="small">{{ settings.TOOL_WHITELIST }}</el-text>
          <el-text v-else type="info" size="small">未配置</el-text>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  Monitor, Timer, DataLine, Clock, ChatDotRound, Connection, Cpu, Warning, DataAnalysis
} from '@element-plus/icons-vue'
import { useConfigStore } from '../stores/config'
import type { CronJob } from '../api/index'

const store = useConfigStore()
const status = ref(store.status)
const jobs = ref<CronJob[]>([])
const settings = ref(store.settings)

const dbStatus = computed(() => {
  if (!status.value?.dbPath) return '未知'
  const parts = status.value.dbPath.split('/')
  return parts[parts.length - 1] || 'SQLite'
})

const runningCount = computed(() => jobs.value.filter(j => j.enabled).length)
const pausedCount = computed(() => jobs.value.filter(j => !j.enabled).length)
const errorCount = computed(() => jobs.value.filter(j => !!j.state?.lastError).length)

onMounted(async () => {
  await Promise.all([store.fetchStatus(), store.fetchCronJobs(), store.fetchConfig()])
  status.value = store.status
  jobs.value = store.cronJobs
  settings.value = store.settings
})

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`
  const hours = Math.floor(seconds / 3600)
  if (hours < 24) return `${hours}小时`
  const days = Math.floor(hours / 24)
  return `${days}天${hours % 24}小时`
}

function formatStartTime(iso?: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function maskId(id?: string): string {
  if (!id) return '-'
  if (id.length <= 4) return '••••'
  return `${id.slice(0, 4)}••••${id.slice(-4)}`
}
</script>

<style scoped>
.page { max-width: 1200px; }
.page-header { margin-bottom: 24px; }
.page-header h2 { font-size: 22px; font-weight: 600; color: #1a1a2e; }
.desc { color: #666; margin-top: 6px; }

.stat-row { margin-bottom: 20px; }
.stat-card {
  display: flex;
  align-items: center;
  padding: 16px;
  cursor: pointer;
  transition: transform 0.2s;
}
.stat-card:hover { transform: translateY(-2px); }
.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  margin-right: 16px;
  flex-shrink: 0;
}
.stat-content { flex: 1; }
.stat-label { font-size: 13px; color: #909399; margin-bottom: 4px; }
.stat-value { font-size: 18px; font-weight: 600; color: #1a1a2e; }

.platform-card { margin-bottom: 0; }
.platform-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
}
.platform-status { padding: 8px 0; }
.status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px dashed #eee;
}
.status-row:last-child { border-bottom: none; }
.status-label { font-size: 13px; color: #909399; }
.status-value { font-size: 13px; color: #1a1a2e; font-weight: 500; }

.config-card { margin-bottom: 20px; }
.card-title { font-weight: 600; font-size: 15px; }
.card-header-row { display: flex; align-items: center; justify-content: space-between; }

.cron-stat {
  text-align: center;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 8px;
}
.cron-stat-num { font-size: 28px; font-weight: 700; color: #1a1a2e; }
.cron-stat-num.green { color: #67c23a; }
.cron-stat-num.gray { color: #909399; }
.cron-stat-num.red { color: #f56c6c; }
.cron-stat-label { font-size: 12px; color: #909399; margin-top: 4px; }
</style>
