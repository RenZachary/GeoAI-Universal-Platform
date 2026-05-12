/**
 * Document Parser Interface
 * 
 * Defines the contract for parsing different document formats
 * into a unified structure for further processing.
 */

import type { ParsedDocument } from '../types';

export interface DocumentParser {
  /**
   * Supported file extensions (e.g., ['.pdf', '.docx'])
   */
  readonly supportedExtensions: string[];

  /**
   * Parse a document file into structured text
   * 
   * @param filePath - Absolute path to the document file
   * @returns Parsed document with extracted text and metadata
   */
  parse(filePath: string): Promise<ParsedDocument>;

  /**
   * Check if this parser can handle the given file
   * 
   * @param filePath - Path to check
   * @returns true if this parser supports the file format
   */
  canParse(filePath: string): boolean;
}

/**
 * Parser registry for managing multiple parsers
 */
export class ParserRegistry {
  private parsers: Map<string, DocumentParser> = new Map();

  /**
   * Register a parser
   */
  register(parser: DocumentParser): void {
    for (const ext of parser.supportedExtensions) {
      this.parsers.set(ext.toLowerCase(), parser);
    }
  }

  /**
   * Get parser for a specific file
   */
  getParser(filePath: string): DocumentParser | null {
    const ext = this.getFileExtension(filePath);
    return this.parsers.get(ext.toLowerCase()) || null;
  }

  /**
   * Parse a document using the appropriate parser
   */
  async parseDocument(filePath: string): Promise<ParsedDocument> {
    const parser = this.getParser(filePath);
    
    if (!parser) {
      throw new Error(`No parser available for file: ${filePath}`);
    }

    return parser.parse(filePath);
  }

  /**
   * List all supported extensions
   */
  getSupportedExtensions(): string[] {
    return Array.from(this.parsers.keys());
  }

  /**
   * Extract file extension
   */
  private getFileExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.');
    return lastDot !== -1 ? filePath.substring(lastDot) : '';
  }
}
