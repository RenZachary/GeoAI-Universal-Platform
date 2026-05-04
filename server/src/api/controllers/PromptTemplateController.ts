/**
 * Prompt Template Controller - HTTP Layer for Prompt Template Management
 * 
 * Responsibilities:
 * - HTTP request/response handling
 * - Input validation with Zod
 * - Response formatting
 * - Error handling (HTTP status codes)
 * 
 * Note: All business logic delegated to PromptTemplateService
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import type { PromptTemplateService } from '../../services';
import { 
  PromptTemplateError, 
  TemplateNotFoundError, 
  TemplateConflictError,
  ValidationError 
} from '../../services/PromptTemplateService';

// ============================================================================
// Zod Validation Schemas
// ============================================================================

const CreateTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  language: z.string().optional().default('en-US'),
  content: z.string().min(1, 'Content is required'),
  description: z.string().optional(),
  version: z.string().optional().default('1.0.0')
});

const UpdateTemplateSchema = z.object({
  content: z.string().min(1).optional(),
  description: z.string().optional(),
  version: z.string().optional()
}).refine(data => {
  // At least one field must be provided
  return Object.keys(data).length > 0;
}, {
  message: 'At least one field (content, description, or version) must be provided'
});

const ListTemplatesQuerySchema = z.object({
  language: z.string().optional()
});

// ============================================================================
// Controller Implementation
// ============================================================================

export class PromptTemplateController {
  private promptTemplateService: PromptTemplateService;

  constructor(promptTemplateService: PromptTemplateService) {
    this.promptTemplateService = promptTemplateService;
  }

  /**
   * List all prompt templates
   * GET /api/prompt-templates
   */
  async listTemplates(req: Request, res: Response): Promise<void> {
    try {
      // Validate query parameters
      const query = ListTemplatesQuerySchema.parse(req.query);
      
      console.log(`[PromptTemplateController] Listing templates${query.language ? ` for language: ${query.language}` : ''}`);
      
      // Delegate to service
      const templates = await this.promptTemplateService.listTemplates(query);
      
      res.json({
        success: true,
        count: templates.length,
        templates
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      } else {
        this.handleError(res, error);
      }
    }
  }

  /**
   * Get a specific prompt template
   * GET /api/prompt-templates/:id
   */
  async getTemplate(req: Request, res: Response): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      
      console.log(`[PromptTemplateController] Getting template: ${id}`);
      
      // Delegate to service
      const template = await this.promptTemplateService.getTemplate(id);
      
      res.json({
        success: true,
        template
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Create a new prompt template
   * POST /api/prompt-templates
   */
  async createTemplate(req: Request, res: Response): Promise<void> {
    try {
      // Validate input
      const input = CreateTemplateSchema.parse(req.body);
      
      console.log(`[PromptTemplateController] Creating template: ${input.name} (${input.language})`);
      
      // Delegate to service
      const template = await this.promptTemplateService.createTemplate(input);
      
      res.status(201).json({
        success: true,
        template: {
          id: template.id,
          name: template.name,
          language: template.language,
          description: template.description,
          version: template.version,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      } else {
        this.handleError(res, error);
      }
    }
  }

  /**
   * Update an existing prompt template
   * PUT /api/prompt-templates/:id
   */
  async updateTemplate(req: Request, res: Response): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      
      // Validate input
      const input = UpdateTemplateSchema.parse(req.body);
      
      console.log(`[PromptTemplateController] Updating template: ${id}`);
      
      // Delegate to service
      await this.promptTemplateService.updateTemplate(id, input);
      
      res.json({
        success: true,
        message: 'Template updated successfully'
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      } else {
        this.handleError(res, error);
      }
    }
  }

  /**
   * Delete a prompt template
   * DELETE /api/prompt-templates/:id
   */
  async deleteTemplate(req: Request, res: Response): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      
      console.log(`[PromptTemplateController] Deleting template: ${id}`);
      
      // Delegate to service
      await this.promptTemplateService.deleteTemplate(id);
      
      res.json({
        success: true,
        message: 'Template deleted successfully'
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Unified error handler
   */
  private handleError(res: Response, error: unknown): void {
    console.error('[PromptTemplateController] Error:', error);
    
    if (error instanceof TemplateNotFoundError) {
      res.status(404).json({
        success: false,
        error: error.message,
        code: error.code
      });
    } else if (error instanceof TemplateConflictError) {
      res.status(409).json({
        success: false,
        error: error.message,
        code: error.code
      });
    } else if (error instanceof ValidationError) {
      res.status(400).json({
        success: false,
        error: error.message,
        code: error.code
      });
    } else if (error instanceof PromptTemplateError) {
      res.status(500).json({
        success: false,
        error: error.message,
        code: error.code
      });
    } else {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }
}
