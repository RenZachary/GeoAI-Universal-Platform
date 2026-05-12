/**
 * Knowledge Base Module - Entry Point
 * 
 * Exports all public types, services, and utilities for the KB module.
 */

// Configuration
export { KB_CONFIG, INTENT_CONFIG, KB_PERFORMANCE } from './config';

// Types
export type {
  // Document types
  KbDocument,
  KbDocumentMetadata,
  KbChunk,
  
  // Parsing types
  ParsedDocument,
  TextChunk,
  
  // Embedding types
  EmbeddingVector,
  EmbeddingCacheEntry,
  
  // Retrieval types
  RetrievedDocument,
  Citation,
  
  // RAG types
  RagQueryOptions,
  RagResult,
  
  // Intent types
  IntentType,
  IntentClassification,
  
  // Ingestion types
  IngestionResult,
  IngestionProgress,
  
  // Statistics
  CollectionStats,
  
  // GeoJSON types
  GeoPoint,
  GeoPolygon,
  GeoGeometry,
} from './types';

// Repository
export { KbDocumentRepository } from './repository/KbDocumentRepository';

// Parsers
export {
  type DocumentParser,
  ParserRegistry,
  PdfParser,
  WordParser,
  MarkdownParser
} from './parsers';

// Services
export { TextChunkingService, EmbeddingService, DocumentIngestionService, SemanticSearchService, KBManagementService } from './services';
// Backward compatibility
export { EmbeddingService as DashScopeEmbeddingService } from './services';

// Scanner
export { scanAndIngestKBDocuments } from './scanner';

// Vector Store
export { LanceDBAdapter } from './vector-store/LanceDBAdapter';
