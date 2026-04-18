import { createApp } from 'vue'
import { createPinia } from 'pinia'
// EP component CSS is auto-imported per-component by unplugin-vue-components
// Only load the base/reset styles that EP needs globally
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/base.css'
import { router } from './router/index'
import App from './App.vue'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

app.mount('#app')
