import api from './api'
import type { PromptTemplate } from '@/types'

/**
 * List all prompt templates
 */
export async function listTemplates(): Promise<PromptTemplate[]> {
  const response = await api.get('/api/prompts')
  return response.data.templates || []
}

/**
 * Get a specific template
 */
export async function getTemplate(id: string): Promise<PromptTemplate> {
  const response = await api.get(`/api/prompts/${id}`)
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to get template')
  }
  return response.data.template
}

/**
 * Create a new template
 */
export async function createTemplate(template: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<PromptTemplate> {
  const response = await api.post('/api/prompts', template)
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to create template')
  }
  return response.data.template
}

/**
 * Update a template
 */
export async function updateTemplate(id: string, template: Partial<PromptTemplate>): Promise<PromptTemplate> {
  const response = await api.put(`/api/prompts/${id}`, template)
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to update template')
  }
  // For update, the backend returns { success: true, message: '...' }
  // We need to fetch the updated template
  return await getTemplate(id)
}

/**
 * Delete a template
 */
export async function deleteTemplate(id: string): Promise<void> {
  const response = await api.delete(`/api/prompts/${id}`)
  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to delete template')
  }
}
