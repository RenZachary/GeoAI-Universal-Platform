/**
 * Validator for execution parameters and state
 */

import type { GeoAIStateType } from '../../GeoAIGraph';
import { ExecutorError } from './errors';

export class ExecutorValidator {
  /**
   * Validate that execution plans exist and are valid
   */
  validateExecutionPlans(state: GeoAIStateType): void {
    if (!state.executionPlans || state.executionPlans.size === 0) {
      throw new ExecutorError('No execution plans available', 'NO_PLANS');
    }
  }

  /**
   * Validate parallel groups configuration
   */
  validateParallelGroups(state: GeoAIStateType): void {
    if (state.parallelGroups) {
      for (const group of state.parallelGroups) {
        if (!group.tasks || group.tasks.length === 0) {
          throw new ExecutorError('Parallel group has no tasks', 'EMPTY_GROUP');
        }
      }
    }
  }

  /**
   * Validate task ID format
   */
  validateTaskId(taskId: string): void {
    if (!taskId || !taskId.trim()) {
      throw new ExecutorError('Task ID cannot be empty', 'INVALID_TASK_ID');
    }
  }

  /**
   * Check if state has required fields for execution
   */
  validateStateCompleteness(state: GeoAIStateType): { isValid: boolean; missingFields: string[] } {
    const missingFields: string[] = [];

    if (!state.conversationId) {
      missingFields.push('conversationId');
    }

    if (!state.executionPlans || state.executionPlans.size === 0) {
      missingFields.push('executionPlans');
    }

    return {
      isValid: missingFields.length === 0,
      missingFields
    };
  }
}
