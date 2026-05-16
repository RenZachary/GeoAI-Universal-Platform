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
