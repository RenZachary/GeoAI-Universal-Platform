/**
 * Word Document Parser (.docx)
 * 
 * Uses mammoth library to extract text from Word documents.
 */

import fs from 'fs'; 
import mammoth from 'mammoth';
import type { ParsedDocument } from '../types';
import type { DocumentParser } from './DocumentParser';
import { wrapError } from '../../core';

export class WordParser implements DocumentParser {
  readonly supportedExtensions = ['.docx'];

  async parse(filePath: string): Promise<ParsedDocument> {
    try {
      // Read Word file
      const buffer = fs.readFileSync(filePath);

      // Extract text using mammoth
      const result = await mammoth.extractRawText({ buffer });

      return {
        text: result.value,
        metadata: {
          messages: result.messages // Any warnings during extraction
        }
      };

    } catch (error) {
      throw wrapError(error, `Failed to parse Word document '${filePath}'`);
    }
  }

  canParse(filePath: string): boolean {
    return filePath.toLowerCase().endsWith('.docx');
  }
}
