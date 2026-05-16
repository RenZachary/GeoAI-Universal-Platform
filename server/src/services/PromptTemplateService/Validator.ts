import { ValidationError, TemplateConflictError } from './errors';
import type { CreateTemplateInput } from './types';
import fs from 'fs';

export class PromptTemplateValidator {
  validateCreateInput(input: CreateTemplateInput): void {
    if (!input.name || !input.content) {
      throw new ValidationError('Name and content are required');
    }
  }

  validateTemplateId(id: string): { name: string; language: string } {
    const lastUnderscoreIndex = id.lastIndexOf('_');
    if (lastUnderscoreIndex === -1) {
      throw new ValidationError(`Invalid template ID format: ${id}`);
    }
    
    const name = id.substring(0, lastUnderscoreIndex);
    const language = id.substring(lastUnderscoreIndex + 1);
    
    return { name, language };
  }

  checkTemplateExists(filePath: string, name: string, language: string): void {
    if (fs.existsSync(filePath)) {
      throw new TemplateConflictError(name, language);
    }
  }
}
