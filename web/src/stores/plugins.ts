import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Plugin } from '@/types'
import * as pluginService from '@/services/plugins'

export const usePluginStore = defineStore('plugins', () => {
  // State
  const plugins = ref<Plugin[]>([])
  const isLoading = ref(false)
  const isUploading = ref(false)
  
  // Actions
  async function loadPlugins() {
    isLoading.value = true
    try {
      plugins.value = await pluginService.listPlugins()
    } catch (error) {
      console.error('Failed to load plugins:', error)
    } finally {
      isLoading.value = false
    }
  }
  
  async function getPluginDetails(pluginId: string) {
    try {
      return await pluginService.getPlugin(pluginId)
    } catch (error) {
      console.error('Failed to get plugin details:', error)
      throw error
    }
  }
  
  async function enablePlugin(pluginId: string) {
    try {
      await pluginService.enablePlugin(pluginId)
      // Update local state
      const plugin = plugins.value.find(p => p.id === pluginId)
      if (plugin) {
        plugin.enabled = true
      }
    } catch (error) {
      console.error('Failed to enable plugin:', error)
      throw error
    }
  }
  
  async function disablePlugin(pluginId: string) {
    try {
      await pluginService.disablePlugin(pluginId)
      // Update local state
      const plugin = plugins.value.find(p => p.id === pluginId)
      if (plugin) {
        plugin.enabled = false
      }
    } catch (error) {
      console.error('Failed to disable plugin:', error)
      throw error
    }
  }
  
  async function uploadPlugin(file: File) {
    isUploading.value = true
    try {
      const result = await pluginService.uploadPlugin(file)
      // Reload plugins to include new upload
      await loadPlugins()
      return result
    } catch (error) {
      console.error('Failed to upload plugin:', error)
      throw error
    } finally {
      isUploading.value = false
    }
  }
  
  async function deletePlugin(pluginId: string) {
    try {
      await pluginService.deletePlugin(pluginId)
      // Remove from local state
      const index = plugins.value.findIndex(p => p.id === pluginId)
      if (index !== -1) {
        plugins.value.splice(index, 1)
      }
    } catch (error) {
      console.error('Failed to delete plugin:', error)
      throw error
    }
  }
  
  return {
    plugins,
    isLoading,
    isUploading,
    loadPlugins,
    getPluginDetails,
    enablePlugin,
    disablePlugin,
    uploadPlugin,
    deletePlugin
  }
})
