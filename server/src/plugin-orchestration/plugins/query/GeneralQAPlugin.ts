/**
 * General Q&A Plugin
 * Handles general questions, explanations, and conversational responses that are not GIS-related
 */

import type { Plugin } from '../../../core/index';

export const GeneralQAPlugin: Plugin = {
  id: 'general_qa',
  name: 'General Q&A',
  version: '1.0.0',
  description: 'Handle general questions, provide explanations, and generate conversational responses for non-GIS queries',
  category: 'utility',
  inputSchema: [
    {
      name: 'question',
      type: 'string',
      required: true,
      description: 'The user\'s question or query'
    },
    {
      name: 'context',
      type: 'string',
      required: false,
      description: 'Additional context from conversation history'
    },
    {
      name: 'responseStyle',
      type: 'string',
      required: false,
      defaultValue: 'conversational',
      description: 'Response style: conversational, formal, brief, or detailed'
    }
  ],
  outputSchema: {
    type: 'native_data',
    description: 'Text-based response to general questions',
    outputFields: [
      {
        name: 'result',
        type: 'object',
        description: 'Q&A response object',
        example: {
          answer: 'I can help you with geospatial analysis tasks including data visualization, spatial analysis, and report generation.',
          type: 'capability_explanation',
          suggestions: [
            'Ask me to visualize your data on a map',
            'Request spatial analysis like buffer or overlay',
            'Generate reports from your analysis results'
          ]
        }
      },
      {
        name: 'format',
        type: 'string',
        description: 'Output format',
        example: 'text'
      }
    ]
  },
  capabilities: ['conversational', 'explanation', 'capability_description', 'general_knowledge'],
  isBuiltin: true,
  installedAt: new Date()
};
