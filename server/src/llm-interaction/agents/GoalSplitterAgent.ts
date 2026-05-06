/**
 * Goal Splitter Agent - Analyzes user input and splits into analysis goals
 */

import { z } from 'zod';
import type { LLMConfig } from '../adapters/LLMAdapterFactory';
import { LLMAdapterFactory } from '../adapters/LLMAdapterFactory';
import type { PromptManager } from '../managers/PromptManager';
import type { GeoAIStateType, AnalysisGoal } from '../workflow/GeoAIGraph';
import { ToolRegistryInstance } from '../../plugin-orchestration';

export class GoalSplitterAgent {
  private llmConfig: LLMConfig;
  private promptManager: PromptManager;

  constructor(llmConfig: LLMConfig, promptManager: PromptManager) {
    this.llmConfig = llmConfig;
    this.promptManager = promptManager;
  }

  /**
   * Execute goal splitting
   */
  async execute(state: GeoAIStateType): Promise<Partial<GeoAIStateType>> {
    console.log('[Goal Splitter] Analyzing user input...');

    try {
      // Load prompt template
      const promptTemplate = await this.promptManager.loadTemplate(
        'goal-splitting',
        'en-US'
      );

      // Get all available executor IDs from Tool Registry
      const availableExecutors = ToolRegistryInstance.getToolNames();
      console.log(`[Goal Splitter] Available executors: ${availableExecutors.length}`);

      // Define output schema for structured output
      const goalSchema = z.object({
        id: z.string().describe('Unique identifier for the goal'),
        description: z.string().describe('Detailed description of what to accomplish in natural language'),
        type: z.enum(['visualization', 'analysis', 'query', 'report']).describe('The category of the goal'),
        requiredExecutors: z.array(z.string()).describe('List of executor IDs needed to accomplish this goal'),
        priority: z.number().min(1).max(10).describe('Priority level (1-10)')
      });

      // Create LLM with structured output
      const llm = LLMAdapterFactory.createAdapter(this.llmConfig);
      const modelWithStructuredOutput = llm.withStructuredOutput(
        z.array(goalSchema),
        { name: 'goal_splitter' }
      );

      // Create chain
      const chain = promptTemplate.pipe(modelWithStructuredOutput);

      // Invoke with user input and available executors
      const goals = await chain.invoke({
        userInput: state.userInput,
        availableExecutors: availableExecutors.join(', '),
        timestamp: new Date().toISOString()
      }) as AnalysisGoal[];

      console.log(`[Goal Splitter] Identified ${goals.length} goals`);
      console.log(`[Goal Splitter] Goals:`, JSON.stringify(goals, null, 2));

      return {
        goals,
        currentStep: 'task_planning'
      };

    } catch (error) {
      console.error('[Goal Splitter] Failed to split goals:', error);
      
      // Fallback: Create a single generic goal
      const fallbackGoal: AnalysisGoal = {
        type: 'visualization',
        id: `goal_${Date.now()}`,
        description: state.userInput,
        requiredExecutors: [],  // Empty - let Task Planner figure it out
        priority: 5
      };

      return {
        goals: [fallbackGoal],
        currentStep: 'task_planning',
        errors: [
          ...(state.errors || []),
          {
            goalId: 'goal_splitter',
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        ]
      };
    }
  }
}
