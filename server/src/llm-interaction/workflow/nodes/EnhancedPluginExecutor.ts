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
    console.log('[Enhanced Executor] Starting enhanced execution with parallel support...');

    if (!state.executionPlans || state.executionPlans.size === 0) {
      console.warn('[Enhanced Executor] No execution plans found');
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

    console.log(`[Enhanced Executor] Execution mode: ${this.metrics.executionMode}`);
    console.log(`[Enhanced Executor] Total tasks: ${this.metrics.totalTasks}`);
    console.log(`[Enhanced Executor] Parallel groups: ${this.metrics.parallelGroups}`);

    const executionResults = new Map<string, AnalysisResult>();

    try {
      // Check if we have parallel groups
      if (state.parallelGroups && state.parallelGroups.length > 0) {
        // Execute using parallel groups
        await this.executeParallelGroups(
          state.executionPlans,
          state.parallelGroups,
          executionResults,
          streamWriter
        );
      } else {
        // Fallback to sequential execution
        await this.executeSequentially(
          state.executionPlans,
          executionResults,
          streamWriter
        );
      }

      // Finalize metrics
      this.metrics.endTime = Date.now();
      const duration = (this.metrics.endTime - this.metrics.startTime) / 1000;
      
      console.log(`[Enhanced Executor] Execution completed in ${duration.toFixed(2)}s`);
      console.log(`[Enhanced Executor] Results: ${this.metrics.completedTasks} succeeded, ${this.metrics.failedTasks} failed`);

      return {
        executionResults,
        currentStep: 'output'
      };

    } catch (error) {
      console.error('[Enhanced Executor] Execution failed:', error);
      
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
    streamWriter?: any
  ): Promise<void> {
    console.log(`[Enhanced Executor] Executing ${parallelGroups.length} parallel groups...`);

    for (let groupIndex = 0; groupIndex < parallelGroups.length; groupIndex++) {
      const group = parallelGroups[groupIndex];
      console.log(`\n[Enhanced Executor] === Group ${groupIndex + 1}/${parallelGroups.length}: ${group.groupId} ===`);
      console.log(`[Enhanced Executor] Tasks in group: ${group.tasks.length}`);

      if (group.tasks.length === 1) {
        // Single task - execute sequentially
        const taskId = group.tasks[0];
        await this.executeSingleTask(taskId, plans, results, streamWriter);
      } else {
        // Multiple tasks - execute in parallel
        console.log(`[Enhanced Executor] Executing ${group.tasks.length} tasks in parallel...`);
        
        const taskPromises = group.tasks.map(async (taskId: string) => {
          try {
            await this.executeSingleTask(taskId, plans, results, streamWriter);
          } catch (error) {
            console.error(`[Enhanced Executor] Task ${taskId} failed in parallel group:`, error);
            throw error;
          }
        });

        // Wait for all tasks in the group to complete
        await Promise.allSettled(taskPromises);
      }

      console.log(`[Enhanced Executor] Group ${groupIndex + 1} completed\n`);
    }
  }

  /**
   * Execute a single task
   */
  private async executeSingleTask(
    taskId: string,
    plans: Map<string, ExecutionPlan>,
    results: Map<string, AnalysisResult>,
    streamWriter?: any
  ): Promise<void> {
    console.log(`[Enhanced Executor] Executing task: ${taskId}`);

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
      this.metrics!.failedTasks++;
      return;
    }

    const step = targetPlan.steps[stepIndex];

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
        this.metrics!.failedTasks++;
        return;
      }

      // Resolve placeholders in parameters
      const resolvedParameters = resolvePlaceholders(step.parameters, results);

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
      const result: AnalysisResult = {
        id: taskId,
        goalId: targetPlan.goalId,
        status: parsedResult.success ? 'success' : 'failed',
        data: parsedResult.data || parsedResult,
        error: parsedResult.error,
        metadata: {
          executedAt: new Date().toISOString()
        }
      };

      results.set(taskId, result);

      // Persist intermediate result
      await this.persistIntermediateResult(taskId, result);

      // Send tool_complete event
      if (streamWriter) {
        streamWriter.write(`data: ${JSON.stringify({
          type: 'tool_complete',
          tool: step.pluginId,
          taskId: taskId,
          output: JSON.stringify(parsedResult).substring(0, 2000),
          timestamp: Date.now()
        })}\n\n`);
      }

      if (result.status === 'success') {
        this.metrics!.completedTasks++;
        console.log(`[Enhanced Executor] Task ${taskId} completed successfully`);
      } else {
        this.metrics!.failedTasks++;
        console.error(`[Enhanced Executor] Task ${taskId} failed:`, result.error);
      }

    } catch (error) {
      console.error(`[Enhanced Executor] Task ${taskId} execution error:`, error);
      
      results.set(taskId, {
        id: taskId,
        goalId: targetPlan.goalId,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      });
      
      this.metrics!.failedTasks++;
    }
  }

  /**
   * Execute all tasks sequentially (fallback)
   */
  private async executeSequentially(
    plans: Map<string, ExecutionPlan>,
    results: Map<string, AnalysisResult>,
    streamWriter?: any
  ): Promise<void> {
    console.log('[Enhanced Executor] Executing sequentially (no parallel groups)...');

    for (const [goalId, plan] of plans.entries()) {
      console.log(`\n[Enhanced Executor] === Goal: ${goalId} ===`);

      for (const step of plan.steps) {
        await this.executeSingleTask(step.stepId, plans, results, streamWriter);
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
