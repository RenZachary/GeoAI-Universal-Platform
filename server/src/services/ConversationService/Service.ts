import type Database from 'better-sqlite3';
import { ConversationRepository } from './Repository';
import type { ConversationSummary, ChatMessage } from './types';

export class ConversationService {
  private repository: ConversationRepository;

  constructor(db: Database.Database) {
    this.repository = new ConversationRepository(db);
  }

  listConversations(): ConversationSummary[] {
    try {
      return this.repository.listConversations();
    } catch (error) {
      console.error('[ConversationService] Error listing conversations:', error);
      throw error;
    }
  }

  getConversation(conversationId: string): ChatMessage[] {
    try {
      return this.repository.getConversation(conversationId);
    } catch (error) {
      console.error('[ConversationService] Error getting conversation:', error);
      throw error;
    }
  }

  deleteConversation(conversationId: string): void {
    try {
      this.repository.deleteConversation(conversationId);
      console.log(`[ConversationService] Deleted conversation: ${conversationId}`);
    } catch (error) {
      console.error('[ConversationService] Error deleting conversation:', error);
      throw error;
    }
  }

  renameConversation(conversationId: string, newTitle: string): void {
    try {
      this.repository.renameConversation(conversationId, newTitle);
      console.log(`[ConversationService] Renamed conversation ${conversationId} to: ${newTitle}`);
    } catch (error) {
      console.error('[ConversationService] Error renaming conversation:', error);
      throw error;
    }
  }

  saveServicesToLastMessage(conversationId: string, services: any[]): void {
    try {
      this.repository.saveServicesToLastMessage(conversationId, services);
      
      if (services && services.length > 0) {
        console.log(`[ConversationService] Saved ${services.length} services`);
      }
    } catch (error) {
      console.error('[ConversationService] Error saving services:', error);
    }
  }
}
