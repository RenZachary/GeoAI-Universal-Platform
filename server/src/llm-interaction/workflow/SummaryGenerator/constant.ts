/**
 * Constants for SummaryGenerator
 */

export const DEFAULT_LANGUAGE = 'en-US';

export const TEMPLATE_NAMES = {
  SUMMARY: 'response-summary',
  CHAT_RESPONSE: 'chat-response',
  KNOWLEDGE_ANSWER: 'knowledge-answer'
} as const;

export const SERVICE_TYPE_ICONS: Record<string, string> = {
  mvt: '🗺️',
  image: '🖼️',
  report: '📄'
} as const;

export const DEFAULT_SERVICE_ICON = '📄';

export const FALLBACK_MESSAGES = {
  NO_LLM_CONFIG: 'I understand your message. How can I help you with spatial analysis or knowledge queries?',
  CHAT_FAILED: 'I understand. How can I assist you today?',
  NO_KB_CONTEXT: 'I could not find relevant information in the knowledge base.',
  KB_ANSWER_FAILED: 'I found some relevant documents but encountered an error generating the answer.',
  LLM_NOT_CONFIGURED: 'LLM is not configured. Please check your settings.'
} as const;
