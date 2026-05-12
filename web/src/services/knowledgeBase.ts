import api from './api'

export interface KBDocument {
  id: string
  name: string
  type: 'pdf' | 'word' | 'markdown'
  fileSize: number  // Changed from 'size' to match backend
  status: 'processing' | 'ready' | 'error'
  chunkCount?: number
  createdAt: string
  updatedAt: string
  metadata?: Record<string, any>
}

export interface KBDocumentListResponse {
  documents: KBDocument[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface KBDocumentDetail extends KBDocument {
  metadata?: {
    author?: string
    description?: string
    tags?: string[]
    [key: string]: any
  }
}

export interface KBStatistics {
  totalDocuments: number
  documentsByStatus: {
    processing: number
    ready: number
    error: number
  }
  documentsByType: {
    pdf: number
    word: number
    markdown: number
  }
  totalChunks: number
  collectionStats?: {
    name: string
    count: number
  }
}

export interface SearchRequest {
  query: string
  topK?: number
  similarityThreshold?: number
  documentId?: string
}

export interface SearchResult {
  content: string
  documentId: string
  score: number
  metadata: {
    documentName: string
    chunkIndex: number
    [key: string]: any
  }
}

export interface SearchResponse {
  documents: SearchResult[]
  query: string
  totalResults: number
  searchTime: number
}

/**
 * Knowledge Base Service
 */
export class KnowledgeBaseService {
  /**
   * Upload a document to knowledge base
   */
  async uploadDocument(file: File): Promise<{ documentId: string; chunkCount: number; status: string }> {
    const formData = new FormData()
    formData.append('file', file)

    const response = await api.post('/api/kb/documents/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })

    return response.data.data
  }

  /**
   * List documents in knowledge base
   */
  async listDocuments(params?: {
    page?: number
    pageSize?: number
    type?: string
    status?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
  }): Promise<KBDocumentListResponse> {
    const response = await api.get('/api/kb/documents', { params })
    return response.data.data
  }

  /**
   * Get document details
   */
  async getDocument(id: string): Promise<KBDocumentDetail> {
    const response = await api.get(`/api/kb/documents/${id}`)
    return response.data.data
  }

  /**
   * Delete a document
   */
  async deleteDocument(id: string): Promise<void> {
    await api.delete(`/api/kb/documents/${id}`)
  }

  /**
   * Get knowledge base statistics
   */
  async getStatistics(): Promise<KBStatistics> {
    const response = await api.get('/api/kb/stats')
    return response.data.data
  }

  /**
   * Semantic search across all documents
   */
  async search(request: SearchRequest): Promise<SearchResponse> {
    const response = await api.post('/api/kb/search', request)
    return response.data.data
  }

  /**
   * Search within a specific document
   */
  async searchInDocument(documentId: string, query: string, topK?: number): Promise<SearchResponse> {
    const response = await api.post(`/api/kb/search/document/${documentId}`, {
      query,
      topK
    })
    return response.data.data
  }
}

// Export singleton instance
export const kbService = new KnowledgeBaseService()
