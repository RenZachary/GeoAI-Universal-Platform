/**
 * PDF Document Parser
 * 
 * Uses pdf-parse library to extract text from PDF files.
 */

import fs from 'fs/promises';
import pdfParse from 'pdf-parse';
import type { ParsedDocument } from '../types';
import type { DocumentParser } from './DocumentParser';
import { wrapError } from '../../core';

export class PdfParser implements DocumentParser {
  readonly supportedExtensions = ['.pdf'];

  async parse(filePath: string): Promise<ParsedDocument> {
    try {
      // Read PDF file
      const dataBuffer = await fs.readFile(filePath);

      // Parse PDF
      const result = await pdfParse(dataBuffer);

      return {
        text: result.text,
        metadata: {
          pageCount: result.numpages,
          title: result.info?.Title,
          author: result.info?.Author,
          subject: result.info?.Subject,
          creator: result.info?.Creator,
          producer: result.info?.Producer,
          createdAt: result.info?.CreationDate ? new Date(result.info.CreationDate) : undefined
        }
      };

    } catch (error) {
      throw wrapError(error, `Failed to parse PDF '${filePath}'`);
    }
  }

  canParse(filePath: string): boolean {
    return filePath.toLowerCase().endsWith('.pdf');
  }

  /**
   * Count words in text (handles Chinese and English)
   */
  private countWords(text: string): number {
    // Split by whitespace and punctuation for English
    // Chinese characters are counted individually
    const englishWords = text.match(/[a-zA-Z0-9]+/g) || [];
    const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
    
    return englishWords.length + chineseChars.length;
  }
}
