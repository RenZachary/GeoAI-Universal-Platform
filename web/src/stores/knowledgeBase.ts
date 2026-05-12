import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { kbService } from '@/services/knowledgeBase'
import type { KBDocument, KBStatistics, SearchResponse } from '@/services/knowledgeBase'

export const useKnowledgeBaseStore = defineStore('knowledgeBase', () => {
  // State
  const documents = ref<KBDocument[]>([])
  const currentDocument = ref<KBDocument | null>(null)
  const statistics = ref<KBStatistics | null>(null)
  const searchResults = ref<SearchResponse | null>(null)
  
  const isLoading = ref(false)
  const isUploading = ref(false)
  const isSearching = ref(false)
  
  // Pagination state
  const currentPage = ref(1)
  const pageSize = ref(10)
  const totalDocuments = ref(0)
  const totalPages = ref(0)
  
  // Filter state
  const filterType = ref<string>('')
  const filterStatus = ref<string>('')
  const sortBy = ref<string>('createdAt')
  const sortOrder = ref<'asc' | 'desc'>('desc')

  // Computed
  const readyDocumentsCount = computed(() => {
    return statistics.value?.documentsByStatus.ready || 0
  })

  const processingDocumentsCount = computed(() => {
    return statistics.value?.documentsByStatus.processing || 0
  })

  const errorDocumentsCount = computed(() => {
    return statistics.value?.documentsByStatus.error || 0
  })

  // Actions
  async function loadDocuments(page?: number) {
    if (page !== undefined) {
      currentPage.value = page
    }
    
    isLoading.value = true
    try {
      const response = await kbService.listDocuments({
        page: currentPage.value,
        pageSize: pageSize.value,
        type: filterType.value || undefined,
        status: filterStatus.value || undefined,
        sortBy: sortBy.value,
        sortOrder: sortOrder.value
      })
      
      documents.value = response.documents
      totalDocuments.value = response.total
      totalPages.value = response.totalPages
    } catch (error) {
      console.error('Failed to load documents:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  async function loadDocumentDetail(id: string) {
    isLoading.value = true
    try {
      currentDocument.value = await kbService.getDocument(id)
    } catch (error) {
      console.error('Failed to load document detail:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  async function uploadDocument(file: File) {
    isUploading.value = true
    try {
      const result = await kbService.uploadDocument(file)
      
      // Reload documents list
      await loadDocuments(currentPage.value)
      
      // Reload statistics
      await loadStatistics()
      
      return result
    } catch (error) {
      console.error('Failed to upload document:', error)
      throw error
    } finally {
      isUploading.value = false
    }
  }

  async function deleteDocument(id: string) {
    try {
      await kbService.deleteDocument(id)
      
      // Remove from local state
      const index = documents.value.findIndex(doc => doc.id === id)
      if (index !== -1) {
        documents.value.splice(index, 1)
      }
      
      // If deleted document is current, clear it
      if (currentDocument.value?.id === id) {
        currentDocument.value = null
      }
      
      // Reload statistics
      await loadStatistics()
      
      // If current page is empty and not first page, go to previous page
      if (documents.value.length === 0 && currentPage.value > 1) {
        await loadDocuments(currentPage.value - 1)
      }
    } catch (error) {
      console.error('Failed to delete document:', error)
      throw error
    }
  }

  async function loadStatistics() {
    try {
      statistics.value = await kbService.getStatistics()
    } catch (error) {
      console.error('Failed to load statistics:', error)
      throw error
    }
  }

  async function search(query: string, options?: {
    topK?: number
    similarityThreshold?: number
    documentId?: string
  }) {
    isSearching.value = true
    try {
      const request = {
        query,
        topK: options?.topK || 5,
        similarityThreshold: options?.similarityThreshold,
        documentId: options?.documentId
      }
      
      if (options?.documentId) {
        searchResults.value = await kbService.searchInDocument(
          options.documentId,
          query,
          options.topK
        )
      } else {
        searchResults.value = await kbService.search(request)
      }
      
      return searchResults.value
    } catch (error) {
      console.error('Failed to search:', error)
      throw error
    } finally {
      isSearching.value = false
    }
  }

  function clearSearchResults() {
    searchResults.value = null
  }

  function setFilters(type: string, status: string) {
    filterType.value = type
    filterStatus.value = status
    currentPage.value = 1 // Reset to first page when filters change
  }

  function setSort(field: string, order: 'asc' | 'desc') {
    sortBy.value = field
    sortOrder.value = order
    currentPage.value = 1 // Reset to first page when sort changes
  }

  function clearFilters() {
    filterType.value = ''
    filterStatus.value = ''
    sortBy.value = 'createdAt'
    sortOrder.value = 'desc'
    currentPage.value = 1
  }

  return {
    // State
    documents,
    currentDocument,
    statistics,
    searchResults,
    isLoading,
    isUploading,
    isSearching,
    currentPage,
    pageSize,
    totalDocuments,
    totalPages,
    filterType,
    filterStatus,
    sortBy,
    sortOrder,
    
    // Computed
    readyDocumentsCount,
    processingDocumentsCount,
    errorDocumentsCount,
    
    // Actions
    loadDocuments,
    loadDocumentDetail,
    uploadDocument,
    deleteDocument,
    loadStatistics,
    search,
    clearSearchResults,
    setFilters,
    setSort,
    clearFilters
  }
})
