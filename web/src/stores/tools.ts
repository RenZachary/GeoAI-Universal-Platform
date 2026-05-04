import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Tool } from '@/types'
import * as toolService from '@/services/tools'

export const useToolStore = defineStore('tools', () => {
  // State
  const tools = ref<Tool[]>([])
  const isLoading = ref(false)
  const executingToolId = ref<string | null>(null)
  const executionResult = ref<any>(null)
  
  // Actions
  async function loadTools() {
    isLoading.value = true
    try {
      tools.value = await toolService.listTools()
    } catch (error) {
      console.error('Failed to load tools:', error)
    } finally {
      isLoading.value = false
    }
  }
  
  async function getToolDetails(toolId: string) {
    try {
      return await toolService.getTool(toolId)
    } catch (error) {
      console.error('Failed to get tool details:', error)
      throw error
    }
  }
  
  async function executeTool(toolId: string, parameters: any) {
    executingToolId.value = toolId
    executionResult.value = null
    
    try {
      const result = await toolService.executeTool(toolId, parameters)
      executionResult.value = result
      return result
    } catch (error) {
      console.error('Failed to execute tool:', error)
      throw error
    } finally {
      executingToolId.value = null
    }
  }
  
  function clearExecutionResult() {
    executionResult.value = null
  }
  
  return {
    tools,
    isLoading,
    executingToolId,
    executionResult,
    loadTools,
    getToolDetails,
    executeTool,
    clearExecutionResult
  }
})
