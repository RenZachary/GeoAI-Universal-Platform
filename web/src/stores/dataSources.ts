import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { DataSource } from '@/types'
import * as dataSourceService from '@/services/dataSource'
import * as fileUploadService from '@/services/fileUpload'

export interface UploadTask {
  id: string
  fileName: string
  progress: number
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
}

export const useDataSourceStore = defineStore('dataSources', () => {
  // State
  const dataSources = ref<DataSource[]>([])
  const isLoading = ref(false)
  const uploadTasks = ref<UploadTask[]>([])
  
  // Actions
  async function loadDataSources() {
    isLoading.value = true
    try {
      dataSources.value = await dataSourceService.listDataSources()
    } catch (error) {
      console.error('Failed to load data sources:', error)
    } finally {
      isLoading.value = false
    }
  }
  
  async function deleteDataSource(id: string) {
    try {
      await dataSourceService.deleteDataSource(id)
      // Remove from local state
      const index = dataSources.value.findIndex(ds => ds.id === id)
      if (index !== -1) {
        dataSources.value.splice(index, 1)
      }
    } catch (error) {
      console.error('Failed to delete data source:', error)
      throw error
    }
  }
  
  async function previewDataSource(id: string, limit: number = 10) {
    try {
      return await dataSourceService.previewDataSource(id, limit)
    } catch (error) {
      console.error('Failed to preview data source:', error)
      throw error
    }
  }
  
  async function uploadFile(file: File, onProgress?: (progress: number) => void) {
    const taskId = `upload-${Date.now()}-${file.name}`
    
    // Create upload task
    const task: UploadTask = {
      id: taskId,
      fileName: file.name,
      progress: 0,
      status: 'uploading'
    }
    uploadTasks.value.push(task)
    
    try {
      const result = await fileUploadService.uploadFile(file, (progress) => {
        task.progress = progress.percentage
        if (onProgress) {
          onProgress(progress.percentage)
        }
      })
      
      task.status = 'success'
      
      // Reload data sources to include new upload
      await loadDataSources()
      
      return result
    } catch (error: any) {
      task.status = 'error'
      task.error = error.message || 'Upload failed'
      throw error
    }
  }
  
  async function uploadMultipleFiles(files: File[], onProgress?: (taskId: string, progress: number) => void) {
    console.log('[dataSources] uploadMultipleFiles called with', files.length, 'files')
    console.log('[dataSources] Files:', files.map(f => f.name))
    
    // Create upload tasks for all files
    files.forEach(file => {
      const taskId = `upload-${Date.now()}-${file.name}`
      uploadTasks.value.push({
        id: taskId,
        fileName: file.name,
        progress: 0,
        status: 'uploading'
      })
    })
    
    try {
      // Use the fileUploadService which handles shapefile batch upload
      const result = await fileUploadService.uploadMultipleFiles(files, (fileName, progress) => {
        if (onProgress) {
          const task = uploadTasks.value.find(t => t.fileName === fileName)
          if (task) {
            task.progress = progress.percentage
            onProgress(task.id, progress.percentage)
          }
        }
      })
      
      // Mark all tasks as success
      uploadTasks.value.forEach(task => {
        if (files.some(f => f.name === task.fileName)) {
          task.status = 'success'
        }
      })
      
      // Reload data sources to include new uploads
      await loadDataSources()
      
      return result
    } catch (error: any) {
      // Mark tasks as error
      uploadTasks.value.forEach(task => {
        if (files.some(f => f.name === task.fileName)) {
          task.status = 'error'
          task.error = error.message || 'Upload failed'
        }
      })
      throw error
    }
  }
  
  function clearCompletedUploads() {
    uploadTasks.value = uploadTasks.value.filter(task => 
      task.status === 'uploading' || task.status === 'pending'
    )
  }
  
  return {
    dataSources,
    isLoading,
    uploadTasks,
    loadDataSources,
    deleteDataSource,
    previewDataSource,
    uploadFile,
    uploadMultipleFiles,
    clearCompletedUploads
  }
})
