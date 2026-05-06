/**
 * Placeholder Resolver Utility - SIMPLIFIED VERSION
 * Only supports ONE standard format: {step_id.result} or {step_id.result.field}
 * 
 * This simplification ensures consistency and eliminates LLM confusion.
 */

export interface ExecutionResult {
  id: string;
  goalId: string;
  status: 'success' | 'failed';
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Resolve placeholders in parameters using execution results
 * ONLY supports format: {step_id.result} or {step_id.result.field}
 */
export function resolvePlaceholders(
  params: Record<string, any>,
  executionResults: Map<string, ExecutionResult>
): Record<string, any> {
  const resolved: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      // Try to resolve placeholder
      const resolvedValue = tryResolvePlaceholder(value, executionResults);
      if (resolvedValue !== undefined) {
        resolved[key] = resolvedValue;
      } else {
        resolved[key] = value;
      }
    } else if (Array.isArray(value)) {
      // Recursively resolve arrays
      resolved[key] = value.map(item => {
        if (typeof item === 'string') {
          return tryResolvePlaceholder(item, executionResults) ?? item;
        } else if (typeof item === 'object' && item !== null) {
          return resolvePlaceholders(item, executionResults);
        }
        return item;
      });
    } else if (typeof value === 'object' && value !== null) {
      // Recursively resolve nested objects
      resolved[key] = resolvePlaceholders(value, executionResults);
    } else {
      resolved[key] = value;
    }
  }
  
  return resolved;
}

/**
 * Try to resolve a placeholder string
 * ONLY supports: {step_id.result} or {step_id.result.field}
 */
function tryResolvePlaceholder(value: string, executionResults: Map<string, ExecutionResult>): any {
  // Match pattern: {step_id.result} or {step_id.result.field.path}
  const match = value.match(/^\{([a-zA-Z0-9_-]+)\.result(?:\.([a-zA-Z0-9_.]+))?\}$/);
  
  if (!match) {
    return undefined;  // Not a valid placeholder format
  }
  
  const stepId = match[1];
  const fieldPath = match[2]; // Optional field path after .result
  
  // Find the execution result
  const result = findExecutionResult(stepId, executionResults);
  
  if (!result || result.status !== 'success' || !result.data) {
    console.warn(`[Placeholder Resolver] No result found for step: ${stepId}`);
    return undefined;
  }
  
  // Extract the result value from metadata.result
  const resultValue = result.data.metadata?.result;
  
  // Special case: if accessing .id field or no field path, return NativeData.id directly
  // This is the most common use case for passing data between steps
  if (fieldPath === 'id' || !fieldPath) {
    return result.data.id;
  }
  
  // Navigate the field path within resultValue
  let fieldValue: any = resultValue;
  const fields = fieldPath.split('.');
  
  for (const field of fields) {
    if (fieldValue === null || fieldValue === undefined) {
      console.warn(`[Placeholder Resolver] Cannot access field "${field}" in null/undefined value`);
      return undefined;
    }
    fieldValue = fieldValue[field];
  }
  
  if (fieldValue === undefined) {
    console.warn(`[Placeholder Resolver] Field path "${fieldPath}" not found in result`);
    return undefined;
  }
  
  return fieldValue;
}

/**
 * Find execution result by stepId (exact match only)
 */
function findExecutionResult(
  stepId: string, 
  executionResults: Map<string, ExecutionResult>
): ExecutionResult | undefined {
  // Exact match only - LLM must use the correct stepId
  if (executionResults.has(stepId)) {
    return executionResults.get(stepId);
  }
  
  return undefined;
}
