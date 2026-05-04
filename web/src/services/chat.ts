import api from './api'
import type { ChatMessage } from '@/types'

export interface SendMessageParams {
  message: string
  conversationId?: string | null
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
  return response.data.conversations || []
}

/**
 * Delete a conversation
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  await api.delete(`/api/chat/conversations/${conversationId}`)
}
