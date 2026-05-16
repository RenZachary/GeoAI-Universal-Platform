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
