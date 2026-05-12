/**
 * Knowledge Retriever Node for LangGraph Workflow
 * 
 * Retrieves relevant documents from the knowledge base using semantic search.
 * Only executes when intent is KNOWLEDGE_QUERY or HYBRID.
 * 
 * Integrates with SemanticSearchService to:
 * - Generate query embeddings
 * - Search LanceDB vector store
 * - Format retrieved chunks into context string
 */

import type { GeoAIStateType } from '../GeoAIGraph';
import { SemanticSearchService } from '../../../knowledge-base/services/SemanticSearchService';
import { WorkspaceManagerInstance, SQLiteManagerInstance } from '../../../storage';
import { LLMConfigManagerInstance } from '../../../services/LLMConfigService';
import { KB_CONFIG } from '../../../knowledge-base/config';

export class KnowledgeRetrieverNode {
  private searchService: SemanticSearchService;
  private initialized = false;
  
  constructor() {
    // Initialize search service with workspace paths
    const dbPath = WorkspaceManagerInstance.getDirectoryPath('KB_LANCEDB');
    const db = SQLiteManagerInstance.getDatabase();
    
    // Get LLM config for embedding service
    const llmConfig = LLMConfigManagerInstance.loadConfig();
    const embeddingProvider = (llmConfig.provider === 'openai' || llmConfig.provider === 'qwen') 
      ? llmConfig.provider 
      : 'qwen';
    
    this.searchService = new SemanticSearchService({
      dbPath,
      db,
      embeddingConfig: {
        provider: embeddingProvider,
        apiKey: llmConfig.apiKey
      }
    });
  }
  
  /**
   * Retrieve knowledge context based on user query
   * Only runs if intent is KNOWLEDGE_QUERY or HYBRID
   */
  async retrieve(state: GeoAIStateType): Promise<Partial<GeoAIStateType>> {
    // Skip retrieval if intent doesn't require knowledge
    if (state.intent?.type !== 'KNOWLEDGE_QUERY' && state.intent?.type !== 'HYBRID') {
      console.log('[KnowledgeRetriever] Skipping retrieval - intent does not require knowledge');
      return {
        knowledgeContext: undefined,
        currentStep: 'knowledge_retrieval'
      };
    }
    
    console.log(`[KnowledgeRetriever] Retrieving knowledge for query: ${state.userInput.substring(0, 100)}`);
    
    try {
      // Perform semantic search
      const startTime = Date.now();
      const result = await this.searchService.search(state.userInput, {
        topK: KB_CONFIG.DEFAULT_TOP_K,
        useReranker: KB_CONFIG.RERANKER_ENABLED,
        similarityThreshold: KB_CONFIG.SIMILARITY_THRESHOLD
      });
      
      const searchTime = Date.now() - startTime;
      console.log(`[KnowledgeRetriever] Found ${result.documents.length} documents in ${searchTime}ms`);
      
      if (result.documents.length === 0) {
        console.log('[KnowledgeRetriever] No relevant documents found');
        return {
          knowledgeContext: {
            query: state.userInput,
            retrievedChunks: [],
            contextString: ''
          },
          currentStep: 'knowledge_retrieval'
        };
      }
      
      // Format retrieved chunks
      const retrievedChunks = result.documents.map(doc => ({
        content: doc.content,
        documentId: doc.documentId,
        score: doc.score,
        metadata: doc.metadata
      }));
      
      // Build context string for LLM
      const contextString = this.formatContext(retrievedChunks);
      
      console.log(`[KnowledgeRetriever] Context built (${contextString.length} chars)`);
      
      return {
        knowledgeContext: {
          query: state.userInput,
          retrievedChunks,
          contextString
        },
        currentStep: 'knowledge_retrieval'
      };
    } catch (error) {
      console.error('[KnowledgeRetriever] Retrieval failed:', error);
      // Return empty context on failure (graceful degradation)
      return {
        knowledgeContext: {
          query: state.userInput,
          retrievedChunks: [],
          contextString: ''
        },
        currentStep: 'knowledge_retrieval'
      };
    }
  }
  
  /**
   * Format retrieved chunks into a context string for LLM
   */
  private formatContext(chunks: Array<{
    content: string;
    documentId: string;
    score: number;
    metadata: any;
  }>): string {
    if (chunks.length === 0) {
      return '';
    }
    
    const parts = chunks.map((chunk, index) => {
      const docName = chunk.metadata.documentName || 'Unknown Document';
      const pageNumber = chunk.metadata.pageNumber ? ` (Page ${chunk.metadata.pageNumber})` : '';
      
      return `[Source ${index + 1}: ${docName}${pageNumber}, Relevance: ${(chunk.score * 100).toFixed(1)}%]\n${chunk.content}\n`;
    });
    
    return parts.join('\n---\n\n');
  }
}

// Singleton instance
let knowledgeRetrieverInstance: KnowledgeRetrieverNode | null = null;

export function getKnowledgeRetriever(): KnowledgeRetrieverNode {
  if (!knowledgeRetrieverInstance) {
    knowledgeRetrieverInstance = new KnowledgeRetrieverNode();
  }
  return knowledgeRetrieverInstance;
}
