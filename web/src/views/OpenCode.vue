<template>
  <div class="page">
    <div class="page-header">
      <h2>OpenCode 对接配置</h2>
      <p class="desc">配置 OpenCode 服务连接地址、认证凭证与自动启动行为</p>
    </div>

    <el-form :model="form" label-position="top" @submit.prevent>

      <el-card class="config-card">
        <template #header><span class="card-title">🔌 服务连接</span></template>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="OpenCode 服务地址（OPENCODE_HOST）">
              <el-input v-model="form.OPENCODE_HOST" placeholder="localhost" />
              <div class="field-tip">OpenCode 服务监听的主机名或 IP，默认 localhost</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="OpenCode 端口（OPENCODE_PORT）">
              <el-input-number v-model="portNum" :min="1" :max="65535" style="width:100%" @change="form.OPENCODE_PORT = String(portNum)" />
              <div class="field-tip">OpenCode 服务监听的端口，默认 4096</div>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="OpenCode 配置文件路径（OPENCODE_CONFIG_FILE）">
              <el-input v-model="form.OPENCODE_CONFIG_FILE" placeholder="./opencode.json" />
              <div class="field-tip">宕机救援时用于备份/回退的 OpenCode 配置文件路径</div>
            </el-form-item>
          </el-col>
        </el-row>
      </el-card>

      <el-card class="config-card">
        <template #header><span class="card-title">🔑 Basic Auth 认证</span></template>
        <el-alert type="info" :closable="false" show-icon style="margin-bottom:16px">
          当 OpenCode 服务端开启了 OPENCODE_SERVER_PASSWORD，此处必须配置相同凭据，否则将出现 401 认证失败
        </el-alert>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="用户名（OPENCODE_SERVER_USERNAME）">
              <el-input v-model="form.OPENCODE_SERVER_USERNAME" placeholder="opencode" />
              <div class="field-tip">Basic Auth 用户名，默认值为 opencode</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="密码（OPENCODE_SERVER_PASSWORD）">
              <el-input v-model="form.OPENCODE_SERVER_PASSWORD" placeholder="留空则不启用认证"
                type="password" show-password />
              <div class="field-tip">Basic Auth 密码，需与 OpenCode 服务端配置一致</div>
            </el-form-item>
          </el-col>
        </el-row>
      </el-card>

      <el-card class="config-card">
        <template #header>
          <div class="card-header-row">
            <span class="card-title">🚀 自动启动 OpenCode</span>
            <el-switch v-model="autoStart"
              active-text="启用" inactive-text="关闭"
              @change="form.OPENCODE_AUTO_START = autoStart ? 'true' : 'false'" />
          </div>
        </template>
        <el-alert type="warning" :closable="false" show-icon style="margin-bottom:16px">
          开启后，Bridge 启动时会自动执行下方命令拉起 OpenCode 后台进程
        </el-alert>
        <el-row :gutter="24">
          <el-col :span="24">
            <el-form-item label="OpenCode 启动命令（OPENCODE_AUTO_START_CMD）">
              <el-input v-model="form.OPENCODE_AUTO_START_CMD" placeholder="opencode serve"
                :disabled="!autoStart" />
              <div class="field-tip">默认为 <code>opencode serve</code>（headless 后台模式），可自定义完整命令</div>
            </el-form-item>
          </el-col>
        </el-row>
      </el-card>

      <div class="form-actions">
        <el-button type="primary" :loading="saving" @click="handleSave" size="large">保存配置</el-button>
      </div>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useConfigStore } from '../stores/config'

const store = useConfigStore()
const saving = ref(false)
const autoStart = ref(false)
const portNum = ref(4096)

const form = reactive({
  OPENCODE_HOST: 'localhost',
  OPENCODE_PORT: '4096',
  OPENCODE_AUTO_START: 'false',
  OPENCODE_AUTO_START_CMD: 'opencode serve',
  OPENCODE_SERVER_USERNAME: 'opencode',
  OPENCODE_SERVER_PASSWORD: '',
  OPENCODE_CONFIG_FILE: '',
})

onMounted(() => syncFromStore())
watch(() => store.settings, () => syncFromStore(), { deep: true })

function syncFromStore() {
  const s = store.settings
  Object.assign(form, {
    OPENCODE_HOST: s.OPENCODE_HOST || 'localhost',
    OPENCODE_PORT: s.OPENCODE_PORT || '4096',
    OPENCODE_AUTO_START: s.OPENCODE_AUTO_START || 'false',
    OPENCODE_AUTO_START_CMD: s.OPENCODE_AUTO_START_CMD || 'opencode serve',
    OPENCODE_SERVER_USERNAME: s.OPENCODE_SERVER_USERNAME || 'opencode',
    OPENCODE_SERVER_PASSWORD: s.OPENCODE_SERVER_PASSWORD || '',
    OPENCODE_CONFIG_FILE: s.OPENCODE_CONFIG_FILE || '',
  })
  portNum.value = parseInt(form.OPENCODE_PORT) || 4096
  autoStart.value = form.OPENCODE_AUTO_START === 'true'
}

async function handleSave() {
  form.OPENCODE_PORT = String(portNum.value)
  saving.value = true
  try {
    const result = await store.saveConfig({ ...form })
    if (result.needRestart) {
      ElMessageBox.confirm(`以下配置需要重启才能生效：${result.changedKeys.join('、')}`, '配置已保存', {
        confirmButtonText: '立即重启', cancelButtonText: '稍后手动重启', type: 'warning'
      }).then(() => store.restart()).catch(() => {})
    } else {
      ElMessage.success('配置已保存')
    }
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.page { max-width: 900px; }
.page-header { margin-bottom: 24px; }
.page-header h2 { font-size: 22px; font-weight: 600; color: #1a1a2e; }
.desc { color: #666; margin-top: 6px; }
.config-card { margin-bottom: 20px; }
.card-title { font-weight: 600; font-size: 15px; }
.card-header-row { display: flex; align-items: center; justify-content: space-between; }
.field-tip { font-size: 12px; color: #999; margin-top: 4px; line-height: 1.4; }
.form-actions { text-align: right; margin-top: 8px; }
code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-size: 11px; }
</style>
