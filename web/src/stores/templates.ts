import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PromptTemplate } from '@/types'
import * as templateService from '@/services/templates'

export const useTemplateStore = defineStore('templates', () => {
  // State
  const templates = ref<PromptTemplate[]>([])
  const isLoading = ref(false)
  
  // Actions
  async function loadTemplates() {
    isLoading.value = true
    try {
      templates.value = await templateService.listTemplates()
    } catch (error) {
      console.error('Failed to load templates:', error)
    } finally {
      isLoading.value = false
    }
  }
  
  async function getTemplate(id: string) {
    try {
      return await templateService.getTemplate(id)
    } catch (error) {
      console.error('Failed to get template:', error)
      throw error
    }
  }
  
  async function createTemplate(template: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>) {
    try {
      const newTemplate = await templateService.createTemplate(template)
      templates.value.push(newTemplate)
      return newTemplate
    } catch (error) {
      console.error('Failed to create template:', error)
      throw error
    }
  }
  
  async function updateTemplate(id: string, updates: Partial<PromptTemplate>) {
    try {
      const updated = await templateService.updateTemplate(id, updates)
      // Update local state
      const index = templates.value.findIndex(t => t.id === id)
      if (index !== -1) {
        templates.value[index] = updated
      }
      return updated
    } catch (error) {
      console.error('Failed to update template:', error)
      throw error
    }
  }
  
  async function deleteTemplate(id: string) {
    try {
      await templateService.deleteTemplate(id)
      // Remove from local state
      const index = templates.value.findIndex(t => t.id === id)
      if (index !== -1) {
        templates.value.splice(index, 1)
      }
    } catch (error) {
      console.error('Failed to delete template:', error)
      throw error
    }
  }
  
  return {
    templates,
    isLoading,
    loadTemplates,
    getTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate
  }
})
