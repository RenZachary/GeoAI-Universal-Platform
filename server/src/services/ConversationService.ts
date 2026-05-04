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
        SELECT role, content, timestamp
        FROM conversation_messages
        WHERE conversation_id = ?
        ORDER BY timestamp ASC
      `).all(conversationId) as ChatMessage[];

      return messages;
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
}
