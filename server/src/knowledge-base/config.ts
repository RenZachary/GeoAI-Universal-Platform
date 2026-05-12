/**
 * Knowledge Base Configuration Constants
 * 
 * All KB-related configuration is managed here, NOT in .env files.
 * Workspace paths are managed by WorkspaceManager.
 */

// ============================================================================
// Collection & Storage Settings
// ============================================================================

export const KB_CONFIG = {
  // LanceDB table name
  COLLECTION_NAME: 'geoai_kb',
  
  // Text chunking strategy
  CHUNK_SIZE: 1000,        // Characters per chunk
  CHUNK_OVERLAP: 100,      // Overlap between chunks
  
  // Retrieval settings
  DEFAULT_TOP_K: 10,       // Number of documents to retrieve initially
  RERANKER_TOP_K: 3,       // Number of documents after reranking
  SIMILARITY_THRESHOLD: 0.3, // Minimum similarity score (0-1) - lowered for Euclidean distance
  
  // Embedding service configuration
  EMBEDDING_PROVIDER: 'dashscope' as const, // 'dashscope' | 'openai' | 'baidu'
  EMBEDDING_MODEL: 'text-embedding-v2',
  EMBEDDING_DIMENSIONS: 1536,
  
  // Reranker configuration
  RERANKER_ENABLED: true,
  RERANKER_MODEL: 'bge-reranker-v2-m3',
  
  // File upload limits
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  ALLOWED_TYPES: ['.pdf', '.docx', '.md'] as const,
  
  // Batch processing
  EMBEDDING_BATCH_SIZE: 20, // Process embeddings in batches
} as const;

// ============================================================================
// Intent Classification Settings
// ============================================================================

export const INTENT_CONFIG = {
  // Confidence threshold for intent classification
  CONFIDENCE_THRESHOLD: 0.7,
  
  // Keywords for rule-based pre-filtering
  GIS_KEYWORDS: [
    'buffer', 'intersect', 'overlay', 'clip',
    'calculate area', 'show on map', 'filter by location',
    'distance', 'within', 'contains', 'touches'
  ],
  
  KB_KEYWORDS: [
    'policy', 'regulation', 'standard', 'document',
    'what is', 'explain', 'definition', 'rule',
    'guideline', 'procedure', 'manual'
  ],
  
  // General chat patterns (regex)
  CHAT_PATTERNS: [
    /^(hi|hello|hey|greetings)/i,
    /(how are you|what's up)/i,
    /^(thank|thanks|bye|goodbye)/i
  ]
} as const;

// ============================================================================
// Performance & Timeout Settings
// ============================================================================

export const KB_PERFORMANCE = {
  // Timeout settings (milliseconds)
  EMBEDDING_TIMEOUT: 30000,    // 30s for embedding generation
  RETRIEVAL_TIMEOUT: 10000,    // 10s for retrieval
  RERANK_TIMEOUT: 5000,        // 5s for reranking
  
  // Retry settings
  MAX_RETRIES: 3,
  RETRY_DELAY_BASE: 1000,      // 1s base delay for exponential backoff
  
  // Cache settings
  ENABLE_EMBEDDING_CACHE: true,
  CACHE_TTL: 7 * 24 * 60 * 60 * 1000, // 7 days
} as const;
