/**
 * Semantic Search Service
 * 
 * Provides semantic search capabilities using vector similarity.
 * Integrates with LanceDB for efficient retrieval and supports
 * filtering, ranking, and result aggregation.
 */

import { LanceDBAdapter } from '../vector-store/LanceDBAdapter';
import { EmbeddingService } from './EmbeddingService';
import { KbDocumentRepository } from '../repository/KbDocumentRepository';
import type { RetrievedDocument, RagQueryOptions } from '../types';
import { KB_CONFIG } from '../config';
import { wrapError } from '../../core';

export interface SearchResult {
  documents: RetrievedDocument[];
  query: string;
  totalResults: number;
  searchTime: number; // milliseconds
}

export interface SearchFilter {
  documentId?: string;
  documentType?: 'pdf' | 'word' | 'markdown';
  metadata?: Record<string, any>;
  minScore?: number;
}

export class SemanticSearchService {
  private vectorStore: LanceDBAdapter;
  private embedder: EmbeddingService;
  private repository: KbDocumentRepository;

  constructor(options: {
    dbPath: string;
    db: any; // better-sqlite3 Database instance
    embeddingConfig?: {
      provider?: 'openai' | 'qwen';
      apiKey?: string;
      baseUrl?: string;
    };
  }) {
    this.vectorStore = new LanceDBAdapter(options.dbPath);
    this.embedder = new EmbeddingService({
      provider: options.embeddingConfig?.provider || 'qwen',
      apiKey: options.embeddingConfig?.apiKey,
      baseUrl: options.embeddingConfig?.baseUrl
    });
    this.repository = new KbDocumentRepository(options.db);
    
    // Auto-initialize LanceDB
    void this.initialize();
  }

  /**
   * Initialize the search service
   */
  async initialize(): Promise<void> {
    console.log('[SemanticSearchService] Initializing...');
    await this.vectorStore.initialize();
    console.log('[SemanticSearchService] Ready');
  }

  /**
   * Perform semantic search on a query
   * 
   * @param query - Search query text
   * @param options - Search options (topK, filters, etc.)
   * @returns Search results with ranked documents
   */
  async search(
    query: string,
    options?: RagQueryOptions
  ): Promise<SearchResult> {
    const startTime = Date.now();

    try {
      console.log(`[SemanticSearchService] Searching: "${query.substring(0, 50)}..."`);

      // Step 1: Generate query embedding
      const queryEmbedding = await this.embedder.embedText(query);
      console.log('[SemanticSearchService] Query embedding generated');

      // Step 2: Build filter if provided
      const filter = options?.filters ? this.buildFilter(options.filters) : undefined;

      // Step 3: Perform similarity search
      const topK = options?.topK || KB_CONFIG.DEFAULT_TOP_K;
      const results = await this.vectorStore.search(
        queryEmbedding,
        topK,
        filter
      );
      console.log(`[SemanticSearchService] Retrieved ${results.length} documents`);

      // Step 4: Apply minimum score threshold
      const threshold = options?.similarityThreshold || KB_CONFIG.SIMILARITY_THRESHOLD;
      const filteredResults = results.filter((doc: any) => doc.score >= threshold);
      console.log(`[SemanticSearchService] After threshold (${threshold}): ${filteredResults.length} documents`);

      // Step 5: Get additional document metadata from SQLite
      const enrichedResults = await this.enrichWithMetadata(filteredResults);

      const searchTime = Date.now() - startTime;

      return {
        documents: enrichedResults,
        query,
        totalResults: enrichedResults.length,
        searchTime
      };

    } catch (error) {
      throw wrapError(error, 'Semantic search failed');
    }
  }

  /**
   * Search within a specific document
   * 
   * @param query - Search query
   * @param documentId - Target document ID
   * @param topK - Number of results
   * @returns Search results filtered by document
   */
  async searchInDocument(
    query: string,
    documentId: string,
    topK?: number
  ): Promise<SearchResult> {
    return this.search(query, {
      topK: topK || KB_CONFIG.DEFAULT_TOP_K,
      filters: {
        documentId
      }
    });
  }

  /**
   * Multi-query search for better coverage
   * 
   * @param queries - Multiple related queries
   * @param options - Search options
   * @returns Deduplicated and ranked results
   */
  async multiQuerySearch(
    queries: string[],
    options?: RagQueryOptions
  ): Promise<SearchResult> {
    const startTime = Date.now();

    try {
      console.log(`[SemanticSearchService] Multi-query search: ${queries.length} queries`);

      // Generate embeddings for all queries
      const embeddings = await this.embedder.embedBatch(queries);

      // Perform multi-query search
      const topK = options?.topK || KB_CONFIG.DEFAULT_TOP_K;
      const results = await this.vectorStore.multiQuerySearch(embeddings, topK);

      // Apply threshold
      const threshold = options?.similarityThreshold || KB_CONFIG.SIMILARITY_THRESHOLD;
      const filteredResults = results.filter((doc: any) => doc.score >= threshold);

      // Enrich with metadata
      const enrichedResults = await this.enrichWithMetadata(filteredResults);

      const searchTime = Date.now() - startTime;

      return {
        documents: enrichedResults,
        query: queries.join(' | '),
        totalResults: enrichedResults.length,
        searchTime
      };

    } catch (error) {
      throw wrapError(error, 'Multi-query search failed');
    }
  }

  /**
   * Get similar documents to a given text
   * 
   * @param text - Reference text
   * @param topK - Number of similar documents
   * @returns Most similar documents
   */
  async findSimilar(text: string, topK?: number): Promise<SearchResult> {
    return this.search(text, {
      topK: topK || KB_CONFIG.DEFAULT_TOP_K
    });
  }

  /**
   * Build LanceDB filter from search options
   */
  private buildFilter(filters?: SearchFilter): Record<string, any> | undefined {
    if (!filters) {
      return undefined;
    }

    const whereClause: Record<string, any> = {};

    if (filters.documentId) {
      whereClause.documentId = filters.documentId;
    }

    if (filters.documentType) {
      whereClause.documentType = filters.documentType;
    }

    if (filters.metadata) {
      Object.entries(filters.metadata).forEach(([key, value]) => {
        whereClause[key] = value;
      });
    }

    return Object.keys(whereClause).length > 0 ? whereClause : undefined;
  }

  /**
   * Enrich search results with additional metadata from SQLite
   */
  private async enrichWithMetadata(
    results: RetrievedDocument[]
  ): Promise<RetrievedDocument[]> {
    // Group results by documentId to batch metadata retrieval
    const documentIds = [...new Set(results.map(r => r.documentId))];

    // Fetch metadata for all documents and track which ones exist
    const metadataMap = new Map<string, any>();
    const existingDocIds = new Set<string>();
    
    for (const docId of documentIds) {
      if (docId) {
        const doc = this.repository.getById(docId);
        if (doc) {
          // Document exists in SQLite
          existingDocIds.add(docId);
          const metadata = this.repository.getMetadata(docId);
          metadataMap.set(docId, metadata);
        }
      }
    }

    // Enrich results AND filter out deleted documents
    const enrichedResults = results
      .filter(result => {
        const docId = result.documentId;
        return docId && existingDocIds.has(docId);
      })
      .map(result => {
        const docId = result.documentId;
        const docMetadata = metadataMap.get(docId) || {};

        return {
          ...result,
          metadata: {
            ...result.metadata,
            ...docMetadata
          }
        };
      });
    
    // Log if any orphaned results were filtered out
    const filteredCount = results.length - enrichedResults.length;
    if (filteredCount > 0) {
      console.log(`[SemanticSearchService] Filtered out ${filteredCount} orphaned results from deleted documents`);
    }

    return enrichedResults;
  }

  /**
   * Get search statistics
   */
  async getStats(): Promise<{
    totalDocuments: number;
    totalChunks: number;
    collectionName: string;
  }> {
    // For now, return basic stats
    // TODO: Implement proper stats retrieval from LanceDB
    return {
      totalDocuments: 0,
      totalChunks: 0,
      collectionName: KB_CONFIG.COLLECTION_NAME
    };
  }
}
