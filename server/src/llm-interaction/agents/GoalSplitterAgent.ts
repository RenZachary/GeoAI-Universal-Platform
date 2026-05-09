/**
 * Goal Splitter Agent - Analyzes user input and splits into analysis goals
 */

import { z } from 'zod';
import type { LLMConfig } from '../adapters/LLMAdapterFactory';
import { LLMAdapterFactory } from '../adapters/LLMAdapterFactory';
import type { PromptManager } from '../managers/PromptManager';
import type { GeoAIStateType, AnalysisGoal } from '../workflow/GeoAIGraph';
import { SpatialOperatorRegistryInstance } from '../../spatial-operators';
import { DataSourceSemanticAnalyzer } from '../analyzers/DataSourceSemanticAnalyzer';
import { DataSourceRepository } from '../../data-access';
import { SQLiteManagerInstance } from '../../storage/';

export class GoalSplitterAgent {
  private llmConfig: LLMConfig;
  private promptManager: PromptManager;
  private dataSourceAnalyzer: DataSourceSemanticAnalyzer;

  constructor(llmConfig: LLMConfig, promptManager: PromptManager) {
    this.llmConfig = llmConfig;
    this.promptManager = promptManager;
    
    // Initialize data source semantic analyzer
    const db = SQLiteManagerInstance.getDatabase();
    const dataSourceRepo = new DataSourceRepository(db);
    this.dataSourceAnalyzer = new DataSourceSemanticAnalyzer(dataSourceRepo);
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

      // Get all available operators from SpatialOperator Registry
      const operators = SpatialOperatorRegistryInstance.listOperators();
      
      console.log(`[Goal Splitter] Available operators: ${operators.length}`);
      
      // Format for LLM: include ID, name, description, and category
      const operatorsForLLM = operators.map(op => {
        return `${op.operatorId} (${op.category}): ${op.description}`;
      }).join('\n');

      // Analyze available data sources semantically
      console.log('[Goal Splitter] Analyzing available data sources...');
      const dataSourcesInfo = await this.dataSourceAnalyzer.analyzeAllDataSources();
      const dataSourcesForLLM = dataSourcesInfo.map(ds => {
        return `- ${ds.name} (${ds.category}): ${ds.description}\n  Use cases: ${ds.suggestedUseCases.join(', ')}`;
      }).join('\n\n');

      console.log(`[Goal Splitter] Found ${dataSourcesInfo.length} data sources`);

      // Define output schema for structured output
      const goalSchema = z.object({
        id: z.string().describe('Unique identifier for the goal'),
        description: z.string().describe('Detailed description of what to accomplish in natural language'),
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

      // Invoke with user input, available operators, and data sources
      const goals = await chain.invoke({
        userInput: state.userInput,
        availableExecutors: operatorsForLLM,
        availableDataSources: dataSourcesForLLM,
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
        id: `goal_${Date.now()}`,
        description: state.userInput,
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
