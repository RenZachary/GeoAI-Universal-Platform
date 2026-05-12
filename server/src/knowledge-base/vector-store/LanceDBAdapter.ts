/**
 * LanceDB Adapter for Knowledge Base Vector Storage
 * 
 * Provides interface to LanceDB vector database for storing and retrieving
 * document embeddings. Handles table management, document operations,
 * and similarity search.
 * 
 * LanceDB advantages:
 * - Native Node.js support (no server required)
 * - Local file-based persistent storage
 * - High performance with disk-based indexing
 * - Automatic schema management
 */

import lancedb from '@lancedb/lancedb';
import type { Table, Connection } from '@lancedb/lancedb';
import { KB_CONFIG } from '../config';
import type { RetrievedDocument } from '../types';
import { wrapError } from '../../core';
import fs from 'fs';

export class LanceDBAdapter {
  private connection: Connection | null = null;
  private table: Table | null = null;
  private initialized = false;
  private dbPath: string;

  /**
   * Create LanceDB adapter instance
   * @param dbPath - Path to LanceDB storage directory
   */
  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  /**
   * Initialize LanceDB connection and create/get table
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[LanceDBAdapter] Already initialized');
      return;
    }

    try {
      console.log(`[LanceDBAdapter] Initializing at: ${this.dbPath}`);

      // Ensure directory exists
      if (!fs.existsSync(this.dbPath)) {
        fs.mkdirSync(this.dbPath, { recursive: true });
      }

      // Connect to LanceDB (local file mode)
      this.connection = await lancedb.connect(this.dbPath);

      // Check if table exists
      const tableNames = await this.connection.tableNames();
      
      let needsRecreation = false;
      
      if (tableNames.includes(KB_CONFIG.COLLECTION_NAME)) {
        // Open existing table and check schema
        const existingTable = await this.connection.openTable(KB_CONFIG.COLLECTION_NAME);
        
        // Check if schema has required fields (simple check: try to query)
        try {
          // Try a simple query to see if new fields exist
          const testQuery = await existingTable.query().limit(1).toArray();
          if (testQuery.length > 0) {
            const firstRow = testQuery[0] as any;
            // Check if new fields are missing
            if (!('totalChunks' in firstRow) || !('pageNumber' in firstRow) || !('section' in firstRow)) {
              console.log('[LanceDBAdapter] Detected old schema, will recreate table with new schema');
              needsRecreation = true;
              
              // Drop old table
              await this.connection.dropTable(KB_CONFIG.COLLECTION_NAME);
              console.log('[LanceDBAdapter] Dropped old table');
            } else {
              // Schema is up to date
              this.table = existingTable;
              console.log(`[LanceDBAdapter] Opened existing table '${KB_CONFIG.COLLECTION_NAME}'`);
            }
          } else {
            // Empty table, just use it
            this.table = existingTable;
            console.log(`[LanceDBAdapter] Opened existing table '${KB_CONFIG.COLLECTION_NAME}'`);
          }
        } catch (schemaError) {
          console.warn('[LanceDBAdapter] Schema check failed, recreating table:', schemaError instanceof Error ? schemaError.message : String(schemaError));
          needsRecreation = true;
          await this.connection.dropTable(KB_CONFIG.COLLECTION_NAME);
        }
      }
      
      if (needsRecreation || !tableNames.includes(KB_CONFIG.COLLECTION_NAME)) {
        // Create new table with schema
        // Schema includes all possible metadata fields for flexibility
        // Note: Use proper default values so LanceDB can infer types
        const emptyData = [
          {
            id: '',
            text: '',
            embedding: new Array(KB_CONFIG.EMBEDDING_DIMENSIONS).fill(0),
            documentId: '',
            chunkIndex: 0,
            documentName: '',
            documentType: '',
            totalChunks: 0,
            pageNumber: -1,  // Use -1 instead of null (LanceDB needs numeric default)
            section: '',
            createdAt: ''
          }
        ];

        this.table = await this.connection.createTable(
          KB_CONFIG.COLLECTION_NAME,
          emptyData,
          {
            mode: 'create'
          }
        );

        // Remove the dummy row
        await this.table.delete("id = ''");
        
        console.log(`[LanceDBAdapter] Created new table '${KB_CONFIG.COLLECTION_NAME}'`);
      }

      this.initialized = true;
      console.log('[LanceDBAdapter] Ready');

    } catch (error) {
      console.error('[LanceDBAdapter] Initialization failed:', error);
      throw wrapError(error, 'Failed to initialize LanceDB');
    }
  }

  /**
   * Ensure adapter is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.table) {
      throw new Error('LanceDBAdapter not initialized. Call initialize() first.');
    }
  }

  // ============================================================================
  // Document Operations
  // ============================================================================

  /**
   * Add documents with embeddings to LanceDB
   * 
   * @param documents - Array of documents with embeddings
   * @returns Number of documents added
   */
  async addDocuments(documents: Array<{
    id: string;
    text: string;
    embedding: number[];
    metadata?: {
      documentId?: string;
      chunkIndex?: number;
      documentName?: string;
      documentType?: string;
      createdAt?: string;
      [key: string]: any;
    };
  }>): Promise<number> {
    this.ensureInitialized();

    if (documents.length === 0) {
      return 0;
    }

    try {
      // Prepare data for LanceDB - ensure all schema fields are present
      const data = documents.map(doc => ({
        id: doc.id,
        text: doc.text,
        embedding: doc.embedding,
        documentId: doc.metadata?.documentId || '',
        chunkIndex: doc.metadata?.chunkIndex || 0,
        documentName: doc.metadata?.documentName || '',
        documentType: doc.metadata?.documentType || '',
        totalChunks: doc.metadata?.totalChunks || 0,
        pageNumber: doc.metadata?.pageNumber ?? -1,  // Use -1 for missing page numbers
        section: doc.metadata?.section || '',
        createdAt: doc.metadata?.createdAt || new Date().toISOString()
        // Note: Additional metadata fields beyond schema will be rejected by LanceDB
      }));

      // Add to table
      await this.table!.add(data);

      console.log(`[LanceDBAdapter] Added ${documents.length} documents`);
      return documents.length;

    } catch (error) {
      console.error('[LanceDBAdapter] Failed to add documents:', error);
      throw wrapError(error, 'Failed to add documents to LanceDB');
    }
  }

  /**
   * Search for similar documents using vector similarity
   * 
   * @param queryEmbedding - Query embedding vector
   * @param topK - Number of results to return
   * @param filter - Optional metadata filter (Record or SQL string)
   * @returns Array of retrieved documents with scores
   */
  async search(
    queryEmbedding: number[],
    topK: number = 5,
    filter?: Record<string, any> | string
  ): Promise<RetrievedDocument[]> {
    this.ensureInitialized();

    try {
      let query = this.table!
        .search(queryEmbedding)
        .limit(topK)
        .select(['id', 'text', 'embedding', 'documentId', 'chunkIndex', 'documentName', 'documentType', 'createdAt']);

      // Apply filter if provided
      if (filter) {
        // Convert Record to SQL WHERE clause if needed
        let whereClause: string;
        if (typeof filter === 'string') {
          whereClause = filter;
        } else {
          // Build WHERE clause from Record
          const conditions = Object.entries(filter)
            .map(([key, value]) => {
              if (typeof value === 'string') {
                return `${key} = '${value}'`;
              } else {
                return `${key} = ${value}`;
              }
            })
            .join(' AND ');
          whereClause = conditions;
        }
        query = query.where(whereClause);
      }

      const results = await query.toArray();

      // Convert to RetrievedDocument format
      return results.map((row: any) => {
        // LanceDB returns Euclidean distance. Convert to similarity score in [0, 1].
        // Using cosine similarity approximation: score = 1 / (1 + distance)
        // This ensures score is always in (0, 1] regardless of distance magnitude
        const distance = row._distance || 0;
        const score = 1 / (1 + distance);
        
        return {
          content: row.text,
          documentId: row.documentId,
          score,
          metadata: {
            documentName: row.documentName,
            chunkIndex: row.chunkIndex,
            pageNumber: row.pageNumber && row.pageNumber !== -1 ? row.pageNumber : undefined,
            location: undefined
          }
        };
      });

    } catch (error) {
      console.error('[LanceDBAdapter] Search failed:', error);
      throw wrapError(error, 'Failed to search in LanceDB');
    }
  }

  /**
   * Multi-query search: search with multiple embeddings and merge results
   * 
   * @param embeddings - Array of query embeddings
   * @param topK - Number of results per query
   * @returns Deduplicated and ranked results
   */
  async multiQuerySearch(
    embeddings: number[][],
    topK: number = 5
  ): Promise<RetrievedDocument[]> {
    this.ensureInitialized();

    if (embeddings.length === 0) {
      return [];
    }

    try {
      // Search with each embedding
      const allResults: RetrievedDocument[] = [];
      
      for (const embedding of embeddings) {
        const results = await this.search(embedding, topK);
        allResults.push(...results);
      }

      // Deduplicate by document ID and keep highest score
      const uniqueMap = new Map<string, RetrievedDocument>();
      for (const result of allResults) {
        const key = `${result.documentId}_${result.metadata.chunkIndex}`;
        const existing = uniqueMap.get(key);
        
        if (!existing || result.score > existing.score) {
          uniqueMap.set(key, result);
        }
      }

      // Sort by score descending
      const dedupedResults = Array.from(uniqueMap.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, topK * embeddings.length); // Limit total results

      console.log(`[LanceDBAdapter] Multi-query search: ${allResults.length} -> ${dedupedResults.length} (deduped)`);
      return dedupedResults;

    } catch (error) {
      console.error('[LanceDBAdapter] Multi-query search failed:', error);
      throw wrapError(error, 'Failed to perform multi-query search');
    }
  }

  /**
   * Delete documents by ID
   * 
   * @param ids - Array of document IDs to delete
   * @returns Number of documents deleted
   */
  async deleteDocuments(ids: string[]): Promise<number> {
    this.ensureInitialized();

    if (ids.length === 0) {
      return 0;
    }

    try {
      // Build filter condition
      const conditions = ids.map(id => `id = '${id}'`).join(' OR ');
      
      await this.table!.delete(conditions);

      console.log(`[LanceDBAdapter] Deleted ${ids.length} documents`);
      return ids.length;

    } catch (error) {
      console.error('[LanceDBAdapter] Failed to delete documents:', error);
      throw wrapError(error, 'Failed to delete documents from LanceDB');
    }
  }

  /**
   * Delete documents by documentId (metadata field)
   * 
   * @param documentId - The document ID to delete all chunks for
   * @returns Number of chunks deleted
   */
  async deleteByDocumentId(documentId: string): Promise<number> {
    this.ensureInitialized();

    try {
      await this.table!.delete(`documentId = '${documentId}'`);
      console.log(`[LanceDBAdapter] Deleted all chunks for document ${documentId}`);
      
      // Note: LanceDB uses append-only storage. Deleted data is marked but not immediately removed.
      // To reclaim disk space, run compaction periodically or use clear() to drop the entire table.
      
      return 1; // Return success

    } catch (error) {
      console.error('[LanceDBAdapter] Failed to delete by documentId:', error);
      throw wrapError(error, 'Failed to delete documents by documentId');
    }
  }

  /**
   * Get document count
   * 
   * @returns Total number of documents in the collection
   */
  async count(): Promise<number> {
    this.ensureInitialized();

    try {
      const result = await this.table!.countRows();
      return result;

    } catch (error) {
      console.error('[LanceDBAdapter] Failed to get count:', error);
      throw wrapError(error, 'Failed to get document count');
    }
  }

  /**
   * Clear all documents from the collection
   */
  async clear(): Promise<void> {
    this.ensureInitialized();

    try {
      // Drop and recreate table
      await this.connection!.dropTable(KB_CONFIG.COLLECTION_NAME);
      
      // Recreate empty table
      const emptyData = [
        {
          id: '',
          text: '',
          embedding: new Array(KB_CONFIG.EMBEDDING_DIMENSIONS).fill(0),
          documentId: '',
          chunkIndex: 0,
          documentName: '',
          documentType: '',
          createdAt: ''
        }
      ];

      this.table = await this.connection!.createTable(
        KB_CONFIG.COLLECTION_NAME,
        emptyData,
        { mode: 'create' }
      );

      // Remove dummy row
      await this.table.delete("id = ''");

      console.log('[LanceDBAdapter] Collection cleared');

    } catch (error) {
      console.error('[LanceDBAdapter] Failed to clear collection:', error);
      throw wrapError(error, 'Failed to clear collection');
    }
  }

  /**
   * Get collection statistics
   */
  async getStats(): Promise<{
    name: string;
    count: number;
  }> {
    this.ensureInitialized();

    const count = await this.count();

    return {
      name: KB_CONFIG.COLLECTION_NAME,
      count
    };
  }
}
