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
        id TEXT PRIMARY KEY,
        service_type TEXT NOT NULL,
        url TEXT NOT NULL,
        data_source_id TEXT NOT NULL,
        metadata TEXT NOT NULL,
        ttl INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

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
