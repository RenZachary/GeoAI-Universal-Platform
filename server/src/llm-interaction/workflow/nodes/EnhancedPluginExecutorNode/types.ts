/**
 * Type definitions for EnhancedPluginExecutorNode
 */

import type { GeoAIStateType, ExecutionPlan, AnalysisResult } from '../../GeoAIGraph';
import type { OperatorReturnType } from '../../../../spatial-operators/SpatialOperator';

export interface ExecutorMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  startTime: number;
  endTime?: number;
  parallelGroups: number;
  executionMode: 'sequential' | 'parallel';
}

export interface TaskExecutionResult {
  taskId: string;
  goalId: string;
  status: 'success' | 'failed';
  data?: any;
  error?: string;
  returnType?: 'spatial' | 'analytical' | 'textual';
  metadata?: Record<string, any>;
}

export interface PersistedResult {
  task_id: string;
  goal_id: string;
  status: string;
  result_data: string | null;
  error: string | null;
  created_at: string;
}

export interface ExecutionContext {
  state: GeoAIStateType;
  plans: Map<string, ExecutionPlan>;
  results: Map<string, AnalysisResult>;
  metrics: ExecutorMetrics;
}

export interface ExecutionResult {
  id: string;
  goalId: string;
  status: 'success' | 'failed';
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
  returnType?: OperatorReturnType;
}

// Backward compatibility alias
export type ExecutionMetrics = ExecutorMetrics;
