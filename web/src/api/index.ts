import axios from 'axios'

const http = axios.create({ baseURL: '/api' })

// 从 localStorage 读取 token 注入 Authorization 头
http.interceptors.request.use(config => {
  const token = localStorage.getItem('admin_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export interface BridgeSettings {
  FEISHU_APP_ID?: string
  FEISHU_APP_SECRET?: string
  FEISHU_ENCRYPT_KEY?: string
  FEISHU_VERIFICATION_TOKEN?: string
  ALLOWED_USERS?: string
  ENABLED_PLATFORMS?: string
  DISCORD_ENABLED?: string
  DISCORD_TOKEN?: string
  DISCORD_BOT_TOKEN?: string
  DISCORD_CLIENT_ID?: string
  DISCORD_ALLOWED_BOT_IDS?: string
  OPENCODE_HOST?: string
  OPENCODE_PORT?: string
  OPENCODE_AUTO_START?: string
  OPENCODE_AUTO_START_CMD?: string
  OPENCODE_SERVER_USERNAME?: string
  OPENCODE_SERVER_PASSWORD?: string
  OPENCODE_CONFIG_FILE?: string
  RELIABILITY_CRON_ENABLED?: string
  RELIABILITY_CRON_API_ENABLED?: string
  RELIABILITY_CRON_API_HOST?: string
  RELIABILITY_CRON_API_PORT?: string
  RELIABILITY_CRON_API_TOKEN?: string
  RELIABILITY_CRON_JOBS_FILE?: string
  RELIABILITY_CRON_ORPHAN_AUTO_CLEANUP?: string
  RELIABILITY_CRON_FORWARD_TO_PRIVATE?: string
  RELIABILITY_CRON_FALLBACK_FEISHU_CHAT_ID?: string
  RELIABILITY_CRON_FALLBACK_DISCORD_CONVERSATION_ID?: string
  RELIABILITY_PROACTIVE_HEARTBEAT_ENABLED?: string
  RELIABILITY_INBOUND_HEARTBEAT_ENABLED?: string
  RELIABILITY_HEARTBEAT_INTERVAL_MS?: string
  RELIABILITY_HEARTBEAT_AGENT?: string
  RELIABILITY_HEARTBEAT_PROMPT?: string
  RELIABILITY_HEARTBEAT_ALERT_CHATS?: string
  RELIABILITY_FAILURE_THRESHOLD?: string
  RELIABILITY_WINDOW_MS?: string
  RELIABILITY_COOLDOWN_MS?: string
  RELIABILITY_REPAIR_BUDGET?: string
  RELIABILITY_MODE?: string
  RELIABILITY_LOOPBACK_ONLY?: string
  GROUP_REQUIRE_MENTION?: string
  GROUP_REPLY_REQUIRE_MENTION?: string
  SHOW_THINKING_CHAIN?: string
  SHOW_TOOL_CHAIN?: string
  FEISHU_SHOW_THINKING_CHAIN?: string
  FEISHU_SHOW_TOOL_CHAIN?: string
  DISCORD_SHOW_THINKING_CHAIN?: string
  DISCORD_SHOW_TOOL_CHAIN?: string
  ALLOWED_DIRECTORIES?: string
  DEFAULT_WORK_DIRECTORY?: string
  PROJECT_ALIASES?: string
  GIT_ROOT_NORMALIZATION?: string
  TOOL_WHITELIST?: string
  PERMISSION_REQUEST_TIMEOUT_MS?: string
  OUTPUT_UPDATE_INTERVAL?: string
  MAX_DELAYED_RESPONSE_WAIT_MS?: string
  ATTACHMENT_MAX_SIZE?: string
  ENABLE_MANUAL_SESSION_BIND?: string
  ROUTER_MODE?: string
  DEFAULT_PROVIDER?: string
  DEFAULT_MODEL?: string
}

export interface SaveConfigResult {
  ok: boolean
  needRestart: boolean
  changedKeys: string[]
}

export interface CronJob {
  id: string
  name?: string
  cronExpression: string
  enabled: boolean
  platform: string
  conversationId: string
  lastRunAt?: string
  nextRunAt?: string
  state?: { status: string; lastError?: string }
}

export interface ServiceStatus {
  version: string
  uptime: number
  startedAt: string
  dbPath: string
  cronJobCount: number
}

export interface CreateCronJobInput {
  name?: string
  cronExpression: string
  platform: 'feishu' | 'discord'
  conversationId: string
  prompt?: string
}

export const configApi = {
  async getConfig(): Promise<BridgeSettings> {
    const res = await http.get<{ settings: BridgeSettings }>('/config')
    return res.data.settings
  },

  async saveConfig(settings: BridgeSettings): Promise<SaveConfigResult> {
    const res = await http.post<SaveConfigResult>('/config', settings)
    return res.data
  },

  async getCronJobs(): Promise<CronJob[]> {
    const res = await http.get<{ jobs: CronJob[] }>('/cron')
    return res.data.jobs
  },

  async createCronJob(input: CreateCronJobInput): Promise<CronJob> {
    const res = await http.post<{ job: CronJob }>('/cron/create', input)
    return res.data.job
  },

  async toggleCronJob(id: string): Promise<CronJob> {
    const res = await http.post<{ job: CronJob }>(`/cron/${id}/toggle`)
    return res.data.job
  },

  async deleteCronJob(id: string): Promise<void> {
    await http.delete(`/cron/${id}`)
  },

  async getStatus(): Promise<ServiceStatus> {
    const res = await http.get<ServiceStatus>('/admin/status')
    return res.data
  },

  async restart(): Promise<void> {
    await http.post('/admin/restart')
  },
}
