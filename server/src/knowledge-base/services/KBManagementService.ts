/**
 * Knowledge Base Management Service
 * 
 * Provides CRUD operations for managing documents in the knowledge base.
 * Handles document listing, status updates, deletion, and statistics.
 */

import fs from 'fs/promises';
import { KbDocumentRepository } from '../repository/KbDocumentRepository';
import { LanceDBAdapter } from '../vector-store/LanceDBAdapter';
import type { KbDocument } from '../types';
import { wrapError } from '../../core';

export interface DocumentListOptions {
  page?: number;
  pageSize?: number;
  status?: 'processing' | 'ready' | 'error';
  type?: 'pdf' | 'word' | 'markdown';
  sortBy?: 'createdAt' | 'updatedAt' | 'name';
  sortOrder?: 'asc' | 'desc';
}

export interface DocumentListResult {
  documents: KbDocument[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface KBStatistics {
  totalDocuments: number;
  documentsByStatus: {
    processing: number;
    ready: number;
    error: number;
  };
  documentsByType: {
    pdf: number;
    word: number;
    markdown: number;
  };
  totalChunks: number;
  storageUsage: number; // bytes
}

export class KBManagementService {
  private repository: KbDocumentRepository;
  private vectorStore: LanceDBAdapter;

  constructor(options: {
    dbPath: string;
    db: any; // better-sqlite3 Database instance
  }) {
    this.repository = new KbDocumentRepository(options.db);
    this.vectorStore = new LanceDBAdapter(options.dbPath);
    
    // Auto-initialize LanceDB
    void this.initialize();
  }

  /**
   * Initialize the management service
   */
  async initialize(): Promise<void> {
    console.log('[KBManagementService] Initializing...');
    await this.vectorStore.initialize();
    console.log('[KBManagementService] Ready');
  }

  /**
   * List documents with pagination and filtering
   * 
   * @param options - List options (pagination, filters, sorting)
   * @returns Paginated document list
   */
  listDocuments(options?: DocumentListOptions): DocumentListResult {
    try {
      const page = options?.page || 1;
      const pageSize = options?.pageSize || 20;
      const offset = (page - 1) * pageSize;

      // Get all documents (filtering will be applied in memory for now)
      const allDocs = this.repository.list();

      // Apply filters
      let filteredDocs: KbDocument[] = [...allDocs];

      if (options?.status) {
        filteredDocs = filteredDocs.filter((doc: KbDocument) => doc.status === options.status);
      }

      if (options?.type) {
        filteredDocs = filteredDocs.filter((doc: KbDocument) => doc.type === options.type);
      }

      // Apply sorting
      const sortBy = options?.sortBy || 'createdAt';
      const sortOrder = options?.sortOrder || 'desc';

      filteredDocs.sort((a: KbDocument, b: KbDocument) => {
        switch (sortBy) {
          case 'name':
            return sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
          case 'updatedAt':
            return sortOrder === 'asc' 
              ? a.updatedAt.getTime() - b.updatedAt.getTime()
              : b.updatedAt.getTime() - a.updatedAt.getTime();
          case 'createdAt':
          default:
            return sortOrder === 'asc'
              ? a.createdAt.getTime() - b.createdAt.getTime()
              : b.createdAt.getTime() - a.createdAt.getTime();
        }
      });

      // Calculate pagination
      const total = filteredDocs.length;
      const totalPages = Math.ceil(total / pageSize);

      // Apply pagination
      const paginatedDocs = filteredDocs.slice(offset, offset + pageSize);

      return {
        documents: paginatedDocs,
        total,
        page,
        pageSize,
        totalPages
      };

    } catch (error) {
      throw wrapError(error, 'Failed to list documents');
    }
  }

  /**
   * Get a single document by ID
   * 
   * @param documentId - Document UUID
   * @returns Document details or null if not found
   */
  getDocument(documentId: string): KbDocument | null {
    try {
      return this.repository.getById(documentId);
    } catch (error) {
      throw wrapError(error, `Failed to get document ${documentId}`);
    }
  }

  /**
   * Get document metadata
   * 
   * @param documentId - Document UUID
   * @returns Metadata key-value pairs
   */
  getDocumentMetadata(documentId: string): Record<string, any> {
    try {
      return this.repository.getMetadata(documentId);
    } catch (error) {
      throw wrapError(error, `Failed to get metadata for document ${documentId}`);
    }
  }

  /**
   * Update document status
   * 
   * @param documentId - Document UUID
   * @param status - New status
   * @returns Updated document
   */
  updateDocumentStatus(
    documentId: string,
    status: 'processing' | 'ready' | 'error'
  ): KbDocument {
    try {
      this.repository.updateStatus(documentId, status);
      const doc = this.repository.getById(documentId);
      
      if (!doc) {
        throw new Error(`Document ${documentId} not found`);
      }

      return doc;
    } catch (error) {
      throw wrapError(error, `Failed to update document status`);
    }
  }

  /**
   * Delete a document and all associated data
   * 
   * @param documentId - Document UUID
   * @returns true if deleted successfully
   */
  async deleteDocument(documentId: string): Promise<boolean> {
    try {
      console.log(`[KBManagementService] Deleting document: ${documentId}`);

      // Step 1: Get document info
      const doc = this.repository.getById(documentId);
      if (!doc) {
        console.warn(`[KBManagementService] Document not found: ${documentId}`);
        return false;
      }

      // Step 2: Delete from LanceDB (all chunks)
      console.log('[KBManagementService] Removing from vector store...');
      await this.vectorStore.deleteByDocumentId(documentId);
      console.log(`[KBManagementService] Removed chunks from LanceDB`);

      // Step 3: Delete physical file
      console.log(`[KBManagementService] Deleting physical file: ${doc.filePath}`);
      try {
        await fs.unlink(doc.filePath);
        console.log(`[KBManagementService] Physical file deleted`);
      } catch (fileError) {
        console.warn(`[KBManagementService] Failed to delete physical file:`, fileError instanceof Error ? fileError.message : fileError);
        // Continue with database deletion even if file deletion fails
      }

      // Step 4: Delete from SQLite (cascades to metadata and chunks)
      console.log('[KBManagementService] Removing from database...');
      this.repository.delete(documentId);
      console.log('[KBManagementService] Document deleted from database');

      return true;

    } catch (error) {
      throw wrapError(error, `Failed to delete document ${documentId}`);
    }
  }

  /**
   * Delete multiple documents
   * 
   * @param documentIds - Array of document UUIDs
   * @returns Number of successfully deleted documents
   */
  async deleteDocuments(documentIds: string[]): Promise<number> {
    let deletedCount = 0;

    for (const docId of documentIds) {
      try {
        const success = await this.deleteDocument(docId);
        if (success) {
          deletedCount++;
        }
      } catch (error) {
        console.error(`[KBManagementService] Failed to delete ${docId}:`, error);
      }
    }

    return deletedCount;
  }

  /**
   * Get knowledge base statistics
   * 
   * @returns Comprehensive statistics
   */
  async getStatistics(): Promise<KBStatistics> {
    try {
      // Get document counts from SQLite
      const allDocs = this.repository.list();
      
      const stats: KBStatistics = {
        totalDocuments: allDocs.length,
        documentsByStatus: {
          processing: allDocs.filter((d: KbDocument) => d.status === 'processing').length,
          ready: allDocs.filter((d: KbDocument) => d.status === 'ready').length,
          error: allDocs.filter((d: KbDocument) => d.status === 'error').length
        },
        documentsByType: {
          pdf: allDocs.filter((d: KbDocument) => d.type === 'pdf').length,
          word: allDocs.filter((d: KbDocument) => d.type === 'word').length,
          markdown: allDocs.filter((d: KbDocument) => d.type === 'markdown').length
        },
        totalChunks: allDocs.reduce((sum: number, doc: KbDocument) => sum + doc.chunkCount, 0),
        storageUsage: allDocs.reduce((sum: number, doc: KbDocument) => sum + doc.fileSize, 0)
      };

      return stats;

    } catch (error) {
      throw wrapError(error, 'Failed to get statistics');
    }
  }

  /**
   * Get documents by status
   * 
   * @param status - Document status
   * @returns Array of documents with given status
   */
  getDocumentsByStatus(status: 'processing' | 'ready' | 'error'): KbDocument[] {
    try {
      const allDocs = this.repository.list();
      return allDocs.filter((doc: KbDocument) => doc.status === status);
    } catch (error) {
      throw wrapError(error, `Failed to get documents with status ${status}`);
    }
  }

  /**
   * Get documents by type
   * 
   * @param type - Document type
   * @returns Array of documents of given type
   */
  getDocumentsByType(type: 'pdf' | 'word' | 'markdown'): KbDocument[] {
    try {
      const allDocs = this.repository.list();
      return allDocs.filter((doc: KbDocument) => doc.type === type);
    } catch (error) {
      throw wrapError(error, `Failed to get documents of type ${type}`);
    }
  }

  /**
   * Check if a document exists
   * 
   * @param documentId - Document UUID
   * @returns true if document exists
   */
  documentExists(documentId: string): boolean {
    try {
      const doc = this.repository.getById(documentId);
      return doc !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get recent documents
   * 
   * @param limit - Number of documents to return
   * @returns Most recently created documents
   */
  getRecentDocuments(limit: number = 10): KbDocument[] {
    try {
      const result = this.listDocuments({
        page: 1,
        pageSize: limit,
        sortBy: 'createdAt',
        sortOrder: 'desc'
      });

      return result.documents;
    } catch (error) {
      throw wrapError(error, 'Failed to get recent documents');
    }
  }
}
