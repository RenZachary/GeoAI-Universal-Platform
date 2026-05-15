import type Database from 'better-sqlite3';
import { ValidationError, NotFoundError } from './errors';
import { TITLE_MAX_LENGTH } from './constant';

export class ConversationValidator {
  constructor(private db: Database.Database) {}

  validateTitle(title: string): void {
    if (!title || !title.trim()) {
      throw new ValidationError('Title cannot be empty');
    }
  }

  validateConversationExists(conversationId: string): void {
    const conversation = this.db.prepare(`
      SELECT id FROM conversation_messages
      WHERE conversation_id = ?
      LIMIT 1
    `).get(conversationId);

    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }
  }

  truncateTitle(content: string): string {
    const trimmed = content.trim();
    return trimmed.length > TITLE_MAX_LENGTH 
      ? trimmed.substring(0, TITLE_MAX_LENGTH) + '...' 
      : trimmed;
  }
}
