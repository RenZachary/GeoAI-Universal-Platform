/**
 * Knowledge Base Type Definitions
 */

// ============================================================================
// Document Types
// ============================================================================

export interface KbDocument {
  id: string;                    // UUID v4
  name: string;                  // Original filename
  type: 'pdf' | 'word' | 'markdown';
  filePath: string;              // Absolute path in workspace
  fileSize: number;              // Size in bytes
  chunkCount: number;            // Number of text chunks
  status: 'processing' | 'ready' | 'error';
  errorMessage?: string;         // Error details if failed
  createdAt: Date;
  updatedAt: Date;
}

export interface KbDocumentMetadata {
  documentId: string;
  key: string;                   // e.g., 'location', 'category', 'author'
  value: any;                    // JSON-encoded value
}

export interface KbChunk {
  id: string;                    // UUID v4
  documentId: string;
  chunkIndex: number;            // Position within document
  contentPreview: string;        // First 200 chars
  vectorId: string;              // LanceDB document ID
  createdAt: Date;
}

// ============================================================================
// Parsed Document Types
// ============================================================================

export interface ParsedDocument {
  text: string;
  metadata: {
    pageCount?: number;
    author?: string;
    title?: string;
    createdAt?: Date;
    [key: string]: any;
  };
}

export interface TextChunk {
  content: string;
  index: number;
  metadata: {
    pageNumber?: number;
    section?: string;
    [key: string]: any;
  };
}

// ============================================================================
// Embedding Types
// ============================================================================

export type EmbeddingVector = number[];  // 1536-dimensional vector

export interface EmbeddingCacheEntry {
  textHash: string;              // MD5 hash of text
  embedding: EmbeddingVector;
  createdAt: Date;
}

// ============================================================================
// Retrieval Types
// ============================================================================

export interface RetrievedDocument {
  content: string;
  documentId: string;
  score: number;                 // Similarity score (0-1)
  metadata: {
    documentName: string;
    chunkIndex: number;
    pageNumber?: number;
    location?: GeoGeometry;      // Optional spatial metadata
    [key: string]: any;
  };
}

export interface Citation {
  documentId: string;
  documentName: string;
  pageNumber?: number;
  preview: string;               // First 200 chars
  score?: number;
}

// ============================================================================
// RAG Query Types
// ============================================================================

export interface RagQueryOptions {
  topK?: number;
  useReranker?: boolean;
  similarityThreshold?: number;
  location?: GeoGeometry;        // For spatial filtering
  filters?: Record<string, any>; // For metadata filtering
}

export interface RagResult {
  context: string;               // Formatted context for LLM
  citations: Citation[];
  hadKnowledge: boolean;
}

// ============================================================================
// Intent Classification Types
// ============================================================================

export type IntentType = 
  | 'GIS_ANALYSIS' 
  | 'KNOWLEDGE_QUERY' 
  | 'HYBRID' 
  | 'GENERAL_CHAT';

export interface IntentClassification {
  type: IntentType;
  confidence: number;            // 0-1
  reasoning?: string;            // For debugging
  extractedEntities?: {
    locations?: string[];
    operations?: string[];
    topics?: string[];
  };
}

// ============================================================================
// Ingestion Types
// ============================================================================

export interface IngestionResult {
  documentId: string;
  chunkCount: number;
  status: 'ready' | 'error';
  errorMessage?: string;
}

export interface IngestionProgress {
  completed: number;
  total: number;
  percentage: number;
  currentStep: 'parsing' | 'chunking' | 'embedding' | 'storing';
}

// ============================================================================
// Collection Statistics
// ============================================================================

export interface CollectionStats {
  totalDocuments: number;
  totalChunks: number;
  totalSize: number;             // Bytes
  averageChunkSize: number;
  lastUpdated: Date;
}

// ============================================================================
// GeoJSON Types (for spatial metadata)
// ============================================================================

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface GeoPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export type GeoGeometry = GeoPoint | GeoPolygon;
