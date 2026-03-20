import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/login', component: () => import('../views/Login.vue'), meta: { title: '登录' } },
  { path: '/dashboard', component: () => import('../views/Dashboard.vue'), meta: { title: '系统状态' } },
  { path: '/platforms', component: () => import('../views/Platforms.vue'), meta: { title: '平台接入' } },
  { path: '/opencode', component: () => import('../views/OpenCode.vue'), meta: { title: 'OpenCode 对接' } },
  { path: '/reliability', component: () => import('../views/Reliability.vue'), meta: { title: '高可用配置' } },
  { path: '/routing', component: () => import('../views/CoreRouting.vue'), meta: { title: '核心行为' } },
  { path: '/cron', component: () => import('../views/CronJobs.vue'), meta: { title: 'Cron 任务管理' } },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

// 鉴权守卫
router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('admin_token')
  if (to.path === '/login') {
    if (token) {
      next('/platforms')
    } else {
      next()
    }
  } else {
    if (!token) {
      next('/login')
    } else {
      next()
    }
  }
})
