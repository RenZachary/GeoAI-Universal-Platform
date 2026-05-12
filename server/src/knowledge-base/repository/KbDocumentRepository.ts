/**
 * Knowledge Base Document Repository
 * 
 * Handles all database operations for KB documents, metadata, and chunks.
 * Follows the repository pattern used throughout GeoAI-UP.
 */

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { 
  KbDocument, 
  KbDocumentMetadata, 
  KbChunk 
} from '../types';

export class KbDocumentRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  // ============================================================================
  // Document Operations
  // ============================================================================

  /**
   * Create a new document record
   */
  create(
    name: string,
    type: 'pdf' | 'word' | 'markdown',
    filePath: string,
    fileSize: number
  ): KbDocument {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO kb_documents (id, name, type, file_path, file_size, chunk_count, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, 'processing', ?, ?)
    `);

    stmt.run(id, name, type, filePath, fileSize, now, now);

    return {
      id,
      name,
      type,
      filePath,
      fileSize,
      chunkCount: 0,
      status: 'processing',
      createdAt: new Date(now),
      updatedAt: new Date(now)
    };
  }

  /**
   * Get document by ID
   */
  getById(id: string): KbDocument | null {
    const stmt = this.db.prepare('SELECT * FROM kb_documents WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return this.mapRowToDocument(row);
  }

  /**
   * List all documents with optional filtering
   */
  list(options?: {
    status?: string;
    type?: string;
    limit?: number;
    offset?: number;
  }): KbDocument[] {
    let query = 'SELECT * FROM kb_documents';
    const conditions: string[] = [];
    const params: any[] = [];

    if (options?.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    if (options?.type) {
      conditions.push('type = ?');
      params.push(options.type);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => this.mapRowToDocument(row));
  }

  /**
   * Update document status
   */
  updateStatus(id: string, status: 'processing' | 'ready' | 'error', errorMessage?: string): void {
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      UPDATE kb_documents 
      SET status = ?, error_message = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(status, errorMessage || null, now, id);
  }

  /**
   * Update chunk count
   */
  updateChunkCount(id: string, chunkCount: number): void {
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      UPDATE kb_documents 
      SET chunk_count = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(chunkCount, now, id);
  }

  /**
   * Delete document (cascades to metadata and chunks)
   */
  delete(id: string): void {
    const stmt = this.db.prepare('DELETE FROM kb_documents WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Get document count
   */
  count(options?: { status?: string; type?: string }): number {
    let query = 'SELECT COUNT(*) as count FROM kb_documents';
    const conditions: string[] = [];
    const params: any[] = [];

    if (options?.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    if (options?.type) {
      conditions.push('type = ?');
      params.push(options.type);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    const stmt = this.db.prepare(query);
    const result = stmt.get(...params) as any;

    return result.count;
  }

  // ============================================================================
  // Metadata Operations
  // ============================================================================

  /**
   * Add or update document metadata
   */
  setMetadata(documentId: string, key: string, value: any): void {
    const id = uuidv4();
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO kb_document_metadata (id, document_id, key, value)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(id, documentId, key, valueStr);
  }

  /**
   * Get all metadata for a document
   */
  getMetadata(documentId: string): Record<string, any> {
    const stmt = this.db.prepare('SELECT key, value FROM kb_document_metadata WHERE document_id = ?');
    const rows = stmt.all(documentId) as any[];

    const metadata: Record<string, any> = {};
    for (const row of rows) {
      try {
        metadata[row.key] = JSON.parse(row.value);
      } catch {
        metadata[row.key] = row.value;
      }
    }

    return metadata;
  }

  /**
   * Get specific metadata value
   */
  getMetadataValue(documentId: string, key: string): any {
    const stmt = this.db.prepare('SELECT value FROM kb_document_metadata WHERE document_id = ? AND key = ?');
    const row = stmt.get(documentId, key) as any;

    if (!row) return undefined;

    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  }

  /**
   * Delete specific metadata
   */
  deleteMetadata(documentId: string, key: string): void {
    const stmt = this.db.prepare('DELETE FROM kb_document_metadata WHERE document_id = ? AND key = ?');
    stmt.run(documentId, key);
  }

  // ============================================================================
  // Chunk Operations
  // ============================================================================

  /**
   * Create a chunk record
   */
  createChunk(
    documentId: string,
    chunkIndex: number,
    contentPreview: string,
    vectorId: string
  ): KbChunk {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO kb_chunks (id, document_id, chunk_index, content_preview, vector_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, documentId, chunkIndex, contentPreview, vectorId, now);

    return {
      id,
      documentId,
      chunkIndex,
      contentPreview,
      vectorId,
      createdAt: new Date(now)
    };
  }

  /**
   * Batch create chunks
   */
  createChunks(chunks: Array<{
    documentId: string;
    chunkIndex: number;
    contentPreview: string;
    vectorId: string;
  }>): void {
    const insertStmt = this.db.prepare(`
      INSERT INTO kb_chunks (id, document_id, chunk_index, content_preview, vector_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((chunkData) => {
      for (const data of chunkData) {
        const id = uuidv4();
        const now = new Date().toISOString();
        insertStmt.run(id, data.documentId, data.chunkIndex, data.contentPreview, data.vectorId, now);
      }
    });

    transaction(chunks);
  }

  /**
   * Get all chunks for a document
   */
  getChunksByDocument(documentId: string): KbChunk[] {
    const stmt = this.db.prepare(`
      SELECT * FROM kb_chunks 
      WHERE document_id = ? 
      ORDER BY chunk_index ASC
    `);

    const rows = stmt.all(documentId) as any[];

    return rows.map(row => ({
      id: row.id,
      documentId: row.document_id,
      chunkIndex: row.chunk_index,
      contentPreview: row.content_preview,
      vectorId: row.vector_id,
      createdAt: new Date(row.created_at)
    }));
  }

  /**
   * Delete all chunks for a document
   */
  deleteChunksByDocument(documentId: string): void {
    const stmt = this.db.prepare('DELETE FROM kb_chunks WHERE document_id = ?');
    stmt.run(documentId);
  }

  /**
   * Get total chunk count across all documents
   */
  getTotalChunkCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM kb_chunks');
    const result = stmt.get() as any;
    return result.count;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Map database row to KbDocument object
   */
  private mapRowToDocument(row: any): KbDocument {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      filePath: row.file_path,
      fileSize: row.file_size,
      chunkCount: row.chunk_count,
      status: row.status,
      errorMessage: row.error_message || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}
