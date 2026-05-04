/**
 * Conversation Memory Manager - Manages multi-turn dialogue context using LangChain Memory
 */

import { BaseChatMessageHistory } from '@langchain/core/chat_history';
import type { InputValues, OutputValues, MemoryVariables } from '@langchain/core/memory';
import { BaseMemory } from '@langchain/core/memory';
import type { BaseMessage} from '@langchain/core/messages';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import type Database from 'better-sqlite3';

/**
 * SQLite-based chat message history implementing LangChain's BaseChatMessageHistory
 */
export class SQLiteMessageHistory extends BaseChatMessageHistory {
  lc_namespace = ['geoai-up', 'memory'];
  
  private conversationId: string;
  private db: Database.Database;

  constructor(conversationId: string, db: Database.Database) {
    super();
    this.conversationId = conversationId;
    this.db = db;
  }

  /**
   * Get all messages from SQLite database
   */
  async getMessages(): Promise<BaseMessage[]> {
    const rows = this.db.prepare(`
      SELECT role, content, timestamp 
      FROM conversation_messages 
      WHERE conversation_id = ? 
      ORDER BY timestamp ASC
    `).all(this.conversationId) as Array<{ role: string; content: string; timestamp: string }>;

    return rows.map(row => {
      if (row.role === 'user') {
        return new HumanMessage({ content: row.content });
      } else {
        return new AIMessage({ content: row.content });
      }
    });
  }

  /**
   * Add a message to SQLite database
   */
  async addMessage(message: BaseMessage): Promise<void> {
    const role = message._getType() === 'human' ? 'user' : 'assistant';

    this.db.prepare(`
      INSERT INTO conversation_messages (conversation_id, role, content, timestamp)
      VALUES (?, ?, ?, datetime('now'))
    `).run(this.conversationId, role, message.content);
  }

  /**
   * Add user message (convenience method)
   */
  async addUserMessage(message: string): Promise<void> {
    await this.addMessage(new HumanMessage({ content: message }));
  }

  /**
   * Add AI message (convenience method)
   */
  async addAIMessage(message: string): Promise<void> {
    await this.addMessage(new AIMessage({ content: message }));
  }

  /**
   * Clear all messages for this conversation
   */
  async clear(): Promise<void> {
    this.db.prepare(`
      DELETE FROM conversation_messages 
      WHERE conversation_id = ?
    `).run(this.conversationId);
  }
}

/**
 * Conversation Buffer Memory with SQLite persistence
 * Extends LangChain's BaseMemory for seamless integration with chains and agents
 */
export class ConversationBufferMemoryWithSQLite extends BaseMemory {
  private history: SQLiteMessageHistory;
  private memoryKey: string = 'history';
  private inputKey?: string;
  private outputKey?: string;

  constructor(conversationId: string, db: Database.Database, options?: {
    memoryKey?: string;
    inputKey?: string;
    outputKey?: string;
  }) {
    super();
    this.history = new SQLiteMessageHistory(conversationId, db);
    this.memoryKey = options?.memoryKey || this.memoryKey;
    this.inputKey = options?.inputKey;
    this.outputKey = options?.outputKey;
  }

  /**
   * Return keys this memory class will load dynamically
   */
  get memoryKeys(): string[] {
    return [this.memoryKey];
  }

  /**
   * Load memory variables from SQLite
   */
  async loadMemoryVariables(values: InputValues): Promise<MemoryVariables> {
    const messages = await this.history.getMessages();
    return { [this.memoryKey]: messages };
  }

  /**
   * Save context to SQLite after chain execution
   */
  async saveContext(inputValues: InputValues, outputValues: OutputValues): Promise<void> {
    // Get input text
    const inputKey = this.inputKey || Object.keys(inputValues)[0];
    const outputKey = this.outputKey || Object.keys(outputValues)[0];
    
    const inputText = inputValues[inputKey];
    const outputText = outputValues[outputKey];

    if (!inputText || !outputText) {
      console.warn('No input or output text to save');
      return;
    }

    // Add messages to history
    await this.history.addUserMessage(inputText);
    await this.history.addAIMessage(outputText);
  }

  /**
   * Clear memory
   */
  async clear(): Promise<void> {
    await this.history.clear();
  }

  /**
   * Get the underlying message history
   */
  getMessageHistory(): SQLiteMessageHistory {
    return this.history;
  }
}
