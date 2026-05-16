/**
 * Metrics tracker - manages execution metrics and summary generation
 */

import type { ExecutorMetrics } from './types';
import type { ExecutionPlan } from '../../GeoAIGraph';
import { DEFAULT_EXECUTION_MODE } from './constant';

export class MetricsTracker {
  private metrics: ExecutorMetrics | null = null;

  /**
   * Initialize metrics tracking
   */
  initialize(
    totalTasks: number,
    parallelGroupsCount: number,
    executionMode?: string
  ): void {
    this.metrics = {
      totalTasks,
      completedTasks: 0,
      failedTasks: 0,
      startTime: Date.now(),
      parallelGroups: parallelGroupsCount,
      executionMode: (executionMode as any) || DEFAULT_EXECUTION_MODE
    };
  }

  /**
   * Record task completion
   */
  recordSuccess(): void {
    if (this.metrics) {
      this.metrics.completedTasks++;
    }
  }

  /**
   * Record task failure
   */
  recordFailure(): void {
    if (this.metrics) {
      this.metrics.failedTasks++;
    }
  }

  /**
   * Finalize metrics with end time
   */
  finalize(): void {
    if (this.metrics) {
      this.metrics.endTime = Date.now();
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): ExecutorMetrics | null {
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

    const successRate = this.metrics.totalTasks > 0
      ? ((this.metrics.completedTasks / this.metrics.totalTasks) * 100).toFixed(1)
      : '0.0';

    return `
=== Execution Summary ===
Mode: ${this.metrics.executionMode}
Total Tasks: ${this.metrics.totalTasks}
Completed: ${this.metrics.completedTasks}
Failed: ${this.metrics.failedTasks}
Parallel Groups: ${this.metrics.parallelGroups}
Duration: ${duration}s
Success Rate: ${successRate}%
    `.trim();
  }

  /**
   * Count total tasks across all plans
   */
  static countTotalTasks(plans: Map<string, ExecutionPlan>): number {
    let count = 0;
    for (const plan of plans.values()) {
      count += plan.steps.length;
    }
    return count;
  }
}
