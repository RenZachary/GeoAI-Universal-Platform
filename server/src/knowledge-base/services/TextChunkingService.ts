/**
 * Text Chunking Service
 * 
 * Splits parsed document text into smaller chunks for embedding.
 * Uses intelligent strategies to maintain semantic coherence.
 */

import { KB_CONFIG } from '../config';
import type { ParsedDocument, TextChunk } from '../types';

export class TextChunkingService {
  private chunkSize: number;
  private chunkOverlap: number;

  constructor(options?: {
    chunkSize?: number;
    chunkOverlap?: number;
  }) {
    this.chunkSize = options?.chunkSize || KB_CONFIG.CHUNK_SIZE;
    this.chunkOverlap = options?.chunkOverlap || KB_CONFIG.CHUNK_OVERLAP;
  }

  /**
   * Split a parsed document into chunks
   * 
   * @param doc - Parsed document with text content
   * @returns Array of text chunks with metadata
   */
  chunkDocument(doc: ParsedDocument): TextChunk[] {
    const text = doc.text.trim();
    
    if (!text) {
      return [];
    }

    // Strategy: Split by paragraphs first, then by character count
    const paragraphs = this.splitByParagraphs(text);
    const chunks: TextChunk[] = [];
    let currentChunk = '';
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
      // If paragraph itself is longer than chunk size, split it
      if (paragraph.length > this.chunkSize) {
        // Finalize current chunk if exists
        if (currentChunk.trim()) {
          chunks.push(this.createChunk(currentChunk.trim(), chunkIndex, doc.metadata));
          chunkIndex++;
          currentChunk = '';
        }

        // Split long paragraph into multiple chunks
        const subChunks = this.splitLongText(paragraph);
        for (const subChunk of subChunks) {
          chunks.push(this.createChunk(subChunk, chunkIndex, doc.metadata));
          chunkIndex++;
        }
      } else if (currentChunk.length + paragraph.length + 2 > this.chunkSize && currentChunk.length > 0) {
        // Adding this paragraph would exceed chunk size
        chunks.push(this.createChunk(currentChunk.trim(), chunkIndex, doc.metadata));
        chunkIndex++;

        // Start new chunk with overlap
        const overlapText = this.getOverlapText(currentChunk);
        currentChunk = overlapText + paragraph;
      } else {
        // Add paragraph to current chunk
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }

    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push(this.createChunk(currentChunk.trim(), chunkIndex, doc.metadata));
    }

    return chunks;
  }

  /**
   * Split text into chunks without document context
   * 
   * @param text - Raw text to split
   * @returns Array of text chunks
   */
  chunkText(text: string): TextChunk[] {
    const paragraphs = this.splitByParagraphs(text);
    const chunks: TextChunk[] = [];
    let currentChunk = '';
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
      // If paragraph itself is longer than chunk size, split it
      if (paragraph.length > this.chunkSize) {
        // Finalize current chunk if exists
        if (currentChunk.trim()) {
          chunks.push({
            content: currentChunk.trim(),
            index: chunkIndex,
            metadata: {}
          });
          chunkIndex++;
          currentChunk = '';
        }

        // Split long paragraph into multiple chunks
        const subChunks = this.splitLongText(paragraph);
        for (const subChunk of subChunks) {
          chunks.push({
            content: subChunk,
            index: chunkIndex,
            metadata: {}
          });
          chunkIndex++;
        }
      } else if (currentChunk.length + paragraph.length + 2 > this.chunkSize && currentChunk.length > 0) {
        chunks.push({
          content: currentChunk.trim(),
          index: chunkIndex,
          metadata: {}
        });
        chunkIndex++;

        const overlapText = this.getOverlapText(currentChunk);
        currentChunk = overlapText + paragraph;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        content: currentChunk.trim(),
        index: chunkIndex,
        metadata: {}
      });
    }

    return chunks;
  }

  /**
   * Split text by paragraphs (double newline or single newline)
   */
  private splitByParagraphs(text: string): string[] {
    // First try splitting by double newlines (paragraph breaks)
    let paragraphs = text.split(/\n\s*\n/);

    // If no double newlines, split by single newlines
    if (paragraphs.length <= 1) {
      paragraphs = text.split(/\n/);
    }

    // Filter out empty paragraphs and trim
    return paragraphs
      .map(p => p.trim())
      .filter(p => p.length > 0);
  }

  /**
   * Split long text into smaller chunks by character count
   */
  private splitLongText(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = start + this.chunkSize;

      if (end >= text.length) {
        // Last chunk
        chunks.push(text.substring(start).trim());
        break;
      }

      // Try to break at word boundary
      let breakPoint = end;
      while (breakPoint > start && text[breakPoint] !== ' ' && text[breakPoint] !== '\n') {
        breakPoint--;
      }

      // If no good break point found, use hard break
      if (breakPoint <= start) {
        breakPoint = end;
      }

      chunks.push(text.substring(start, breakPoint).trim());
      
      // Move start with overlap
      start = breakPoint - this.chunkOverlap;
      if (start < breakPoint) {
        start = breakPoint; // Ensure progress
      }
    }

    return chunks.filter(c => c.length > 0);
  }

  /**
   * Get overlap text from the end of previous chunk
   */
  private getOverlapText(text: string): string {
    if (this.chunkOverlap === 0 || text.length <= this.chunkOverlap) {
      return '';
    }

    // Take last N characters as overlap
    const overlap = text.substring(text.length - this.chunkOverlap);
    
    // Try to break at word boundary
    const lastSpace = overlap.lastIndexOf(' ');
    if (lastSpace !== -1 && lastSpace > this.chunkOverlap / 2) {
      return overlap.substring(lastSpace + 1);
    }

    return overlap;
  }

  /**
   * Create a chunk object with metadata
   */
  private createChunk(
    content: string,
    index: number,
    docMetadata: Record<string, any>
  ): TextChunk {
    return {
      content,
      index,
      metadata: {
        ...docMetadata,
        chunkIndex: index,
        chunkSize: content.length
      }
    };
  }

  /**
   * Estimate number of chunks for a given text length
   */
  estimateChunkCount(textLength: number): number {
    if (textLength === 0) return 0;
    
    const effectiveChunkSize = this.chunkSize - this.chunkOverlap;
    return Math.ceil(textLength / effectiveChunkSize);
  }
}
