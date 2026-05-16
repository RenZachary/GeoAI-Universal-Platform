/**
 * EnhancedPluginExecutor - Supports parallel execution with dependency management
 * 
 * This executor enhances the basic plugin execution with:
 * - Parallel task group execution
 * - Intermediate result persistence
 * - Exception rollback and recovery
 * - Performance monitoring
 * 
 * Architecture:
 * - Service layer (this file): Orchestrates execution flow
 * - TaskExecutor: Handles individual task execution logic
 * - ExecutorRepository: Manages database persistence
 * - MetricsTracker: Tracks execution metrics
 * - Validator: Validates execution parameters
 */

import type { GeoAIStateType, ExecutionPlan, AnalysisResult } from '../../GeoAIGraph';
import type { ParallelGroup } from '../../../analyzers/ParallelTaskAnalyzer';
import type { ExecutorMetrics } from './types';
import { ExecutorRepository } from './Repository';
import { TaskExecutor } from './TaskExecutor';
import { MetricsTracker } from './MetricsTracker';
import { ExecutorValidator } from './Validator';


export class EnhancedPluginExecutorNode {
  private repository: ExecutorRepository;
  private taskExecutor: TaskExecutor;
  private metricsTracker: MetricsTracker;
  private validator: ExecutorValidator;

  constructor() {
    this.repository = new ExecutorRepository();
    this.taskExecutor = new TaskExecutor();
    this.metricsTracker = new MetricsTracker();
    this.validator = new ExecutorValidator();
  }

  /**
   * Execute all plans with parallel support
   */
  async executeWithParallelSupport(
    state: GeoAIStateType
  ): Promise<Partial<GeoAIStateType>> {
    if (!state.executionPlans || state.executionPlans.size === 0) {
      return {
        executionResults: new Map(),
        currentStep: 'output'
      };
    }

    // Validate state
    const validation = this.validator.validateStateCompleteness(state);
    if (!validation.isValid) {
      return {
        executionResults: new Map(),
        currentStep: 'output',
        errors: [
          ...(state.errors || []),
          { goalId: 'global', error: `Invalid state: missing fields - ${validation.missingFields.join(', ')}` }
        ]
      };
    }

    // Initialize metrics
    this.metricsTracker.initialize(
      MetricsTracker.countTotalTasks(state.executionPlans),
      state.parallelGroups?.length || 0,
      state.executionMode
    );

    const executionResults = new Map<string, AnalysisResult>();

    try {
      // Check if we have parallel groups
      if (state.parallelGroups && state.parallelGroups.length > 0) {
        // Execute using parallel groups
        await this.executeParallelGroups(
          state.executionPlans,
          state.parallelGroups,
          executionResults,
          state
        );
      } else {
        // Fallback to sequential execution
        await this.executeSequentially(
          state.executionPlans,
          executionResults,
          state
        );
      }

      // Finalize metrics
      this.metricsTracker.finalize();

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
    state: GeoAIStateType
  ): Promise<void> {
    for (let groupIndex = 0; groupIndex < parallelGroups.length; groupIndex++) {
      const group = parallelGroups[groupIndex];

      if (group.tasks.length === 1) {
        // Single task - execute sequentially
        const taskId = group.tasks[0];
        await this.executeAndPersistTask(taskId, plans, results, state);
      } else {
        // Multiple tasks - execute in parallel
        const taskPromises = group.tasks.map(async (taskId: string) => {
          await this.executeAndPersistTask(taskId, plans, results, state);
        });

        // Wait for all tasks in the group to complete
        await Promise.allSettled(taskPromises);
      }
    }
  }

  /**
   * Execute a single task with persistence
   */
  private async executeAndPersistTask(
    taskId: string,
    plans: Map<string, ExecutionPlan>,
    results: Map<string, AnalysisResult>,
    state: GeoAIStateType
  ): Promise<void> {
    try {
      // Execute task using TaskExecutor
      const result = await this.taskExecutor.executeTask(taskId, plans, results, state);
      
      // Store result
      results.set(taskId, result);

      // Persist intermediate result
      await this.repository.saveResult(taskId, {
        taskId: result.id,
        goalId: result.goalId,
        status: result.status,
        data: result.data,
        error: result.error,
        returnType: result.returnType,
        metadata: result.metadata
      });

      // Update metrics
      if (result.status === 'success') {
        this.metricsTracker.recordSuccess();
      } else {
        this.metricsTracker.recordFailure();
      }

    } catch (error) {
      console.error(`[Enhanced Executor] Task ${taskId} execution error:`, error);

      const errorResult: AnalysisResult = {
        id: taskId,
        goalId: this.getGoalIdForTask(taskId, plans),
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      };

      results.set(taskId, errorResult);
      this.metricsTracker.recordFailure();
    }
  }

  /**
   * Helper to get goal ID for a task (used in error cases)
   */
  private getGoalIdForTask(taskId: string, plans: Map<string, ExecutionPlan>): string {
    const location = this.taskExecutor.findTaskLocation(taskId, plans);
    return location ? location.plan.goalId : 'unknown';
  }

  /**
   * Execute all tasks sequentially (fallback)
   */
  private async executeSequentially(
    plans: Map<string, ExecutionPlan>,
    results: Map<string, AnalysisResult>,
    state: GeoAIStateType
  ): Promise<void> {
    console.log('[Enhanced Executor] Executing sequentially (no parallel groups)...');

    for (const [goalId, plan] of plans.entries()) {
      console.log(`\n[Enhanced Executor] === Goal: ${goalId} ===`);

      for (const step of plan.steps) {
        await this.executeAndPersistTask(step.stepId, plans, results, state);
      }
    }
  }

  /**
   * Load persisted intermediate results
   */
  loadPersistedResults(): Map<string, AnalysisResult> {
    const persistedResults = this.repository.loadAllResults();
    const results = new Map<string, AnalysisResult>();

    for (const [taskId, persisted] of persistedResults.entries()) {
      results.set(taskId, {
        id: persisted.taskId,
        goalId: persisted.goalId,
        status: persisted.status,
        data: persisted.data,
        error: persisted.error,
        returnType: persisted.returnType,
        metadata: persisted.metadata
      });
    }

    console.log(`[Enhanced Executor] Loaded ${results.size} persisted results`);
    return results;
  }

  /**
   * Clear persisted results
   */
  clearPersistedResults(): void {
    this.repository.clearAllResults();
    console.log('[Enhanced Executor] Cleared all persisted results');
  }

  /**
   * Get execution metrics
   */
  getMetrics(): ExecutorMetrics | null {
    return this.metricsTracker.getMetrics();
  }

  /**
   * Generate execution summary
   */
  generateSummary(): string {
    return this.metricsTracker.generateSummary();
  }
}

// Singleton instance
export const EnhancedExecutorNodeInstance = new EnhancedPluginExecutorNode();
