import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { configApi, type BridgeSettings, type CronJob, type ServiceStatus, type CreateCronJobInput } from '../api/index'

export const useConfigStore = defineStore('config', () => {
  const settings = ref<BridgeSettings>({})
  const cronJobs = ref<CronJob[]>([])
  const status = ref<ServiceStatus | null>(null)
  const loading = ref(false)
  const pendingRestart = ref(false)
  const pendingRestartKeys = ref<string[]>([])

  const cronJobCount = computed(() => cronJobs.value.length)
  const runningJobCount = computed(() => cronJobs.value.filter(j => j.enabled).length)

  async function fetchConfig() {
    loading.value = true
    try {
      settings.value = await configApi.getConfig()
    } finally {
      loading.value = false
    }
  }

  async function saveConfig(partial: BridgeSettings) {
    const result = await configApi.saveConfig({ ...settings.value, ...partial })
    settings.value = { ...settings.value, ...partial }
    if (result.needRestart) {
      pendingRestart.value = true
      pendingRestartKeys.value = result.changedKeys
    }
    return result
  }

  async function fetchCronJobs() {
    cronJobs.value = await configApi.getCronJobs()
  }

  async function toggleCronJob(id: string) {
    const updated = await configApi.toggleCronJob(id)
    const idx = cronJobs.value.findIndex(j => j.id === id)
    if (idx !== -1) cronJobs.value[idx] = updated
  }

  async function deleteCronJob(id: string) {
    await configApi.deleteCronJob(id)
    cronJobs.value = cronJobs.value.filter(j => j.id !== id)
  }

  async function createCronJob(input: CreateCronJobInput) {
    const created = await configApi.createCronJob(input)
    cronJobs.value = [...cronJobs.value, created]
  }

  async function fetchStatus() {
    status.value = await configApi.getStatus()
  }

  async function restart() {
    await configApi.restart()
    pendingRestart.value = false
    pendingRestartKeys.value = []
  }

  return {
    settings, cronJobs, status, loading,
    pendingRestart, pendingRestartKeys,
    cronJobCount, runningJobCount,
    fetchConfig, saveConfig,
    fetchCronJobs, toggleCronJob, deleteCronJob, createCronJob,
    fetchStatus, restart,
  }
})
