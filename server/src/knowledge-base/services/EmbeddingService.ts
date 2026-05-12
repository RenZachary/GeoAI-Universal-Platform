/**
 * Embedding Service
 * 
 * Generates vector embeddings using LLMAdapterFactory.
 * Supports multiple providers (OpenAI, Qwen/DashScope, etc.)
 * The specific provider is determined by configuration, not hardcoded.
 */

import { LLMAdapterFactory, type EmbeddingConfig } from '../../llm-interaction';
import type { Embeddings } from '@langchain/core/embeddings';
import { KB_CONFIG } from '../config';
import { wrapError } from '../../core';

export class EmbeddingService {
  private embeddings: Embeddings;
  private model: string;
  private dimensions: number;

  constructor(config?: Partial<EmbeddingConfig>) {
    this.model = config?.model || KB_CONFIG.EMBEDDING_MODEL;
    this.dimensions = config?.dimensions || KB_CONFIG.EMBEDDING_DIMENSIONS;

    // Create embedding adapter using the unified factory
    // Provider and API key are managed by LLMAdapterFactory
    this.embeddings = LLMAdapterFactory.createEmbeddingAdapter({
      provider: config?.provider || 'qwen', // Default to qwen, but configurable
      model: this.model,
      apiKey: config?.apiKey, // Let LLMAdapterFactory handle missing key (mock mode)
      baseUrl: config?.baseUrl,
      dimensions: this.dimensions
    });
  }

  /**
   * Generate embedding for a single text
   * 
   * @param text - Text to embed
   * @returns Vector embedding (array of numbers)
   */
  async embedText(text: string): Promise<number[]> {
    try {
      const embedding = await this.embeddings.embedQuery(text);
      
      if (!embedding || embedding.length !== this.dimensions) {
        throw new Error(`Expected embedding dimension ${this.dimensions}, got ${embedding?.length}`);
      }

      return embedding;

    } catch (error) {
      throw wrapError(error, `Failed to generate embedding for text`);
    }
  }

  /**
   * Generate embeddings for multiple texts (batch processing)
   * 
   * @param texts - Array of texts to embed
   * @returns Array of vector embeddings
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    // Process in batches to avoid API limits
    const batchSize = KB_CONFIG.EMBEDDING_BATCH_SIZE;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      try {
        const batchEmbeddings = await this.embeddings.embedDocuments(batch);
        allEmbeddings.push(...batchEmbeddings);

        // Small delay between batches to avoid rate limiting
        if (i + batchSize < texts.length) {
          await this.sleep(100);
        }

      } catch (error) {
        throw wrapError(error, `Failed to generate embeddings for batch starting at index ${i}`);
      }
    }

    return allEmbeddings;
  }

  /**
   * Generate embeddings with metadata
   * 
   * @param texts - Array of texts to embed
   * @returns Array of objects with text and embedding
   */
  async embedWithMetadata(texts: string[]): Promise<Array<{
    text: string;
    embedding: number[];
    dimensions: number;
    model: string;
    createdAt: Date;
  }>> {
    const embeddings = await this.embedBatch(texts);
    
    return embeddings.map((embedding, index) => ({
      text: texts[index],
      embedding,
      dimensions: embedding.length,
      model: this.model,
      createdAt: new Date()
    }));
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate API key by making a test request
   */
  async validateApiKey(): Promise<boolean> {
    try {
      await this.embedText('test');
      return true;
    } catch (error) {
      console.error('DashScope API key validation failed:', error);
      return false;
    }
  }

  /**
   * Get current model name
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Get expected embedding dimensions
   */
  getDimensions(): number {
    return this.dimensions;
  }
}
