/**
 * SQLite Database Manager
 * Manages database initialization, migrations, and backup
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { DB_CONFIG } from '../../core';

class SQLiteManager {
  private static instance: SQLiteManager | null = null;
  static getInstance(): SQLiteManager {
    if (!SQLiteManager.instance) {
      SQLiteManager.instance = new SQLiteManager();
    }
    return SQLiteManager.instance;
  }
  private dbPath: string | undefined;
  private db: Database.Database | null = null;

  private constructor() {
  }
  init(databaseDir: string) {
    this.dbPath = path.join(databaseDir, DB_CONFIG.DATABASE_FILE);
  }

  /**
   * Initialize database connection and create tables
   */
  initialize(): void {
    console.log('Initializing SQLite database...');
    if (!this.dbPath) { console.warn('Database path not initialized. Please call init() first.'); return; }
    // Ensure database directory exists
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Connect to database
    this.db = new Database(this.dbPath);

    // Enable WAL mode for better performance
    this.db.pragma('journal_mode = WAL');

    // Ensure UTF-8 encoding for proper Chinese character support
    this.db.pragma('encoding = "UTF-8"');

    // Create tables
    this.createTables();

    console.log(`Database initialized at: ${this.dbPath}`);
  }

  /**
   * Create all required tables
   */
  private createTables(): void {
    if (!this.db) throw new Error('Database not initialized');

    // Data sources table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS data_sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        reference TEXT NOT NULL,
        metadata TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Plugins table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS plugins (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        input_schema TEXT NOT NULL,
        output_schema TEXT NOT NULL,
        capabilities TEXT NOT NULL,
        is_builtin INTEGER NOT NULL DEFAULT 0,
        implementation_path TEXT,
        installed_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Conversations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT 'anonymous',
        title TEXT NOT NULL DEFAULT 'Untitled Conversation',
        context TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Conversation messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        services TEXT,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      )
    `);

    // Analysis history table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS analysis_history (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        goal_id TEXT NOT NULL,
        execution_plan TEXT NOT NULL,
        results TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      )
    `);

    // Visualization services table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS visualization_services (
        service_id TEXT PRIMARY KEY,
        service_type TEXT NOT NULL,
        url TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        ttl INTEGER,
        last_accessed_at DATETIME,
        access_count INTEGER DEFAULT 0,
        metadata_json TEXT
      )
    `);

    // Migration: Check if old schema exists (with 'id' column) and recreate if needed
    try {
      const tableInfo = this.db.prepare("PRAGMA table_info(visualization_services)").all() as any[];
      const hasOldSchema = tableInfo.some(col => col.name === 'id' && !tableInfo.some(c => c.name === 'service_id'));
      
      if (hasOldSchema) {
        console.log('[SQLiteManager] Migrating visualization_services table to new schema...');
        this.db.exec('DROP TABLE IF EXISTS visualization_services');
        this.db.exec(`
          CREATE TABLE visualization_services (
            service_id TEXT PRIMARY KEY,
            service_type TEXT NOT NULL,
            url TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME,
            ttl INTEGER,
            last_accessed_at DATETIME,
            access_count INTEGER DEFAULT 0,
            metadata_json TEXT
          )
        `);
        console.log('[SQLiteManager] visualization_services table migrated successfully');
      }
    } catch (error) {
      console.warn('[SQLiteManager] Schema migration check failed:', error);
    }

    // Prompt templates table (for tracking, actual templates are files)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS prompt_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'en-US',
        category TEXT NOT NULL,
        file_path TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // ========================================================================
    // Knowledge Base Tables
    // ========================================================================

    // kb_documents: Registry of all uploaded documents
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kb_documents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('pdf', 'word', 'markdown')),
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL CHECK(file_size > 0),
        chunk_count INTEGER NOT NULL DEFAULT 0 CHECK(chunk_count >= 0),
        status TEXT NOT NULL DEFAULT 'processing' 
          CHECK(status IN ('processing', 'ready', 'error')),
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // kb_document_metadata: Flexible key-value metadata for documents
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kb_document_metadata (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        value TEXT,
        UNIQUE(document_id, key)
      )
    `);

    // kb_chunks: Track individual text chunks for debugging and rebuild
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kb_chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL CHECK(chunk_index >= 0),
        content_preview TEXT NOT NULL,
        vector_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Indexes for KB tables
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_docs_status ON kb_documents(status)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_docs_type ON kb_documents(type)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_docs_created ON kb_documents(created_at DESC)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_meta_doc ON kb_document_metadata(document_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_meta_key ON kb_document_metadata(key)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_chunks_doc ON kb_chunks(document_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_chunks_index ON kb_chunks(document_id, chunk_index)`);

    console.log('Database tables created');
  }

  /**
   * Get database instance
   */
  getDatabase(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Backup database
   */
  async backup(backupDir: string): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');

    // Ensure backup directory exists
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Generate backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilename = `${DB_CONFIG.BACKUP_PREFIX}${timestamp}.db`;
    const backupPath = path.join(backupDir, backupFilename);

    try {
      // Close current connection
      this.db.close();

      if (!this.dbPath) {
        console.warn('Database path not initialized. Please call init() first.');
        return '';
      }      // Copy database file
      fs.copyFileSync(this.dbPath, backupPath);

      // Reopen database
      this.db = new Database(this.dbPath);

      console.log(`Database backed up to: ${backupPath}`);
      return backupPath;
    } catch (error) {
      console.error('Database backup failed:', error);

      // Try to reopen database even if backup failed
      if (!this.db || !this.db.open) {
        this.db = new Database(this.dbPath);
      }

      throw error;
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('Database connection closed');
    }
  }
}
export const SQLiteManagerInstance = SQLiteManager.getInstance();
