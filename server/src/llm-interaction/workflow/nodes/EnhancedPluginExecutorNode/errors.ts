/**
 * Custom error classes for EnhancedPluginExecutorNode
 */

export class ExecutorError extends Error {
  constructor(message: string, public code: string = 'EXECUTOR_ERROR') {
    super(message);
    this.name = 'ExecutorError';
  }
}

export class TaskNotFoundError extends ExecutorError {
  constructor(taskId: string) {
    super(`Task not found: ${taskId}`, 'TASK_NOT_FOUND');
    this.name = 'TaskNotFoundError';
  }
}

export class OperatorNotFoundError extends ExecutorError {
  constructor(operatorId: string) {
    super(`Operator not found: ${operatorId}`, 'OPERATOR_NOT_FOUND');
    this.name = 'OperatorNotFoundError';
  }
}

export class ExecutionFailedError extends ExecutorError {
  constructor(taskId: string, message: string) {
    super(`Task ${taskId} execution failed: ${message}`, 'EXECUTION_FAILED');
    this.name = 'ExecutionFailedError';
  }
}

export class PersistenceError extends ExecutorError {
  constructor(message: string) {
    super(`Persistence error: ${message}`, 'PERSISTENCE_ERROR');
    this.name = 'PersistenceError';
  }
}
