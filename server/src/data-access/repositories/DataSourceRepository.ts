/**
 * Data Source Repository
 * Manages data source metadata in SQLite database
 */

import type Database from 'better-sqlite3';
import type { DataSourceType, DataMetadata } from '../../core';
import { generateId } from '../../core';

export interface DataSourceRecord {
  id: string;
  name: string;
  type: DataSourceType;
  reference: string;
  metadata: DataMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export class DataSourceRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Get data source by ID
   */
  getById(id: string): DataSourceRecord | null {
    const row = this.db.prepare(`
      SELECT id, name, type, reference, metadata, created_at, updated_at
      FROM data_sources
      WHERE id = ?
    `).get(id) as any;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      type: row.type as DataSourceType,
      reference: row.reference,
      metadata: JSON.parse(row.metadata),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Create new data source record
   */
  create(name: string, type: DataSourceType, reference: string, metadata: Partial<DataMetadata> = {}): DataSourceRecord {
    const id = generateId();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO data_sources (id, name, type, reference, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name,
      type,
      reference,
      JSON.stringify(metadata),
      now,
      now
    );

    return {
      id,
      name,
      type,
      reference,
      metadata,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  /**
   * Update data source metadata
   */
  updateMetadata(id: string, metadata: Partial<DataMetadata>): void {
    const existing = this.getById(id);
    if (!existing) {
      throw new Error(`Data source not found: ${id}`);
    }

    const updatedMetadata = { ...existing.metadata, ...metadata };
    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE data_sources
      SET metadata = ?, updated_at = ?
      WHERE id = ?
    `).run(
      JSON.stringify(updatedMetadata),
      now,
      id
    );
  }

  /**
   * Delete data source record
   */
  delete(id: string): void {
    this.db.prepare('DELETE FROM data_sources WHERE id = ?').run(id);
  }

  /**
   * List all data sources
   */
  listAll(): DataSourceRecord[] {
    const rows = this.db.prepare(`
      SELECT id, name, type, reference, metadata, created_at, updated_at
      FROM data_sources
      ORDER BY created_at DESC
    `).all() as any[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type as DataSourceType,
      reference: row.reference,
      metadata: JSON.parse(row.metadata),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }

  /**
   * Search data sources by name
   */
  searchByName(query: string): DataSourceRecord[] {
    const rows = this.db.prepare(`
      SELECT id, name, type, reference, metadata, created_at, updated_at
      FROM data_sources
      WHERE name LIKE ?
      ORDER BY created_at DESC
    `).all(`%${query}%`) as any[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type as DataSourceType,
      reference: row.reference,
      metadata: JSON.parse(row.metadata),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }
}
