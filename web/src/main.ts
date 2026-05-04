import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import { createI18n } from 'vue-i18n'
import router from './router'
import App from './App.vue'
import messages from './i18n/locales'
import { initializeFingerprint } from './utils/fingerprint'
import { useConfigStore } from './stores/config'

// Initialize i18n
const i18n = createI18n({
  legacy: false,
  locale: import.meta.env.VITE_DEFAULT_LANGUAGE || 'en-US',
  fallbackLocale: 'en-US',
  messages
})

// Create app instance
const app = createApp(App)

// Use Pinia
const pinia = createPinia()
app.use(pinia)

// Initialize fingerprint after Pinia is set up
const configStore = useConfigStore()
const fingerprint = initializeFingerprint()
configStore.setFingerprint(fingerprint)

// Use Router
app.use(router)

// Use i18n
app.use(i18n)

// Use Element Plus
app.use(ElementPlus)

// Register Element Plus icons
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// Mount app
app.mount('#app')
