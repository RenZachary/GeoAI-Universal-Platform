import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ChatMessage } from '@/types'
import * as chatService from '@/services/chat'

export const useChatStore = defineStore('chat', () => {
  // State
  const conversations = ref<any[]>([])
  const currentConversationId = ref<string | null>(null)
  const messages = ref<Map<string, ChatMessage[]>>(new Map())
  const isStreaming = ref(false)
  
  // Computed
  const currentMessages = computed(() => {
    if (!currentConversationId.value) return []
    return messages.value.get(currentConversationId.value) || []
  })
  
  // Actions
  async function loadConversations() {
    try {
      conversations.value = await chatService.listConversations()
    } catch (error) {
      console.error('Failed to load conversations:', error)
    }
  }
  
  async function loadConversation(conversationId: string) {
    try {
      const msgs = await chatService.getConversation(conversationId)
      messages.value.set(conversationId, msgs)
      currentConversationId.value = conversationId
    } catch (error) {
      console.error('Failed to load conversation:', error)
    }
  }
  
  async function sendMessage(message: string, onEvent?: (event: any) => void) {
    isStreaming.value = true
    
    try {
      await chatService.sendMessageStream(
        {
          message,
          conversationId: currentConversationId.value
        },
        (event) => {
          handleSSEEvent(event)
          if (onEvent) {
            onEvent(event)
          }
        }
      )
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      isStreaming.value = false
    }
  }
  
  function handleSSEEvent(event: any) {
    const { type, data } = event
    
    if (!currentConversationId.value && data?.conversationId) {
      currentConversationId.value = data.conversationId
    }
    
    const conversationId = currentConversationId.value
    if (!conversationId) return
    
    const currentMsgs = messages.value.get(conversationId) || []
    
    switch (type) {
      case 'message_start':
        // Add user message
        currentMsgs.push({
          id: `user-${Date.now()}`,
          role: 'user',
          content: data.content,
          timestamp: new Date().toISOString()
        })
        messages.value.set(conversationId, currentMsgs)
        break
        
      case 'token':
        // Streaming token from assistant
        if (currentMsgs.length === 0 || currentMsgs[currentMsgs.length - 1].role !== 'assistant') {
          currentMsgs.push({
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: '',
            timestamp: new Date().toISOString()
          })
        }
        const lastMsg = currentMsgs[currentMsgs.length - 1]
        lastMsg.content += data.token
        messages.value.set(conversationId, [...currentMsgs])
        break
        
      case 'message_complete':
        // Message complete
        isStreaming.value = false
        break
        
      case 'error':
        console.error('Chat error:', data.error)
        isStreaming.value = false
        break
    }
  }
  
  function createNewConversation() {
    currentConversationId.value = null
    messages.value.clear()
  }
  
  async function deleteConversation(conversationId: string) {
    try {
      await chatService.deleteConversation(conversationId)
      messages.value.delete(conversationId)
      
      if (currentConversationId.value === conversationId) {
        currentConversationId.value = null
      }
      
      await loadConversations()
    } catch (error) {
      console.error('Failed to delete conversation:', error)
    }
  }
  
  return {
    conversations,
    currentConversationId,
    messages,
    currentMessages,
    isStreaming,
    loadConversations,
    loadConversation,
    sendMessage,
    createNewConversation,
    deleteConversation
  }
})
