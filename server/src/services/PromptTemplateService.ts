/**
 * Prompt Template Service - Business Logic for Prompt Template Management
 * 
 * Responsibilities:
 * - Template CRUD operations using filesystem only (no database)
 * - Filesystem synchronization with PromptManager
 * - Validation and conflict detection
 * - Support for built-in prompts in workspace/llm/prompts directory
 */

import { PromptManager } from '../llm-interaction';
import path from 'path';
import fs from 'fs';

// ============================================================================
// Type Definitions
// ============================================================================

export interface PromptTemplateSummary {
  id: string;
  name: string;
  language: string;
  description?: string;
  version: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PromptTemplateRecord extends PromptTemplateSummary {
  content: string;
}

export interface CreateTemplateInput {
  name: string;
  language?: string;
  content: string;
  description?: string;
  version?: string;
}

export interface UpdateTemplateInput {
  content?: string;
  description?: string;
  version?: string;
}

export interface TemplateListOptions {
  language?: string;
}

// ============================================================================
// Custom Error Classes
// ============================================================================

export class PromptTemplateError extends Error {
  constructor(message: string, public code: string = 'PROMPT_TEMPLATE_ERROR') {
    super(message);
    this.name = 'PromptTemplateError';
  }
}

export class TemplateNotFoundError extends PromptTemplateError {
  constructor(id: string) {
    super(`Template not found: ${id}`, 'TEMPLATE_NOT_FOUND');
    this.name = 'TemplateNotFoundError';
  }
}

export class TemplateConflictError extends PromptTemplateError {
  constructor(name: string, language: string) {
    super(`Template '${name}' already exists for language '${language}'`, 'TEMPLATE_CONFLICT');
    this.name = 'TemplateConflictError';
  }
}

export class ValidationError extends PromptTemplateError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

// ============================================================================
// Service Implementation
// ============================================================================

export class PromptTemplateService {
  private promptManager: PromptManager;
  private workspaceBase: string;
  private promptsBaseDir: string;

  constructor(workspaceBase: string) {
    this.workspaceBase = workspaceBase;
    this.promptsBaseDir = path.join(workspaceBase, 'llm', 'prompts');
    this.promptManager = new PromptManager(workspaceBase);
    
    // Ensure prompts directory exists
    this.ensurePromptsDirectory();
  }

  /**
   * Ensure prompts base directory exists
   */
  private ensurePromptsDirectory(): void {
    if (!fs.existsSync(this.promptsBaseDir)) {
      fs.mkdirSync(this.promptsBaseDir, { recursive: true });
      console.log(`[PromptTemplateService] Created prompts directory: ${this.promptsBaseDir}`);
    }
  }

  /**
   * List all prompt templates with optional filtering
   */
  async listTemplates(options: TemplateListOptions = {}): Promise<PromptTemplateSummary[]> {
    try {
      const templates: PromptTemplateSummary[] = [];
      
      // Determine which language directories to scan
      let languagesToScan: string[];
      if (options.language) {
        languagesToScan = [options.language];
      } else {
        // Scan all language directories
        if (!fs.existsSync(this.promptsBaseDir)) {
          return [];
        }
        languagesToScan = fs.readdirSync(this.promptsBaseDir).filter(dir => {
          const fullPath = path.join(this.promptsBaseDir, dir);
          return fs.statSync(fullPath).isDirectory();
        });
      }
      
      // Scan each language directory for .md files
      for (const language of languagesToScan) {
        const langDir = path.join(this.promptsBaseDir, language);
        
        if (!fs.existsSync(langDir)) {
          continue;
        }
        
        const files = fs.readdirSync(langDir).filter(file => file.endsWith('.md'));
        
        for (const file of files) {
          const filePath = path.join(langDir, file);
          const stats = fs.statSync(filePath);
          const content = fs.readFileSync(filePath, 'utf-8');
          const name = file.replace('.md', '');
          const id = `${name}_${language}`.toLowerCase().replace(/\s+/g, '_');
          
          // Extract description from first line if it's a comment
          const lines = content.split('\n');
          let description: string | undefined;
          if (lines[0].startsWith('<!--') && lines[0].endsWith('-->')) {
            description = lines[0].slice(4, -3).trim();
          }
          
          templates.push({
            id,
            name,
            language,
            description,
            version: '1.0.0', // Default version for file-based templates
            createdAt: stats.birthtime,
            updatedAt: stats.mtime
          });
        }
      }
      
      // Sort by name
      templates.sort((a, b) => a.name.localeCompare(b.name));
      
      return templates;
    } catch (error) {
      console.error('[PromptTemplateService] Error listing templates:', error);
      throw new PromptTemplateError(
        error instanceof Error ? error.message : 'Failed to list templates'
      );
    }
  }

  /**
   * Get a specific prompt template by ID
   */
  async getTemplate(id: string): Promise<PromptTemplateRecord> {
    try {
      // Parse ID to extract name and language
      // ID format: "name_language" (e.g., "goal-splitting_en-us")
      const lastUnderscoreIndex = id.lastIndexOf('_');
      if (lastUnderscoreIndex === -1) {
        throw new ValidationError(`Invalid template ID format: ${id}`);
      }
      
      const name = id.substring(0, lastUnderscoreIndex);
      const language = id.substring(lastUnderscoreIndex + 1);
      
      const filePath = path.join(this.promptsBaseDir, language, `${name}.md`);
      
      if (!fs.existsSync(filePath)) {
        throw new TemplateNotFoundError(id);
      }
      
      const stats = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Extract description from first line if it's a comment
      const lines = content.split('\n');
      let description: string | undefined;
      if (lines[0].startsWith('<!--') && lines[0].endsWith('-->')) {
        description = lines[0].slice(4, -3).trim();
      }

      return {
        id,
        name,
        language,
        content,
        description,
        version: '1.0.0',
        createdAt: stats.birthtime,
        updatedAt: stats.mtime
      };
    } catch (error) {
      if (error instanceof TemplateNotFoundError || error instanceof ValidationError) {
        throw error;
      }
      console.error('[PromptTemplateService] Error getting template:', error);
      throw new PromptTemplateError(
        error instanceof Error ? error.message : 'Failed to get template'
      );
    }
  }

  /**
   * Create a new prompt template
   */
  async createTemplate(input: CreateTemplateInput): Promise<PromptTemplateRecord> {
    try {
      // Validate required fields
      if (!input.name || !input.content) {
        throw new ValidationError('Name and content are required');
      }

      const language = input.language || 'en-US';
      const id = `${input.name}_${language}`.toLowerCase().replace(/\s+/g, '_');
      
      // Check if template with same name and language already exists
      const filePath = path.join(this.promptsBaseDir, language, `${input.name}.md`);
      if (fs.existsSync(filePath)) {
        throw new TemplateConflictError(input.name, language);
      }

      // Ensure language directory exists
      const langDir = path.join(this.promptsBaseDir, language);
      if (!fs.existsSync(langDir)) {
        fs.mkdirSync(langDir, { recursive: true });
      }

      // Add description as HTML comment at the top if provided
      let fileContent = input.content;
      if (input.description) {
        fileContent = `<!-- ${input.description} -->\n${input.content}`;
      }

      // Write to filesystem
      fs.writeFileSync(filePath, fileContent, 'utf-8');
      
      const stats = fs.statSync(filePath);
      const now = stats.birthtime;

      console.log(`[PromptTemplateService] Created template: ${id}`);

      return {
        id,
        name: input.name,
        language,
        content: input.content,
        description: input.description,
        version: input.version || '1.0.0',
        createdAt: now,
        updatedAt: now
      };
    } catch (error) {
      if (error instanceof PromptTemplateError) {
        throw error;
      }
      console.error('[PromptTemplateService] Error creating template:', error);
      throw new PromptTemplateError(
        error instanceof Error ? error.message : 'Failed to create template'
      );
    }
  }

  /**
   * Update an existing prompt template
   */
  async updateTemplate(id: string, input: UpdateTemplateInput): Promise<void> {
    try {
      // Parse ID to extract name and language
      const lastUnderscoreIndex = id.lastIndexOf('_');
      if (lastUnderscoreIndex === -1) {
        throw new ValidationError(`Invalid template ID format: ${id}`);
      }
      
      const name = id.substring(0, lastUnderscoreIndex);
      const language = id.substring(lastUnderscoreIndex + 1);
      
      const filePath = path.join(this.promptsBaseDir, language, `${name}.md`);

      if (!fs.existsSync(filePath)) {
        throw new TemplateNotFoundError(id);
      }

      // Read existing content
      const existingContent = fs.readFileSync(filePath, 'utf-8');
      const lines = existingContent.split('\n');
      
      // Extract existing description if present
      let existingDescription: string | undefined;
      let contentStartIndex = 0;
      if (lines[0].startsWith('<!--') && lines[0].endsWith('-->')) {
        existingDescription = lines[0].slice(4, -3).trim();
        contentStartIndex = 1;
      }
      
      const existingContentBody = lines.slice(contentStartIndex).join('\n');

      // Build updated content
      const newDescription = input.description !== undefined ? input.description : existingDescription;
      const newContent = input.content !== undefined ? input.content : existingContentBody;
      
      let fileContent = newContent;
      if (newDescription) {
        fileContent = `<!-- ${newDescription} -->\n${newContent}`;
      }

      // Write to filesystem
      fs.writeFileSync(filePath, fileContent, 'utf-8');

      console.log(`[PromptTemplateService] Updated template: ${id}`);
    } catch (error) {
      if (error instanceof PromptTemplateError) {
        throw error;
      }
      console.error('[PromptTemplateService] Error updating template:', error);
      throw new PromptTemplateError(
        error instanceof Error ? error.message : 'Failed to update template'
      );
    }
  }

  /**
   * Delete a prompt template
   */
  async deleteTemplate(id: string): Promise<void> {
    try {
      // Parse ID to extract name and language
      const lastUnderscoreIndex = id.lastIndexOf('_');
      if (lastUnderscoreIndex === -1) {
        throw new ValidationError(`Invalid template ID format: ${id}`);
      }
      
      const name = id.substring(0, lastUnderscoreIndex);
      const language = id.substring(lastUnderscoreIndex + 1);
      
      const filePath = path.join(this.promptsBaseDir, language, `${name}.md`);

      if (!fs.existsSync(filePath)) {
        throw new TemplateNotFoundError(id);
      }

      // Delete from filesystem
      fs.unlinkSync(filePath);

      console.log(`[PromptTemplateService] Deleted template: ${id}`);
    } catch (error) {
      if (error instanceof PromptTemplateError) {
        throw error;
      }
      console.error('[PromptTemplateService] Error deleting template:', error);
      throw new PromptTemplateError(
        error instanceof Error ? error.message : 'Failed to delete template'
      );
    }
  }
}
