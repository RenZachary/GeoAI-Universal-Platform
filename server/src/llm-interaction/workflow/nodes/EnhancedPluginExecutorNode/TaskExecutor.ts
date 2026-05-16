/**
 * Task executor - handles individual task execution logic
 * Separates task execution concerns from orchestration
 */

import { ToolRegistryInstance } from '../../../tools/ToolRegistry';
import { resolvePlaceholders } from './PlaceholderResolver';
import { VirtualDataSourceManagerInstance } from '../../../../data-access/managers/VirtualDataSourceManager';
import type { AnalysisResult } from '../../GeoAIGraph';
import type { GeoAIStateType, ExecutionPlan } from '../../GeoAIGraph';
import { TaskNotFoundError, OperatorNotFoundError, ExecutionFailedError, ExecutorError } from './errors';
import { VISUALIZATION_CATEGORIES, SPATIAL_DATA_TYPES } from './constant';

export class TaskExecutor {
  /**
   * Find which plan contains a specific task
   */
  findTaskLocation(
    taskId: string,
    plans: Map<string, ExecutionPlan>
  ): { plan: ExecutionPlan; stepIndex: number } | null {
    for (const [goalId, plan] of plans.entries()) {
      const stepIdx = plan.steps.findIndex((s: any) => s.stepId === taskId);
      if (stepIdx !== -1) {
        return { plan, stepIndex: stepIdx };
      }
    }
    return null;
  }

  /**
   * Execute a single task with full error handling and result processing
   */
  async executeTask(
    taskId: string,
    plans: Map<string, ExecutionPlan>,
    results: Map<string, AnalysisResult>,
    state: GeoAIStateType
  ): Promise<AnalysisResult> {
    // Find task location
    const location = this.findTaskLocation(taskId, plans);
    
    if (!location) {
      throw new TaskNotFoundError(taskId);
    }

    const { plan, stepIndex } = location;
    const step = plan.steps[stepIndex];

    console.log(`[TaskExecutor] Executing step:`, {
      stepId: step.stepId,
      operatorId: step.operatorId,
      parameters: Object.keys(step.parameters || {})
    });

    // Get operator from registry
    const tool = ToolRegistryInstance.getTool(step.operatorId);

    if (!tool) {
      throw new OperatorNotFoundError(step.operatorId);
    }

    try {
      // Resolve placeholders in parameters
      const resolvedParameters = resolvePlaceholders(step.parameters, results);

      // Validate conversationId
      if (!state.conversationId) {
        throw new ExecutorError('Conversation ID is required for virtual data source registration', 'MISSING_CONVERSATION_ID');
      }

      // Register virtual data sources from previous steps
      this.registerVirtualDataSources(results, state.conversationId);

      // Execute the tool
      console.log(`[TaskExecutor] Executing task ${tool.name}...`);
      console.log(`[TaskExecutor] Task ${taskId} - resolvedParameters:`, resolvedParameters);
      const toolResult = await tool.invoke(resolvedParameters);

      // Parse result
      let parsedResult: any;
      try {
        parsedResult = typeof toolResult === 'string' ? JSON.parse(toolResult) : toolResult;
      } catch (error) {
        console.error(`[TaskExecutor] Failed to parse result:`, error);
        parsedResult = { success: false, error: 'Invalid result format' };
      }

      // Determine visualization needs and return type
      const { needsVisualization, returnType } = this.analyzeResult(parsedResult, taskId);

      // Build analysis result
      const result: AnalysisResult = {
        id: taskId,
        goalId: plan.goalId,
        status: parsedResult.success ? 'success' : 'failed',
        data: parsedResult.data || parsedResult,
        returnType: returnType,
        error: parsedResult.error,
        metadata: {
          ...parsedResult.metadata,
          executedAt: new Date().toISOString(),
          needsVisualization
        }
      };

      console.log(`[TaskExecutor] Task ${taskId} - stored result.data type:`, result.data?.type);
      console.log(`[TaskExecutor] Task ${taskId} - stored result.data reference:`, result.data?.reference);
      console.log(`[TaskExecutor] Task ${taskId} - stored result.data has metadata:`, !!result.data?.metadata);

      if (result.status === 'success') {
        console.log(`[TaskExecutor] Task ${taskId} completed successfully`);
      } else {
        console.error(`[TaskExecutor] Task ${taskId} failed:`, result.error);
      }

      return result;

    } catch (error) {
      console.error(`[TaskExecutor] Task ${taskId} execution error:`, error);
      throw new ExecutionFailedError(
        taskId,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Register virtual data sources from successful previous results
   */
  private registerVirtualDataSources(
    results: Map<string, AnalysisResult>,
    conversationId: string
  ): void {
    // Only register the most recent successful result to avoid redundant checks
    const recentResults = Array.from(results.entries()).slice(-5); // Last 5 results
    
    for (const [prevStepId, prevResult] of recentResults) {
      if (prevResult.status === 'success' && prevResult.data?.id) {
        const existingSource = VirtualDataSourceManagerInstance.getById(prevResult.data.id);
        if (!existingSource) {
          VirtualDataSourceManagerInstance.register({
            id: prevResult.data.id,
            conversationId,
            stepId: prevStepId,
            data: prevResult.data as any
          });
          console.log(`[TaskExecutor] Registered virtual source: ${prevResult.data.id}`);
        }
      }
    }
  }

  /**
   * Analyze result to determine visualization needs and return type
   */
  private analyzeResult(
    parsedResult: any,
    taskId: string
  ): { needsVisualization: boolean; returnType: 'spatial' | 'analytical' | 'textual' } {
    const operatorId = parsedResult.metadata?.operatorId;
    let needsVisualization = false;
    let returnType: 'spatial' | 'analytical' | 'textual' = 'spatial';

    if (operatorId) {
      const operator = ToolRegistryInstance.getOperator(operatorId);
      
      if (operator) {
        returnType = operator.returnType || 'spatial';
        console.log(`[TaskExecutor] Task ${taskId} - operator ${operatorId} has returnType: ${returnType}`);
      }
      
      // Check operator category OR if result is spatial NativeData
      if (operator && VISUALIZATION_CATEGORIES.includes(operator.category as any)) {
        needsVisualization = true;
        console.log(`[TaskExecutor] Task ${taskId} - operator ${operatorId} is visualization category, will publish MVT`);
      } else if (parsedResult.data?.type && SPATIAL_DATA_TYPES.includes(parsedResult.data.type as any)) {
        needsVisualization = true;
        console.log(`[TaskExecutor] Task ${taskId} - result has spatial type ${parsedResult.data.type}, will register as virtual data source`);
      }
    }

    return { needsVisualization, returnType };
  }
}
