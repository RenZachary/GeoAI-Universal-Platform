import api from './api'
import type { Plugin } from '@/types'

/**
 * List all plugins
 */
export async function listPlugins(): Promise<Plugin[]> {
  const response = await api.get('/api/plugins')
  return response.data.data || []
}

/**
 * Get plugin details
 */
export async function getPlugin(pluginId: string): Promise<Plugin> {
  const response = await api.get(`/api/plugins/${pluginId}`)
  return response.data.plugin
}

/**
 * Enable a plugin
 */
export async function enablePlugin(pluginId: string): Promise<void> {
  await api.post(`/api/plugins/${pluginId}/enable`)
}

/**
 * Disable a plugin
 */
export async function disablePlugin(pluginId: string): Promise<void> {
  await api.post(`/api/plugins/${pluginId}/disable`)
}

/**
 * Upload custom plugin
 */
export async function uploadPlugin(file: File): Promise<any> {
  const formData = new FormData()
  formData.append('plugin', file)

  const response = await api.post('/api/plugins/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })

  return response.data
}

/**
 * Delete a plugin
 */
export async function deletePlugin(pluginId: string): Promise<void> {
  await api.delete(`/api/plugins/${pluginId}`)
}
