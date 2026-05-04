/**
 * Service Layer - Business Logic Orchestration
 * 
 * Services encapsulate business logic and coordinate between:
 * - Controllers (HTTP layer)
 * - Repositories (Data access layer)
 * - External systems (LLM, plugins, file system)
 */

export { DataSourceService } from './DataSourceService';
export type { PostGISConnectionConfig, ConnectionInfo, RegisteredDataSource } from './DataSourceService';

export { FileUploadService } from './FileUploadService';
export type { UploadedFile, UploadResult, ShapefileComponents } from './FileUploadService';

export { PromptTemplateService } from './PromptTemplateService';
export type { 
  PromptTemplateRecord, 
  PromptTemplateSummary,
  CreateTemplateInput, 
  UpdateTemplateInput, 
  TemplateListOptions 
} from './PromptTemplateService';

export { LLMConfigManager } from './LLMConfigService';
export type { StoredLLMConfig } from './LLMConfigService';
