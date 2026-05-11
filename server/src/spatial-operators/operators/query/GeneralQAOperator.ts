/**
 * GeneralQAOperator - Handle general questions and conversational responses
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext, AnalyticalOutputSchema } from '../../SpatialOperator';

const GeneralQAInputSchema = z.object({
  question: z.string().describe('The user\'s question'),
  context: z.string().optional().describe('Conversation context'),
  responseStyle: z.enum(['conversational', 'formal', 'brief', 'detailed']).default('conversational')
});

// Output schema uses AnalyticalOutputSchema - QA returns textual/analytical results
const GeneralQAOutputSchema = AnalyticalOutputSchema.extend({
  data: z.object({
    answer: z.string().describe('The response to the user\'s question'),
    type: z.string().describe('Response type'),
    suggestions: z.array(z.string()).optional().describe('Follow-up suggestions')
  })
});

export class GeneralQAOperator extends SpatialOperator {
  readonly operatorId = 'general_qa';
  readonly name = 'General Q&A';
  readonly description = 'Handle general questions and provide conversational responses for non-GIS queries';
  readonly category = 'query' as const;
  readonly returnType = 'textual' as const; // Returns text response, terminal operation
  
  readonly inputSchema = GeneralQAInputSchema;
  readonly outputSchema = GeneralQAOutputSchema;
  
  constructor() {
    super();
  }
  
  protected async executeCore(
    params: z.infer<typeof GeneralQAInputSchema>,
    context: OperatorContext
  ): Promise<z.infer<typeof GeneralQAOutputSchema>> {
    // This operator is a placeholder - actual QA logic would be handled by LLM
    // For now, return a simple response structure
    console.log('[GeneralQAOperator] Processing question:', params.question);
    
    return {
      success: true,
      data: {
        answer: `Response to: ${params.question}`,
        type: 'general_response',
        suggestions: [
          'Ask me to visualize your data on a map',
          'Request spatial analysis like buffer or overlay',
          'Generate reports from your analysis results'
        ]
      },
      metadata: {
        operatorId: this.operatorId,
        executedAt: new Date().toISOString(),
        summary: `Answered general question`
      }
    };
  }
}
