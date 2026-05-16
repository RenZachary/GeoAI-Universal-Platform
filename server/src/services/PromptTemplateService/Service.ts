import { PromptTemplateRepository } from './Repository';
import { PromptTemplateValidator } from './Validator';
import type { 
  PromptTemplateSummary, 
  PromptTemplateRecord, 
  CreateTemplateInput, 
  UpdateTemplateInput,
  TemplateListOptions 
} from './types';
import { DEFAULT_LANGUAGE } from './constant';
import path from 'path';
import fs from 'fs';

export class PromptTemplateService {
  private repository: PromptTemplateRepository;
  private validator: PromptTemplateValidator;
  private promptsBaseDir: string;

  constructor(workspaceBase: string) {
    this.promptsBaseDir = path.join(workspaceBase, 'llm', 'prompts');
    this.repository = new PromptTemplateRepository(this.promptsBaseDir);
    this.validator = new PromptTemplateValidator();
    
    this.ensurePromptsDirectory();
  }

  async listTemplates(options: TemplateListOptions = {}): Promise<PromptTemplateSummary[]> {
    try {
      return this.repository.listTemplates(options.language);
    } catch (error) {
      console.error('[PromptTemplateService] Error listing templates:', error);
      throw error;
    }
  }

  async getTemplate(id: string): Promise<PromptTemplateRecord> {
    try {
      const { name, language } = this.validator.validateTemplateId(id);
      return this.repository.getTemplate(name, language);
    } catch (error) {
      console.error('[PromptTemplateService] Error getting template:', error);
      throw error;
    }
  }

  async createTemplate(input: CreateTemplateInput): Promise<PromptTemplateRecord> {
    try {
      this.validator.validateCreateInput(input);

      const language = input.language || DEFAULT_LANGUAGE;
      const id = `${input.name}_${language}`.toLowerCase().replace(/\s+/g, '_');
      
      const filePath = path.join(this.promptsBaseDir, language, `${input.name}.md`);
      this.validator.checkTemplateExists(filePath, input.name, language);

      this.repository.saveTemplate(input.name, language, input.content, input.description);
      
      console.log(`[PromptTemplateService] Created template: ${id}`);

      return this.repository.getTemplate(input.name, language);
    } catch (error) {
      console.error('[PromptTemplateService] Error creating template:', error);
      throw error;
    }
  }

  async updateTemplate(id: string, input: UpdateTemplateInput): Promise<void> {
    try {
      const { name, language } = this.validator.validateTemplateId(id);
      
      const filePath = path.join(this.promptsBaseDir, language, `${name}.md`);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Template not found: ${id}`);
      }

      this.repository.updateTemplate(
        name, 
        language, 
        input.content!, 
        input.description
      );

      console.log(`[PromptTemplateService] Updated template: ${id}`);
    } catch (error) {
      console.error('[PromptTemplateService] Error updating template:', error);
      throw error;
    }
  }

  async deleteTemplate(id: string): Promise<void> {
    try {
      const { name, language } = this.validator.validateTemplateId(id);
      
      const filePath = path.join(this.promptsBaseDir, language, `${name}.md`);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Template not found: ${id}`);
      }

      this.repository.deleteTemplate(name, language);

      console.log(`[PromptTemplateService] Deleted template: ${id}`);
    } catch (error) {
      console.error('[PromptTemplateService] Error deleting template:', error);
      throw error;
    }
  }

  private ensurePromptsDirectory(): void {
    if (!fs.existsSync(this.promptsBaseDir)) {
      fs.mkdirSync(this.promptsBaseDir, { recursive: true });
      console.log(`[PromptTemplateService] Created prompts directory: ${this.promptsBaseDir}`);
    }
  }
}
