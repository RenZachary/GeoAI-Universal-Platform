/**
 * Custom error classes for SummaryGenerator
 */

export class SummaryError extends Error {
  constructor(message: string, public code: string = 'SUMMARY_ERROR') {
    super(message);
    this.name = 'SummaryError';
  }
}

export class TemplateLoadError extends SummaryError {
  constructor(templateName: string, language: string) {
    super(`Failed to load template '${templateName}' for language '${language}'`, 'TEMPLATE_LOAD_ERROR');
    this.name = 'TemplateLoadError';
  }
}

export class LLMGenerationError extends SummaryError {
  constructor(message: string) {
    super(`LLM generation failed: ${message}`, 'LLM_GENERATION_ERROR');
    this.name = 'LLMGenerationError';
  }
}

export class ContextPreparationError extends SummaryError {
  constructor(message: string) {
    super(`Context preparation failed: ${message}`, 'CONTEXT_PREPARATION_ERROR');
    this.name = 'ContextPreparationError';
  }
}

export class StreamingError extends SummaryError {
  constructor(message: string) {
    super(`Streaming failed: ${message}`, 'STREAMING_ERROR');
    this.name = 'StreamingError';
  }
}
