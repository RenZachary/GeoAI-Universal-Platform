/**
 * Placeholder Resolver Utility - ENHANCED VERSION
 * Supports returnType-aware resolution for spatial, analytical, and textual operators
 * 
 * Resolution rules:
 * - spatial: {step_id.result.id} returns NativeData.id for chaining
 * - analytical: {step_id.result.data.fieldName} returns specific data fields
 * - textual: Terminal operations, typically not referenced
 */

import type { OperatorReturnType } from '../../spatial-operators/SpatialOperator';

export interface ExecutionResult {
  id: string;
  goalId: string;
  status: 'success' | 'failed';
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
  returnType?: OperatorReturnType; // NEW: Track return type for smart resolution
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
 * Try to resolve a placeholder string with returnType awareness
 * Supports: {step_id.result}, {step_id.result.id}, {step_id.result.data.fieldName}
 */
function tryResolvePlaceholder(value: string, executionResults: Map<string, ExecutionResult>): any {
  // Match pattern: {step_id.result} or {step_id.result.field.path}
  console.log('[Placeholder Resolver] Trying to resolve placeholder:', value);
  for(let i = 0; i < executionResults.size; i++){
    console.log('[Placeholder Resolver] Execution result found:', executionResults.keys().next().value);
  }
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
  
  // Get return type (default to 'spatial' for backward compatibility)
  const returnType = result.returnType || 'spatial';
  
  // Smart resolution based on return type
  if (returnType === 'spatial') {
    return resolveSpatialPlaceholder(result, fieldPath);
  } else if (returnType === 'analytical') {
    return resolveAnalyticalPlaceholder(result, fieldPath);
  } else if (returnType === 'textual') {
    console.warn(`[Placeholder Resolver] Attempting to reference textual operator result: ${stepId}. Textual results are terminal and should not be chained.`);
    return resolveTextualPlaceholder(result, fieldPath);
  }
  
  // Fallback: legacy behavior
  return resolveLegacyPlaceholder(result, fieldPath);
}

/**
 * Resolve placeholder for spatial operators (returns NativeData)
 */
function resolveSpatialPlaceholder(result: ExecutionResult, fieldPath?: string): any {
  // Special case: if accessing .id field or no field path, return NativeData.id directly
  // This is the MOST COMMON use case for chaining spatial operations
  if (fieldPath === 'id' || !fieldPath) {
    if (!result.data.id) {
      console.warn(`[Placeholder Resolver] Spatial result missing .id field:`, result.data);
      return undefined;
    }
    return result.data.id;
  }
  
  // For other fields, navigate through metadata
  let fieldValue: any = result.data.metadata;
  
  if (!fieldValue) {
    console.warn(`[Placeholder Resolver] Spatial result missing metadata`);
    return undefined;
  }
  
  const fields = fieldPath.split('.');
  for (const field of fields) {
    if (fieldValue === null || fieldValue === undefined) {
      console.warn(`[Placeholder Resolver] Cannot access field "${field}" in null/undefined value`);
      return undefined;
    }
    fieldValue = fieldValue[field];
  }
  
  if (fieldValue === undefined) {
    console.warn(`[Placeholder Resolver] Field path "${fieldPath}" not found in spatial result metadata`);
    return undefined;
  }
  
  return fieldValue;
}

/**
 * Resolve placeholder for analytical operators (returns statistical/query results)
 */
function resolveAnalyticalPlaceholder(result: ExecutionResult, fieldPath?: string): any {
  if (!fieldPath) {
    console.warn(`[Placeholder Resolver] Analytical result requires field path. Use {step_id.result.data.fieldName}`);
    return undefined;
  }
  
  // Navigate through data object
  let fieldValue: any = result.data.data;
  
  if (!fieldValue) {
    console.warn(`[Placeholder Resolver] Analytical result missing data field`);
    return undefined;
  }
  
  const fields = fieldPath.split('.');
  for (const field of fields) {
    if (fieldValue === null || fieldValue === undefined) {
      console.warn(`[Placeholder Resolver] Cannot access field "${field}" in analytical result`);
      return undefined;
    }
    fieldValue = fieldValue[field];
  }
  
  if (fieldValue === undefined) {
    console.warn(`[Placeholder Resolver] Field path "${fieldPath}" not found in analytical result data`);
    return undefined;
  }
  
  return fieldValue;
}

/**
 * Resolve placeholder for textual operators (terminal operations)
 */
function resolveTextualPlaceholder(result: ExecutionResult, fieldPath?: string): any {
  console.warn(`[Placeholder Resolver] Referencing textual operator result is unusual. Textual results are meant for direct display.`);
  
  if (!fieldPath) {
    return result.data.data?.answer || result.data;
  }
  
  let fieldValue: any = result.data.data;
  const fields = fieldPath.split('.');
  
  for (const field of fields) {
    if (fieldValue === null || fieldValue === undefined) {
      return undefined;
    }
    fieldValue = fieldValue[field];
  }
  
  return fieldValue;
}

/**
 * Legacy resolution for backward compatibility (deprecated)
 */
function resolveLegacyPlaceholder(result: ExecutionResult, fieldPath?: string): any {
  const resultValue = result.data.metadata?.result;
  
  if (fieldPath === 'id' || !fieldPath) {
    return result.data.id;
  }
  
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
