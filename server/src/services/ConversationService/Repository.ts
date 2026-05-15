import type Database from 'better-sqlite3';
import type { ConversationSummary, ChatMessage } from './interface';
import { DEFAULT_CONVERSATION_TITLE } from './constant';
import { ConversationValidator } from './Validator';

export class ConversationRepository {
  private validator: ConversationValidator;

  constructor(private db: Database.Database) {
    this.validator = new ConversationValidator(db);
  }

  listConversations(): ConversationSummary[] {
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

    return conversations.map(conv => ({
      ...conv,
      title: this.resolveTitle(conv.id, conv.custom_title)
    }));
  }

  getConversation(conversationId: string): ChatMessage[] {
    const messages = this.db.prepare(`
      SELECT id, role, content, timestamp, services
      FROM conversation_messages
      WHERE conversation_id = ?
      ORDER BY timestamp ASC
    `).all(conversationId) as Array<{ 
      id: number; 
      role: string; 
      content: string; 
      timestamp: string; 
      services: string | null 
    }>;

    return messages.map(msg => ({
      id: msg.id.toString(),
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      services: msg.services ? JSON.parse(msg.services) : undefined
    }));
  }

  deleteConversation(conversationId: string): void {
    this.db.prepare(`
      DELETE FROM conversation_messages
      WHERE conversation_id = ?
    `).run(conversationId);
  }

  renameConversation(conversationId: string, newTitle: string): void {
    this.validator.validateTitle(newTitle);
    this.validator.validateConversationExists(conversationId);

    const result = this.db.prepare(`
      UPDATE conversations
      SET title = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(newTitle.trim(), conversationId);

    if (result.changes === 0) {
      this.db.prepare(`
        INSERT INTO conversations (id, title, created_at, updated_at)
        VALUES (?, ?, datetime('now'), datetime('now'))
      `).run(conversationId, newTitle.trim());
    }
  }

  saveServicesToLastMessage(conversationId: string, services: any[]): void {
    if (!services || services.length === 0) {
      return;
    }

    const lastMessage = this.db.prepare(`
      SELECT id FROM conversation_messages
      WHERE conversation_id = ? AND role = 'assistant'
      ORDER BY timestamp DESC
      LIMIT 1
    `).get(conversationId) as { id: number } | undefined;

    if (lastMessage) {
      this.db.prepare(`
        UPDATE conversation_messages
        SET services = ?
        WHERE id = ?
      `).run(JSON.stringify(services), lastMessage.id);
    }
  }

  private resolveTitle(conversationId: string, customTitle: string | null): string {
    if (customTitle && customTitle.trim()) {
      return customTitle.trim();
    }

    const firstUserMessage = this.db.prepare(`
      SELECT content
      FROM conversation_messages
      WHERE conversation_id = ? AND role = 'user'
      ORDER BY timestamp ASC
      LIMIT 1
    `).get(conversationId) as { content: string } | undefined;

    if (firstUserMessage && firstUserMessage.content) {
      return this.validator.truncateTitle(firstUserMessage.content);
    }

    return DEFAULT_CONVERSATION_TITLE;
  }
}
