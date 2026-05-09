/**
 * Spatial Operators Service - v2.0 API
 * 
 * Replaces deprecated /api/tools endpoints with new /api/operators endpoints.
 * Provides access to SpatialOperator registry and execution.
 */
import api from './api'
import type { Tool } from '@/types'

/**
 * List all available spatial operators
 * GET /api/operators
 */
export async function listTools(): Promise<Tool[]> {
  const response = await api.get('/api/operators')
  return response.data.operators || []
}

/**
 * Get operator details including schemas
 * GET /api/operators/:id
 */
export async function getTool(toolId: string): Promise<Tool> {
  const response = await api.get(`/api/operators/${toolId}`)
  return response.data.operator
}

/**
 * Execute a spatial operator with validated input
 * POST /api/operators/:id/execute
 */
export async function executeTool(toolId: string, parameters: any): Promise<any> {
  const response = await api.post(`/api/operators/${toolId}/execute`, parameters)
  return response.data.result
}
