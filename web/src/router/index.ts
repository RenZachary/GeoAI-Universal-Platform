import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import MainLayout from '@/components/layout/MainLayout.vue'
import { getTranslatedTitle } from '@/utils/i18n'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: MainLayout,
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('@/views/ChatView.vue'),
        meta: { title: 'chat.conversations' }
      },
      {
        path: 'data',
        name: 'data',
        component: () => import('@/views/DataManagementView.vue'),
        meta: { title: 'data.title' }
      },
      {
        path: 'tools',
        name: 'tools',
        component: () => import('@/views/ToolLibraryView.vue'),
        meta: { title: 'tools.title' }
      },
      {
        path: 'templates',
        name: 'templates',
        component: () => import('@/views/TemplateManagerView.vue'),
        meta: { title: 'templates.title' }
      },
      {
        path: 'plugins',
        name: 'plugins',
        component: () => import('@/views/PluginManagerView.vue'),
        meta: { title: 'plugins.title' }
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/views/SettingsView.vue'),
        meta: { title: 'settings.title' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.VITE_BASE_URL || '/'),
  routes
})

// Navigation guard - set page title
router.beforeEach((to, _from) => {
  const titleKey = to.meta.title as string || 'common.home'
  document.title = getTranslatedTitle(titleKey)
})

export default router
