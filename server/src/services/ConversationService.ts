/**
 * Conversation Service - Handles conversation and message persistence
 */

import type Database from 'better-sqlite3';

export interface ConversationSummary {
  id: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ChatMessage {
  role: string;
  content: string;
  timestamp: string;
  services?: any;  // Visualization services array
}

export class ConversationService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * List all conversations with summary information
   */
  listConversations(): ConversationSummary[] {
    try {
      const conversations = this.db.prepare(`
        SELECT DISTINCT conversation_id as id, 
               MIN(timestamp) as created_at,
               MAX(timestamp) as updated_at,
               COUNT(*) as message_count
        FROM conversation_messages
        GROUP BY conversation_id
        ORDER BY updated_at DESC
      `).all() as ConversationSummary[];

      return conversations;
    } catch (error) {
      console.error('[ConversationService] Error listing conversations:', error);
      throw error;
    }
  }

  /**
   * Get conversation history by ID
   */
  getConversation(conversationId: string): ChatMessage[] {
    try {
      const messages = this.db.prepare(`
        SELECT role, content, timestamp, services
        FROM conversation_messages
        WHERE conversation_id = ?
        ORDER BY timestamp ASC
      `).all(conversationId) as Array<{ role: string; content: string; timestamp: string; services: string | null }>;

      // Deserialize services JSON
      return messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        services: msg.services ? JSON.parse(msg.services) : undefined
      }));
    } catch (error) {
      console.error('[ConversationService] Error getting conversation:', error);
      throw error;
    }
  }

  /**
   * Delete conversation and all its messages
   */
  deleteConversation(conversationId: string): void {
    try {
      // Delete conversation messages
      this.db.prepare(`
        DELETE FROM conversation_messages
        WHERE conversation_id = ?
      `).run(conversationId);

      console.log(`[ConversationService] Deleted conversation: ${conversationId}`);
    } catch (error) {
      console.error('[ConversationService] Error deleting conversation:', error);
      throw error;
    }
  }

  /**
   * Save visualization services to the last assistant message
   */
  saveServicesToLastMessage(conversationId: string, services: any[]): void {
    try {
      if (!services || services.length === 0) {
        return;
      }

      // Get the last assistant message for this conversation
      const lastMessage = this.db.prepare(`
        SELECT id FROM conversation_messages
        WHERE conversation_id = ? AND role = 'assistant'
        ORDER BY timestamp DESC
        LIMIT 1
      `).get(conversationId) as { id: number } | undefined;

      if (lastMessage) {
        // Update the message with services (serialized as JSON)
        this.db.prepare(`
          UPDATE conversation_messages
          SET services = ?
          WHERE id = ?
        `).run(JSON.stringify(services), lastMessage.id);
        
        console.log(`[ConversationService] Saved ${services.length} services to message ${lastMessage.id}`);
      } else {
        console.warn('[ConversationService] No assistant message found to attach services');
      }
    } catch (error) {
      console.error('[ConversationService] Error saving services:', error);
      // Don't throw - this is a non-critical operation
    }
  }
}
