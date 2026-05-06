/**
 * Service Layer - Business Logic Orchestration
 * 
 * Services encapsulate business logic and coordinate between:
 * - Controllers (HTTP layer)
 * - Repositories (Data access layer)
 * - External systems (LLM, plugins, file system)
 */

export { DataSourceService } from './DataSourceService';
export type { ConnectionInfo, RegisteredDataSource } from './DataSourceService';
export type { PostGISConnectionConfig } from '../core';

export { ResultPersistenceService } from './ResultPersistenceService';

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

export { LLMConfigManagerInstance } from './LLMConfigService';
export type { StoredLLMConfig } from './LLMConfigService';

export { ConversationService } from './ConversationService';
export type { ConversationSummary, ChatMessage } from './ConversationService';

// MVTDynamicPublisher Singleton (re-export from utils)
export { getMVTOnDemandPublisher, resetMVTOnDemandPublisher, MVTOnDemandPublisher } from '../utils/publishers/MVTOnDemandPublisher';
