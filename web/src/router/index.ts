import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import MainLayout from '@/components/layout/MainLayout.vue'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: MainLayout,
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('@/views/ChatView.vue'),
        meta: { title: 'Chat' }
      },
      {
        path: 'map',
        name: 'map',
        component: () => import('@/views/MapView.vue'),
        meta: { title: 'Map' }
      },
      {
        path: 'data',
        name: 'data',
        component: () => import('@/views/DataManagementView.vue'),
        meta: { title: 'Data Management' }
      },
      {
        path: 'tools',
        name: 'tools',
        component: () => import('@/views/ToolLibraryView.vue'),
        meta: { title: 'Tool Library' }
      },
      {
        path: 'templates',
        name: 'templates',
        component: () => import('@/views/TemplateManagerView.vue'),
        meta: { title: 'Prompt Templates' }
      },
      {
        path: 'plugins',
        name: 'plugins',
        component: () => import('@/views/PluginManagerView.vue'),
        meta: { title: 'Plugin Manager' }
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/views/SettingsView.vue'),
        meta: { title: 'Settings' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Navigation guard - set page title
router.beforeEach((to, _from) => {
  const title = to.meta.title || 'Home'
  document.title = `GeoAI-UP - ${title}`
})

export default router
