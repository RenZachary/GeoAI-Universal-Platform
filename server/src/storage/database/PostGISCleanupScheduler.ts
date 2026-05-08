/**
 * PostGIS Cleanup Scheduler - Manages automatic cleanup of temporary tables
 * Runs periodic cleanup jobs to prevent database bloat in the geoai_temp schema
 */

import type { Pool } from 'pg';
import { PostGISPoolManager } from '../../data-access';
import type { PostGISConnectionConfig } from '../../core';
import type Database from 'better-sqlite3';

export interface PostGISCleanupConfig {
  maxAge: number;        // Max age for temp tables in milliseconds (default: 24 hours)
  interval: number;      // Cleanup interval in milliseconds (default: 1 hour)
  enableAutoCleanup: boolean;    // Enable automatic cleanup (default: true)
}

export class PostGISCleanupScheduler {
  private config: PostGISCleanupConfig;
  private intervalId?: NodeJS.Timeout;
  private isRunning: boolean = false;
  private pool: Pool | null = null;
  private db?: Database.Database;  // Optional SQLite DB for cleaning up metadata records

  constructor(
    private connectionConfig: PostGISConnectionConfig,
    config?: Partial<PostGISCleanupConfig>,
    db?: Database.Database
  ) {
    this.db = db;
    this.config = {
      maxAge: 24 * 60 * 60 * 1000,           // 24 hours
      interval: 60 * 60 * 1000,              // 1 hour
      enableAutoCleanup: true,
      ...config
    };

    console.log('[PostGIS Cleanup Scheduler] Initialized with config:', {
      maxAge: this.formatDuration(this.config.maxAge),
      interval: this.formatDuration(this.config.interval),
      enableAutoCleanup: this.config.enableAutoCleanup
    });
  }

  /**
   * Start the automatic cleanup scheduler
   */
  async start(): Promise<void> {
    if (!this.config.enableAutoCleanup) {
      console.log('[PostGIS Cleanup Scheduler] Auto-cleanup is disabled');
      return;
    }

    if (this.intervalId) {
      console.warn('[PostGIS Cleanup Scheduler] Scheduler is already running');
      return;
    }

    // Get pool and ensure schema exists
    try {
      this.pool = await PostGISPoolManager.getInstance().getPool(this.connectionConfig);
    } catch (error) {
      console.error('[PostGIS Cleanup Scheduler] Failed to get DB pool:', error);
      return;
    }

    console.log(`[PostGIS Cleanup Scheduler] Starting automatic cleanup (interval: ${this.formatDuration(this.config.interval)})`);
    
    // Run initial cleanup immediately
    await this.executeCleanup();

    // Schedule periodic cleanup
    this.intervalId = setInterval(() => {
      this.executeCleanup().catch(error => {
        console.error('[PostGIS Cleanup Scheduler] Scheduled cleanup failed:', error);
      });
    }, this.config.interval);
  }

  /**
   * Stop the automatic cleanup scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      console.log('[PostGIS Cleanup Scheduler] Stopped');
    }
  }

  /**
   * Execute cleanup manually
   */
  async executeCleanup(): Promise<void> {
    if (this.isRunning || !this.pool) {
      return;
    }

    this.isRunning = true;
    console.log('[PostGIS Cleanup Scheduler] Starting cleanup job...');

    try {
      const cutoffTime = new Date(Date.now() - this.config.maxAge);
      
      // Find tables older than maxAge using pg_class modification time
      const result = await this.pool.query(`
        SELECT c.relname as tablename
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'geoai_temp'
        AND c.relkind = 'r'
        AND pg_stat_file(
          current_setting('data_directory') || '/' || 
          pg_relation_filepath(c.oid)
        ).modification < $1
      `, [cutoffTime.toISOString()]);

      let deletedCount = 0;
      for (const row of result.rows) {
        const tableName = row.tablename;
        try {
          await this.pool.query(`DROP TABLE IF EXISTS geoai_temp.${tableName} CASCADE`);
          deletedCount++;
          console.log(`[PostGIS Cleanup Scheduler] Deleted temp table: ${tableName}`);
          
          // Also remove the corresponding SQLite record if DB is available
          if (this.db) {
            this.cleanupSQLiteRecord(tableName);
          }
        } catch (error) {
          console.warn(`[PostGIS Cleanup Scheduler] Failed to delete table ${tableName}:`, error);
        }
      }

      console.log(`[PostGIS Cleanup Scheduler] Cleanup completed: ${deletedCount} tables deleted`);

    } catch (error) {
      console.error('[PostGIS Cleanup Scheduler] Cleanup failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Clean up SQLite metadata record for a deleted temp table
   */
  private cleanupSQLiteRecord(tableName: string): void {
    if (!this.db) return;
    
    try {
      // Find and delete the data source record that references this table
      const referencePattern = `%geoai_temp.${tableName}`;
      const stmt = this.db.prepare(`
        DELETE FROM data_sources 
        WHERE reference LIKE ? AND type = 'postgis'
      `);
      const result = stmt.run(referencePattern);
      
      if (result.changes > 0) {
        console.log(`[PostGIS Cleanup Scheduler] Removed ${result.changes} SQLite record(s) for table: ${tableName}`);
      }
    } catch (error) {
      console.warn(`[PostGIS Cleanup Scheduler] Failed to cleanup SQLite record for ${tableName}:`, error);
    }
  }

  /**
   * Format milliseconds to human-readable duration
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }
}
