import api from './api'
import type { Tool } from '@/types'

/**
 * List all available tools
 */
export async function listTools(): Promise<Tool[]> {
  const response = await api.get('/api/tools')
  return response.data.tools || []
}

/**
 * Get tool details
 */
export async function getTool(toolId: string): Promise<Tool> {
  const response = await api.get(`/api/tools/${toolId}`)
  return response.data.tool
}

/**
 * Execute a tool
 */
export async function executeTool(toolId: string, parameters: any): Promise<any> {
  const response = await api.post(`/api/tools/${toolId}/execute`, parameters)
  return response.data.result
}
