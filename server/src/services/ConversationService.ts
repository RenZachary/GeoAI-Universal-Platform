/**
 * Conversation Service - Handles conversation and message persistence
 */

import type Database from 'better-sqlite3';

export interface ConversationSummary {
  id: string;
  title?: string;  // Add title field
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
      // Get conversation summaries with custom titles from conversations table
      const conversations = this.db.prepare(`
        SELECT 
          cm.conversation_id as id,
          MIN(cm.timestamp) as created_at,
          MAX(cm.timestamp) as updated_at,
          COUNT(*) as message_count,
          c.title as custom_title
        FROM conversation_messages cm
        LEFT JOIN conversations c ON cm.conversation_id = c.id
        GROUP BY cm.conversation_id
        ORDER BY updated_at DESC
      `).all() as Array<{ 
        id: string; 
        created_at: string; 
        updated_at: string; 
        message_count: number;
        custom_title: string | null;
      }>;

      // Enrich with titles - prefer custom title, fallback to first user message
      return conversations.map(conv => {
        let title = 'Untitled';
        
        // First, check if there's a custom title in the conversations table (non-empty)
        if (conv.custom_title && conv.custom_title.trim()) {
          title = conv.custom_title.trim();
        } else {
          // Fallback: Get the first user message as the title
          const firstUserMessage = this.db.prepare(`
            SELECT content
            FROM conversation_messages
            WHERE conversation_id = ? AND role = 'user'
            ORDER BY timestamp ASC
            LIMIT 1
          `).get(conv.id) as { content: string } | undefined;

          if (firstUserMessage && firstUserMessage.content) {
            // Use first 50 characters of the first user message as title
            const content = firstUserMessage.content.trim();
            title = content.length > 50 ? content.substring(0, 50) + '...' : content;
          }
        }

        return {
          ...conv,
          title
        };
      });
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
        SELECT id, role, content, timestamp, services
        FROM conversation_messages
        WHERE conversation_id = ?
        ORDER BY timestamp ASC
      `).all(conversationId) as Array<{ id: number; role: string; content: string; timestamp: string; services: string | null }>;

      // Deserialize services JSON and convert to frontend format
      return messages.map(msg => ({
        id: msg.id.toString(),  // Convert number to string for frontend compatibility
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
   * Rename a conversation
   */
  renameConversation(conversationId: string, newTitle: string): void {
    try {
      if (!newTitle || !newTitle.trim()) {
        throw new Error('Title cannot be empty');
      }

      // Check if conversation exists
      const conversation = this.db.prepare(`
        SELECT id FROM conversation_messages
        WHERE conversation_id = ?
        LIMIT 1
      `).get(conversationId);

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Update the title in the conversations table
      const result = this.db.prepare(`
        UPDATE conversations
        SET title = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(newTitle.trim(), conversationId);

      // If no rows were updated in conversations table, insert a new record
      if (result.changes === 0) {
        this.db.prepare(`
          INSERT INTO conversations (id, title, created_at, updated_at)
          VALUES (?, ?, datetime('now'), datetime('now'))
        `).run(conversationId, newTitle.trim());
      }

      console.log(`[ConversationService] Renamed conversation ${conversationId} to: ${newTitle}`);
    } catch (error) {
      console.error('[ConversationService] Error renaming conversation:', error);
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
