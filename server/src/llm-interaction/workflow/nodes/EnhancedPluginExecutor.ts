/**
 * EnhancedPluginExecutor - Supports parallel execution with dependency management
 * 
 * This executor enhances the basic plugin execution with:
 * - Parallel task group execution
 * - Intermediate result persistence
 * - Exception rollback and recovery
 * - Performance monitoring
 */

import type { GeoAIStateType, ExecutionPlan, AnalysisResult } from '../GeoAIGraph';
import type { ParallelGroup } from '../../analyzers/ParallelTaskAnalyzer';
import { ToolRegistryInstance } from '../../tools/ToolRegistry';
import { resolvePlaceholders } from '../PlaceholderResolver';
import { VirtualDataSourceManagerInstance } from '../../../data-access/managers/VirtualDataSourceManager';
import type Database from 'better-sqlite3';
import { SQLiteManagerInstance } from '../../../storage/';

export interface ExecutionMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  startTime: number;
  endTime?: number;
  parallelGroups: number;
  executionMode: 'sequential' | 'parallel' | 'hybrid';
}

export class EnhancedPluginExecutor {
  private db: Database.Database | null = null;
  private metrics: ExecutionMetrics | null = null;

  constructor() {
    // Database will be initialized lazily on first use
  }

  /**
   * Get database instance (lazy initialization)
   */
  private getDatabase(): Database.Database {
    if (!this.db) {
      this.db = SQLiteManagerInstance.getDatabase();
    }
    return this.db;
  }

  /**
   * Execute all plans with parallel support
   */
  async executeWithParallelSupport(
    state: GeoAIStateType,
    streamWriter?: any
  ): Promise<Partial<GeoAIStateType>> {
    if (!state.executionPlans || state.executionPlans.size === 0) {
      return {
        executionResults: new Map(),
        currentStep: 'output'
      };
    }

    // Initialize metrics
    this.metrics = {
      totalTasks: this.countTotalTasks(state.executionPlans),
      completedTasks: 0,
      failedTasks: 0,
      startTime: Date.now(),
      parallelGroups: state.parallelGroups?.length || 0,
      executionMode: state.executionMode || 'sequential'
    };

    const executionResults = new Map<string, AnalysisResult>();

    try {
      // Check if we have parallel groups
      if (state.parallelGroups && state.parallelGroups.length > 0) {
        // Execute using parallel groups
        await this.executeParallelGroups(
          state.executionPlans,
          state.parallelGroups,
          executionResults,
          state,
          streamWriter
        );
      } else {
        // Fallback to sequential execution
        await this.executeSequentially(
          state.executionPlans,
          executionResults,
          state,
          streamWriter
        );
      }

      // Finalize metrics
      this.metrics.endTime = Date.now();

      return {
        executionResults,
        currentStep: 'output'
      };

    } catch (error) {
      return {
        executionResults,
        currentStep: 'output',
        errors: [
          ...(state.errors || []),
          { goalId: 'global', error: `Execution failed: ${error instanceof Error ? error.message : String(error)}` }
        ]
      };
    }
  }

  /**
   * Execute tasks in parallel groups
   */
  private async executeParallelGroups(
    plans: Map<string, ExecutionPlan>,
    parallelGroups: ParallelGroup[],
    results: Map<string, AnalysisResult>,
    state: GeoAIStateType,
    streamWriter?: any
  ): Promise<void> {
    for (let groupIndex = 0; groupIndex < parallelGroups.length; groupIndex++) {
      const group = parallelGroups[groupIndex];

      if (group.tasks.length === 1) {
        // Single task - execute sequentially
        const taskId = group.tasks[0];
        await this.executeSingleTask(taskId, plans, results, state, streamWriter);
      } else {
        // Multiple tasks - execute in parallel
        const taskPromises = group.tasks.map(async (taskId: string) => {
        await this.executeSingleTask(taskId, plans, results, state, streamWriter);
        });

        // Wait for all tasks in the group to complete
        await Promise.allSettled(taskPromises);
      }
    }
  }

  /**
   * Execute a single task
   */
  private async executeSingleTask(
    taskId: string,
    plans: Map<string, ExecutionPlan>,
    results: Map<string, AnalysisResult>,
    state: GeoAIStateType,
    streamWriter?: any
  ): Promise<void> {
    // Find which plan contains this task
    let targetPlan: ExecutionPlan | undefined;
    let stepIndex = -1;

    for (const [goalId, plan] of plans.entries()) {
      const stepIdx = plan.steps.findIndex((s: any) => s.stepId === taskId);
      if (stepIdx !== -1) {
        targetPlan = plan;
        stepIndex = stepIdx;
        break;
      }
    }

    if (!targetPlan || stepIndex === -1) {
      console.error(`[Enhanced Executor] Task ${taskId} not found in any plan`);
      results.set(taskId, {
        id: taskId,
        goalId: 'unknown',
        status: 'failed',
        error: `Task not found: ${taskId}`
      });
      if (this.metrics) {
        this.metrics.failedTasks++;
      }
      return;
    }

    const step = targetPlan.steps[stepIndex];

    // Debug: Log step details
    console.log(`[Enhanced Executor] Executing step:`, {
      stepId: step.stepId,
      operatorId: step.operatorId,
      parameters: Object.keys(step.parameters || {})
    });

    try {
      // Get the operator from registry (using operatorId)
      const tool = ToolRegistryInstance.getTool(step.operatorId);

      if (!tool) {
        console.error(`[Enhanced Executor] Operator not found: ${step.operatorId}`);
        results.set(taskId, {
          id: taskId,
          goalId: targetPlan.goalId,
          status: 'failed',
          error: `Operator not found: ${step.operatorId}`
        });
        if (this.metrics) {
          this.metrics.failedTasks++;
        }
        return;
      }

      // Resolve placeholders in parameters
      const resolvedParameters = resolvePlaceholders(step.parameters, results);

      // Register virtual data sources from previous steps immediately if they haven't been yet
      // This ensures that tasks in the same workflow can reference each other's outputs
      for (const [prevStepId, prevResult] of results.entries()) {
        if (prevResult.status === 'success' && prevResult.data?.id) {
          // Check if this result is already registered as a virtual source
          const existingSource = VirtualDataSourceManagerInstance.getById(prevResult.data.id);
          if (!existingSource) {
            VirtualDataSourceManagerInstance.register({
              id: prevResult.data.id,
              conversationId: state.conversationId,
              stepId: prevStepId,
              data: prevResult.data as any
            });
            console.log(`[Enhanced Executor] Early registration of virtual source: ${prevResult.data.id}`);
          }
        }
      }

      // Send tool_start event
      if (streamWriter) {
        streamWriter.write(`data: ${JSON.stringify({
          type: 'tool_start',
          tool: step.operatorId,
          taskId: taskId,
          input: JSON.stringify(resolvedParameters).substring(0, 200),
          timestamp: Date.now()
        })}\n\n`);
      }

      // Execute the tool
      const toolResult = await tool.invoke(resolvedParameters);

      // Parse result
      let parsedResult: any;
      try {
        parsedResult = typeof toolResult === 'string' ? JSON.parse(toolResult) : toolResult;
      } catch (error) {
        console.error(`[Enhanced Executor] Failed to parse result:`, error);
        parsedResult = { success: false, error: 'Invalid result format' };
      }

      // Store result
      console.log(`[Enhanced Executor] Task ${taskId} - parsedResult structure:`, {
        hasSuccess: 'success' in parsedResult,
        success: parsedResult.success,
        hasData: 'data' in parsedResult,
        dataType: typeof parsedResult.data,
        dataKeys: parsedResult.data ? Object.keys(parsedResult.data) : []
      });

      // Check if this operator produces visualization-ready NativeData
      const operatorId = parsedResult.metadata?.operatorId;
      let needsVisualization = false;
      let returnType: 'spatial' | 'analytical' | 'textual' = 'spatial'; // Default

      if (operatorId) {
        const operator = ToolRegistryInstance.getOperator(operatorId);
        
        // Get return type from operator metadata
        if (operator) {
          returnType = operator.returnType || 'spatial';
          console.log(`[Enhanced Executor] Task ${taskId} - operator ${operatorId} has returnType: ${returnType}`);
        }
        
        // Check operator category OR if result is spatial NativeData
        if (operator && operator.category === 'visualization') {
          needsVisualization = true;
          console.log(`[Enhanced Executor] Task ${taskId} - operator ${operatorId} is visualization category, will publish MVT`);
        } else if (parsedResult.data?.type && ['postgis', 'geojson', 'shapefile'].includes(parsedResult.data.type)) {
          // Spatial data types should be visualized regardless of operator category
          needsVisualization = true;
          console.log(`[Enhanced Executor] Task ${taskId} - result has spatial type ${parsedResult.data.type}, will register as virtual data source`);
        }
      }

      const result: AnalysisResult = {
        id: taskId,
        goalId: targetPlan.goalId,
        status: parsedResult.success ? 'success' : 'failed',
        data: parsedResult.data || parsedResult,
        returnType: returnType, // NEW: Store return type for placeholder resolution
        error: parsedResult.error,
        metadata: {
          // Preserve operator metadata from tool execution
          ...parsedResult.metadata,  // Contains operatorId, executedAt, etc.
          executedAt: new Date().toISOString(),
          needsVisualization  // Add flag for GeoAIGraph
        }
      };

      console.log(`[Enhanced Executor] Task ${taskId} - stored result.data type:`, result.data?.type);
      console.log(`[Enhanced Executor] Task ${taskId} - stored result.data reference:`, result.data?.reference);
      console.log(`[Enhanced Executor] Task ${taskId} - stored result.data has metadata:`, !!result.data?.metadata);

      results.set(taskId, result);

      // Persist intermediate result
      await this.persistIntermediateResult(taskId, result);

      // Send tool_complete event
      if (streamWriter) {
        streamWriter.write(`data: ${JSON.stringify({
          type: 'tool_complete',
          tool: step.operatorId,
          taskId: taskId,
          output: JSON.stringify(parsedResult).substring(0, 2000),
          timestamp: Date.now()
        })}\n\n`);
      }

      if (result.status === 'success') {
        console.log(`[Enhanced Executor] Task ${taskId} completed successfully`);
      } else {
        console.error(`[Enhanced Executor] Task ${taskId} failed:`, result.error);
      }
      
      if (this.metrics) {
        this.metrics.completedTasks++;
      }

    } catch (error) {
      console.error(`[Enhanced Executor] Task ${taskId} execution error:`, error);

      results.set(taskId, {
        id: taskId,
        goalId: targetPlan.goalId,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      });
      
      if (this.metrics) {
        this.metrics.failedTasks++;
      }
    }
  }

  /**
   * Execute all tasks sequentially (fallback)
   */
  private async executeSequentially(
    plans: Map<string, ExecutionPlan>,
    results: Map<string, AnalysisResult>,
    state: GeoAIStateType,
    streamWriter?: any
  ): Promise<void> {
    console.log('[Enhanced Executor] Executing sequentially (no parallel groups)...');

    for (const [goalId, plan] of plans.entries()) {
      console.log(`\n[Enhanced Executor] === Goal: ${goalId} ===`);

      for (const step of plan.steps) {
        await this.executeSingleTask(step.stepId, plans, results, state, streamWriter);
      }
    }
  }

  /**
   * Persist intermediate result to database
   */
  private async persistIntermediateResult(taskId: string, result: AnalysisResult): Promise<void> {
    try {
      // Create table if not exists
      this.getDatabase().exec(`
        CREATE TABLE IF NOT EXISTS intermediate_results (
          task_id TEXT PRIMARY KEY,
          goal_id TEXT,
          status TEXT,
          result_data TEXT,
          error TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Insert or replace result
      this.getDatabase().prepare(`
        INSERT OR REPLACE INTO intermediate_results (task_id, goal_id, status, result_data, error)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        taskId,
        result.goalId,
        result.status,
        JSON.stringify(result.data || null),
        result.error || null
      );

      console.log(`[Enhanced Executor] Persisted intermediate result for task ${taskId}`);
    } catch (error) {
      console.warn(`[Enhanced Executor] Failed to persist result for ${taskId}:`, error);
      // Don't fail execution if persistence fails
    }
  }

  /**
   * Load persisted intermediate results
   */
  loadPersistedResults(): Map<string, AnalysisResult> {
    const results = new Map<string, AnalysisResult>();

    try {
      const rows = this.getDatabase().prepare(`
        SELECT task_id, goal_id, status, result_data, error, created_at
        FROM intermediate_results
        ORDER BY created_at
      `).all() as any[];

      for (const row of rows) {
        results.set(row.task_id, {
          id: row.task_id,
          goalId: row.goal_id,
          status: row.status,
          data: row.result_data ? JSON.parse(row.result_data) : null,
          error: row.error,
          metadata: {
            executedAt: row.created_at
          }
        });
      }

      console.log(`[Enhanced Executor] Loaded ${results.size} persisted results`);
    } catch (error) {
      console.warn('[Enhanced Executor] Failed to load persisted results:', error);
    }

    return results;
  }

  /**
   * Clear persisted results
   */
  clearPersistedResults(): void {
    try {
      this.getDatabase().exec('DELETE FROM intermediate_results');
      console.log('[Enhanced Executor] Cleared all persisted results');
    } catch (error) {
      console.warn('[Enhanced Executor] Failed to clear persisted results:', error);
    }
  }

  /**
   * Count total tasks across all plans
   */
  private countTotalTasks(plans: Map<string, ExecutionPlan>): number {
    let count = 0;
    for (const plan of plans.values()) {
      count += plan.steps.length;
    }
    return count;
  }

  /**
   * Get execution metrics
   */
  getMetrics(): ExecutionMetrics | null {
    return this.metrics;
  }

  /**
   * Generate execution summary
   */
  generateSummary(): string {
    if (!this.metrics) {
      return 'No execution metrics available';
    }

    const duration = this.metrics.endTime
      ? ((this.metrics.endTime - this.metrics.startTime) / 1000).toFixed(2)
      : 'N/A';

    return `
=== Execution Summary ===
Mode: ${this.metrics.executionMode}
Total Tasks: ${this.metrics.totalTasks}
Completed: ${this.metrics.completedTasks}
Failed: ${this.metrics.failedTasks}
Parallel Groups: ${this.metrics.parallelGroups}
Duration: ${duration}s
Success Rate: ${((this.metrics.completedTasks / this.metrics.totalTasks) * 100).toFixed(1)}%
    `.trim();
  }
}

// Singleton instance
export const EnhancedExecutorInstance = new EnhancedPluginExecutor();
