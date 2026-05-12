/**
 * Markdown Document Parser
 * 
 * Reads markdown files and extracts text content.
 */

import fs from 'fs/promises';
import type { ParsedDocument } from '../types';
import type { DocumentParser } from './DocumentParser';
import { wrapError } from '../../core';

export class MarkdownParser implements DocumentParser {
  readonly supportedExtensions = ['.md', '.markdown'];

  async parse(filePath: string): Promise<ParsedDocument> {
    try {
      // Read markdown file
      const content = await fs.readFile(filePath, 'utf-8');

      // Extract frontmatter if present (YAML between ---)
      const { text, metadata } = this.extractFrontmatter(content);

      return {
        text,
        metadata: {
          ...metadata,
          format: 'markdown'
        }
      };

    } catch (error) {
      throw wrapError(error, `Failed to parse Markdown file '${filePath}'`);
    }
  }

  canParse(filePath: string): boolean {
    const lowerPath = filePath.toLowerCase();
    return lowerPath.endsWith('.md') || lowerPath.endsWith('.markdown');
  }

  /**
   * Extract YAML frontmatter from markdown
   */
  private extractFrontmatter(content: string): {
    text: string;
    metadata: Record<string, any>;
  } {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return {
        text: content,
        metadata: {}
      };
    }

    const frontmatterText = match[1];
    const text = content.substring(match[0].length);

    // Simple YAML parser (handles basic key-value pairs)
    const metadata: Record<string, any> = {};
    const lines = frontmatterText.split('\n');

    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex !== -1) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        
        // Remove quotes if present
        const cleanValue = value.replace(/^["']|["']$/g, '');
        
        if (key && cleanValue) {
          metadata[key] = cleanValue;
        }
      }
    }

    return { text, metadata };
  }
}
