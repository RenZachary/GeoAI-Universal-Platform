/**
 * Services Module - Entry Point
 * 
 * Exports all KB services.
 */

export { TextChunkingService } from './TextChunkingService';
export { EmbeddingService } from './EmbeddingService';
// Backward compatibility alias
export { EmbeddingService as DashScopeEmbeddingService } from './EmbeddingService';
export { DocumentIngestionService } from './DocumentIngestionService';
export { SemanticSearchService } from './SemanticSearchService';
export { KBManagementService } from './KBManagementService';
