/**
 * PostGIS Pool Manager - Centralized connection pool management
 * 
 * Manages multiple PostGIS connection pools based on connection configuration.
 * Uses host:port:database as key to ensure same database shares the same pool.
 */

import { Pool, type PoolConfig } from 'pg';
import { wrapError } from '../../core';
import type { PostGISConnectionConfig } from '../../core';

export class PostGISPoolManager {
  private static instance: PostGISPoolManager;
  private pools: Map<string, Pool> = new Map();

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): PostGISPoolManager {
    if (!PostGISPoolManager.instance) {
      PostGISPoolManager.instance = new PostGISPoolManager();
    }
    return PostGISPoolManager.instance;
  }

  /**
   * Generate connection key from config
   * Format: host:port:database
   */
  private getConnectionKey(config: PostGISConnectionConfig): string {
    return `${config.host}:${config.port || 5432}:${config.database}`;
  }

  /**
   * Get or create connection pool for given config
   * Same connection config will reuse existing pool
   */
  async getPool(config: PostGISConnectionConfig): Promise<Pool> {
    const key = this.getConnectionKey(config);
    
    // Return existing pool if available
    if (this.pools.has(key)) {
      console.log(`[PostGISPoolManager] Reusing existing pool for: ${key}`);
      return this.pools.get(key)!;
    }

    console.log(`[PostGISPoolManager] Creating new pool for: ${key}`);

    // Create new pool
    const poolConfig: PoolConfig = {
      host: config.host,
      port: config.port || 5432,
      database: config.database,
      user: config.user,
      password: config.password,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

    const pool = new Pool(poolConfig);

    // Test connection and ensure temp schema exists
    try {
      await pool.query('SELECT 1');
      await this.ensureTempSchema(pool);
      this.pools.set(key, pool);
      console.log(`[PostGISPoolManager] Pool created successfully for: ${key}`);
      return pool;
    } catch (error) {
      await pool.end(); // Clean up failed pool
      throw wrapError(error, `Failed to connect to PostGIS (${key})`);
    }
  }

  /**
   * Ensure the geoai_temp schema exists in the database
   */
  private async ensureTempSchema(pool: Pool): Promise<void> {
    try {
      await pool.query('CREATE SCHEMA IF NOT EXISTS geoai_temp;');
      console.log('[PostGISPoolManager] Ensured geoai_temp schema exists');
    } catch (error) {
      console.warn('[PostGISPoolManager] Failed to create geoai_temp schema:', error);
    }
  }

  /**
   * Close specific pool by config
   */
  async closePool(config: PostGISConnectionConfig): Promise<void> {
    const key = this.getConnectionKey(config);
    const pool = this.pools.get(key);
    
    if (pool) {
      await pool.end();
      this.pools.delete(key);
      console.log(`[PostGISPoolManager] Pool closed for: ${key}`);
    }
  }

  /**
   * Close all pools
   */
  async closeAll(): Promise<void> {
    console.log(`[PostGISPoolManager] Closing all pools (${this.pools.size} total)`);
    
    const closePromises = Array.from(this.pools.entries()).map(async ([key, pool]) => {
      await pool.end();
      console.log(`[PostGISPoolManager] Pool closed: ${key}`);
    });

    await Promise.all(closePromises);
    this.pools.clear();
  }

  /**
   * Get pool count (for monitoring)
   */
  getPoolCount(): number {
    return this.pools.size;
  }

  /**
   * Reset instance (for testing)
   */
  static async resetInstance(): Promise<void> {
    if (PostGISPoolManager.instance) {
      await PostGISPoolManager.instance.closeAll();
    }
    PostGISPoolManager.instance = null as any;
  }
}
