import api from './api'
import type { ChatMessage } from '@/types'

export interface SpatialContext {
  viewportBbox?: [number, number, number, number]
  selectedFeature?: {
    datasetId: string
    featureId: string
    geometry: GeoJSON.Geometry
    properties: Record<string, any>
  }
  drawnGeometries?: Array<{
    id: string
    type: 'polygon' | 'circle' | 'line'
    geometry: GeoJSON.Geometry
    properties?: Record<string, any>
  }>
}

export interface SendMessageParams {
  message: string
  conversationId?: string | null
  context?: SpatialContext
  llmConfig?: {
    provider: string
    model: string
    apiKey: string
    apiUrl?: string
    temperature?: number
    maxTokens?: number
  }
}

/**
 * Send message with SSE streaming
 */
export async function sendMessageStream(
  params: SendMessageParams,
  onEvent: (event: any) => void
): Promise<void> {
  const response = await fetch(`${api.defaults.baseURL}/api/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Browser-Fingerprint': localStorage.getItem('browser_fingerprint') || ''
    },
    body: JSON.stringify({
      message: params.message,
      conversationId: params.conversationId,
      context: params.context,
      llmConfig: params.llmConfig
    })
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Response body is not readable')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      
      if (done) break
      
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') {
            return
          }
          
          try {
            const event = JSON.parse(data)
            onEvent(event)
          } catch (e) {
            console.error('Failed to parse SSE event:', e)
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Get conversation history
 */
export async function getConversation(conversationId: string): Promise<ChatMessage[]> {
  const response = await api.get(`/api/chat/conversations/${conversationId}`)
  return response.data.messages || []
}

/**
 * List all conversations
 */
export async function listConversations(): Promise<any[]> {
  const response = await api.get('/api/chat/conversations')
  const conversations = response.data.conversations || []
  
  // Convert snake_case to camelCase for frontend consistency
  return conversations.map((conv: any) => ({
    id: conv.id,
    createdAt: formatDate(conv.created_at),
    updatedAt: formatDate(conv.updated_at),
    messageCount: conv.message_count,
    customTitle: conv.custom_title,
    title: conv.title
  }))
}

/**
 * Helper function to format date strings from backend
 * Converts "2026-05-12 16:21:38" to ISO format "2026-05-12T16:21:38"
 */
function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  // Replace space with 'T' to make it ISO 8601 compatible
  return dateStr.replace(' ', 'T')
}

/**
 * Delete a conversation
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  await api.delete(`/api/chat/conversations/${conversationId}`)
}

/**
 * Rename a conversation
 */
export async function renameConversation(conversationId: string, title: string): Promise<void> {
  await api.put(`/api/chat/conversations/${conversationId}`, { title })
}
