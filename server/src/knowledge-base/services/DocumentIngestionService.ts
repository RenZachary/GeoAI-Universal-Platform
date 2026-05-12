/**
 * Document Ingestion Service
 * 
 * Orchestrates the complete document ingestion pipeline:
 * Parse → Chunk → Embed → Store (LanceDB + SQLite)
 */

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ParserRegistry, PdfParser, WordParser, MarkdownParser } from '../parsers';
import { TextChunkingService } from './TextChunkingService';
import { EmbeddingService } from './EmbeddingService';
import { LanceDBAdapter } from '../vector-store/LanceDBAdapter';
import { KbDocumentRepository } from '../repository/KbDocumentRepository';
import type { ParsedDocument, TextChunk, IngestionResult, IngestionProgress } from '../types';
import { KB_CONFIG } from '../config';
import { wrapError } from '../../core';

export class DocumentIngestionService {
  private parserRegistry: ParserRegistry;
  private chunker: TextChunkingService;
  private embedder: EmbeddingService;
  private vectorStore: LanceDBAdapter;
  private repository: KbDocumentRepository;

  constructor(options: {
    dbPath: string;
    db: any; // better-sqlite3 Database instance
    apiKey?: string;
  }) {
    // Initialize components
    this.parserRegistry = new ParserRegistry();
    this.parserRegistry.register(new PdfParser());
    this.parserRegistry.register(new WordParser());
    this.parserRegistry.register(new MarkdownParser());

    this.chunker = new TextChunkingService({
      chunkSize: KB_CONFIG.CHUNK_SIZE,
      chunkOverlap: KB_CONFIG.CHUNK_OVERLAP
    });

    this.embedder = new EmbeddingService({
      apiKey: options.apiKey
    });
    this.vectorStore = new LanceDBAdapter(options.dbPath);
    this.repository = new KbDocumentRepository(options.db);
    
    // Note: Call initialize() explicitly before using the service
    // This ensures proper async initialization order
  }

  /**
   * Initialize all services
   */
  async initialize(): Promise<void> {
    console.log('[DocumentIngestionService] Initializing...');
    
    // Initialize LanceDB
    await this.vectorStore.initialize();
    
    console.log('[DocumentIngestionService] Ready');
  }

  /**
   * Ingest a single document file
   * 
   * @param filePath - Absolute path to the document file
   * @param documentName - Optional custom name (defaults to filename)
   * @returns Ingestion result with statistics
   */
  async ingestDocument(
    filePath: string,
    documentName?: string
  ): Promise<IngestionResult> {
    const startTime = Date.now();
    const docId = uuidv4();
    
    try {
      console.log(`[DocumentIngestionService] Starting ingestion: ${filePath}`);

      // Step 1: Validate file exists and is supported
      await this.validateFile(filePath);

      // Step 2: Determine document type and name
      const ext = path.extname(filePath).toLowerCase();
      const docType = this.getDocTypeFromExtension(ext);
      const name = documentName || path.basename(filePath, ext);

      // Step 3: Create database record
      const fileSize = (await fs.stat(filePath)).size;
      const doc = this.repository.create(name, docType, filePath, fileSize);
      
      console.log(`[DocumentIngestionService] Created document record: ${doc.id}`);

      // Step 4: Parse document
      console.log('[DocumentIngestionService] Parsing document...');
      const parsedDoc = await this.parseDocument(filePath);
      console.log(`[DocumentIngestionService] Parsed: ${parsedDoc.text.length} characters`);

      // Step 5: Split into chunks
      console.log('[DocumentIngestionService] Chunking text...');
      const chunks = this.chunkDocument(parsedDoc);
      console.log(`[DocumentIngestionService] Created ${chunks.length} chunks`);

      // Step 6: Generate embeddings
      console.log('[DocumentIngestionService] Generating embeddings...');
      const texts = chunks.map(chunk => chunk.content);
      const embeddings = await this.embedder.embedBatch(texts);
      console.log(`[DocumentIngestionService] Generated ${embeddings.length} embeddings`);

      // Step 7: Store in LanceDB
      console.log('[DocumentIngestionService] Storing in vector database...');
      const vectorDocs = chunks.map((chunk, index) => ({
        id: `${doc.id}_chunk_${index}`,
        text: chunk.content,
        embedding: embeddings[index],
        metadata: {
          documentId: doc.id,
          documentName: doc.name,
          documentType: doc.type,
          chunkIndex: index,
          totalChunks: chunks.length,
          ...chunk.metadata
        }
      }));

      await this.vectorStore.addDocuments(vectorDocs);
      console.log('[DocumentIngestionService] Stored in LanceDB');

      // Step 8: Save chunk references to SQLite
      console.log('[DocumentIngestionService] Saving chunk metadata...');
      const chunkRecords = chunks.map((chunk, index) => ({
        documentId: doc.id,
        chunkIndex: index,
        contentPreview: chunk.content.substring(0, 200),
        vectorId: `${doc.id}_chunk_${index}`
      }));

      this.repository.createChunks(chunkRecords);

      // Step 9: Update document status and chunk count
      this.repository.updateStatus(doc.id, 'ready');
      this.repository.updateChunkCount(doc.id, chunks.length);  // ✅ Update chunk_count in kb_documents table
      this.repository.setMetadata(doc.id, 'chunk_count', chunks.length);  // Also save to metadata for reference

      // Step 10: Save additional metadata
      if (parsedDoc.metadata) {
        Object.entries(parsedDoc.metadata).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            this.repository.setMetadata(doc.id, key, value);
          }
        });
      }

      const duration = Date.now() - startTime;

      console.log(`[DocumentIngestionService] ✅ Ingestion complete: ${doc.id}`);

      return {
        documentId: doc.id,
        chunkCount: chunks.length,
        status: 'ready'
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Update status to error
      try {
        this.repository.updateStatus(docId, 'error');
        this.repository.setMetadata(docId, 'error_message', (error as Error).message);
      } catch (e) {
        // Ignore if document wasn't created yet
      }

      console.error(`[DocumentIngestionService] ❌ Ingestion failed:`, error);

      return {
        documentId: docId,
        chunkCount: 0,
        status: 'error',
        errorMessage: (error as Error).message
      };
    }
  }

  /**
   * Ingest multiple documents in batch
   * 
   * @param filePaths - Array of file paths
   * @param onProgress - Optional progress callback
   * @returns Array of ingestion results
   */
  async ingestBatch(
    filePaths: string[],
    onProgress?: (progress: IngestionProgress) => void
  ): Promise<IngestionResult[]> {
    const results: IngestionResult[] = [];
    const total = filePaths.length;

    console.log(`[DocumentIngestionService] Starting batch ingestion: ${total} documents`);

    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];
      
      try {
        const result = await this.ingestDocument(filePath);
        results.push(result);

        // Report progress
        if (onProgress) {
          onProgress({
            completed: i + 1,
            total,
            percentage: ((i + 1) / total) * 100,
            currentStep: 'storing'
          });
        }

      } catch (error) {
        console.error(`[DocumentIngestionService] Failed to ingest ${filePath}:`, error);
        
        results.push({
          documentId: '',
          chunkCount: 0,
          status: 'error',
          errorMessage: (error as Error).message
        });
      }
    }

    const successCount = results.filter(r => r.status === 'ready').length;
    console.log(`[DocumentIngestionService] Batch complete: ${successCount}/${total} succeeded`);

    return results;
  }

  /**
   * Validate file exists and is supported
   */
  private async validateFile(filePath: string): Promise<void> {
    // Check file exists
    try {
      await fs.access(filePath);
    } catch {
      throw wrapError(new Error(`File not found: ${filePath}`), 'File validation failed');
    }

    // Check extension is supported
    const ext = path.extname(filePath).toLowerCase();
    const parser = this.parserRegistry.getParser(filePath);
    if (!parser) {
      throw wrapError(
        new Error(`Unsupported file type: ${ext}. Supported: ${KB_CONFIG.ALLOWED_TYPES.join(', ')}`),
        'File validation failed'
      );
    }

    // Check file size
    const stats = await fs.stat(filePath);
    if (stats.size > KB_CONFIG.MAX_FILE_SIZE) {
      throw wrapError(
        new Error(`File too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB (max: ${KB_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB)`),
        'File validation failed'
      );
    }
  }

  /**
   * Get document type from file extension
   */
  private getDocTypeFromExtension(ext: string): 'pdf' | 'word' | 'markdown' {
    switch (ext) {
      case '.pdf':
        return 'pdf';
      case '.docx':
        return 'word';
      case '.md':
      case '.markdown':
        return 'markdown';
      default:
        throw new Error(`Unknown extension: ${ext}`);
    }
  }

  /**
   * Parse document using appropriate parser
   */
  private async parseDocument(filePath: string): Promise<ParsedDocument> {
    return await this.parserRegistry.parseDocument(filePath);
  }

  /**
   * Split parsed document into chunks
   */
  private chunkDocument(parsedDoc: ParsedDocument): TextChunk[] {
    return this.chunker.chunkDocument(parsedDoc);
  }
}
