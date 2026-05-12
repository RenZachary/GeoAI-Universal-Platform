/**
 * Knowledge Base API Controller
 * 
 * Handles HTTP requests for knowledge base operations:
 * - Document management (upload, list, delete)
 * - Semantic search
 * - Collection statistics
 */

import type { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { 
  DocumentIngestionService, 
  KBManagementService, 
  SemanticSearchService
} from '../../knowledge-base';
import { WorkspaceManagerInstance } from '../../storage';
import type Database from 'better-sqlite3';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const kbDocsDir = WorkspaceManagerInstance.getDirectoryPath('KB_DOCUMENTS');
    cb(null, kbDocsDir);
  },
  filename: (req, file, cb) => {
    // Decode filename to handle UTF-8 characters (Chinese, etc.)
    let originalName = file.originalname;
    
    // Strategy 1: If it looks like latin-1 encoded UTF-8 bytes (common issue)
    const rawBytes = Buffer.from(originalName, 'binary');
    const hasHighBytes = rawBytes.some(b => b > 127);
    
    if (hasHighBytes) {
      try {
        const utf8Str = rawBytes.toString('utf-8');
        if (!utf8Str.includes('\ufffd')) { // Check for replacement character
          originalName = utf8Str;
        }
      } catch (e) {
        console.warn('[KB Upload] Binary to UTF-8 conversion failed', e);
      }
    }
    
    // Strategy 2: Try decodeURIComponent if not yet decoded
    try {
      const decoded = decodeURIComponent(originalName);
      if (decoded !== originalName) {
        originalName = decoded;
      }
    } catch (e) {
      // decodeURIComponent failed, keep original
      console.warn('[KB Upload] decodeURIComponent failed', e);
    }
    
    // Use decoded original filename
    cb(null, originalName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.docx', '.md', '.markdown'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Allowed types: ${allowedTypes.join(', ')}`));
    }
  }
});

export class KnowledgeBaseController {
  private ingestionService: DocumentIngestionService;
  private managementService: KBManagementService;
  private searchService: SemanticSearchService;

  constructor(options: {
    dbPath: string;
    db: Database.Database;
    apiKey?: string;
    embeddingProvider?: 'openai' | 'qwen';
  }) {
    const { dbPath, db, apiKey, embeddingProvider = 'qwen' } = options;

    this.ingestionService = new DocumentIngestionService({
      dbPath,
      db,
      apiKey
    });

    this.managementService = new KBManagementService({
      dbPath,
      db
    });

    this.searchService = new SemanticSearchService({
      dbPath,
      db,
      embeddingConfig: {
        provider: embeddingProvider,
        apiKey
      }
    });
    
    // Initialize services asynchronously (non-blocking)
    void this.initializeServices();
  }
  
  /**
   * Initialize all KB services
   */
  private async initializeServices(): Promise<void> {
    try {
      await this.ingestionService.initialize();
      console.log('[KnowledgeBaseController] Services initialized');
    } catch (error) {
      console.error('[KnowledgeBaseController] Failed to initialize services:', error);
    }
  }

  /**
   * Upload and ingest a document
   * POST /api/kb/documents/upload
   */
  async uploadDocument(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
        return;
      }

      console.log(`[KB API] Uploading document: ${req.file.originalname}`);

      const filePath = req.file.path;
      const result = await this.ingestionService.ingestDocument(filePath);

      res.status(201).json({
        success: true,
        data: {
          documentId: result.documentId,
          chunkCount: result.chunkCount,
          status: result.status
        }
      });

    } catch (error) {
      console.error('[KB API] Upload failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed'
      });
    }
  }

  /**
   * List documents with pagination and filtering
   * GET /api/kb/documents
   */
  async listDocuments(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const status = req.query.status as 'processing' | 'ready' | 'error' | undefined;
      const type = req.query.type as 'pdf' | 'word' | 'markdown' | undefined;
      const sortBy = req.query.sortBy as 'createdAt' | 'updatedAt' | 'name' | undefined;
      const sortOrder = req.query.sortOrder as 'asc' | 'desc' | undefined;

      const result = await this.managementService.listDocuments({
        page,
        pageSize,
        status,
        type,
        sortBy,
        sortOrder
      });

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('[KB API] List documents failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list documents'
      });
    }
  }

  /**
   * Get document details by ID
   * GET /api/kb/documents/:id
   */
  async getDocument(req: Request, res: Response): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const doc = await this.managementService.getDocument(id);

      if (!doc) {
        res.status(404).json({
          success: false,
          error: 'Document not found'
        });
        return;
      }

      // Get metadata
      const metadata = await this.managementService.getDocumentMetadata(id);

      res.json({
        success: true,
        data: {
          ...doc,
          metadata
        }
      });

    } catch (error) {
      console.error('[KB API] Get document failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get document'
      });
    }
  }

  /**
   * Delete document
   * DELETE /api/kb/documents/:id
   */
  async deleteDocument(req: Request, res: Response): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      await this.managementService.deleteDocument(id);

      res.json({
        success: true,
        message: 'Document deleted successfully'
      });

    } catch (error) {
      console.error('[KB API] Delete document failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete document'
      });
    }
  }

  /**
   * Get collection statistics
   * GET /api/kb/stats
   */
  async getStatistics(req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.managementService.getStatistics();

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('[KB API] Get statistics failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get statistics'
      });
    }
  }

  /**
   * Semantic search
   * POST /api/kb/search
   */
  async search(req: Request, res: Response): Promise<void> {
    try {
      const { query, topK, filters, similarityThreshold } = req.body;

      if (!query) {
        res.status(400).json({
          success: false,
          error: 'Query is required'
        });
        return;
      }

      const result = await this.searchService.search(query, {
        topK: topK || 10,
        filters,
        similarityThreshold
      });

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('[KB API] Search failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Search failed'
      });
    }
  }

  /**
   * Search within a specific document
   * POST /api/kb/search/document/:id
   */
  async searchInDocument(req: Request, res: Response): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { query, topK } = req.body;

      if (!query) {
        res.status(400).json({
          success: false,
          error: 'Query is required'
        });
        return;
      }

      const result = await this.searchService.searchInDocument(query, id, topK);

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('[KB API] Search in document failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Search failed'
      });
    }
  }
}

// Export multer middleware for use in routes
export { upload };
