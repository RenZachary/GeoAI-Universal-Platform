/**
 * Placeholder Resolver Utility
 * Resolves step output placeholders in plugin parameters
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
 * Supports formats: {{stepId.output}}, {stepId.output}, stepId.output.value, etc.
 */
export function resolvePlaceholders(
  params: Record<string, any>,
  executionResults: Map<string, ExecutionResult>
): Record<string, any> {
  console.log('[Placeholder Resolver] Starting resolution...');
  console.log('[Placeholder Resolver] Input params:', JSON.stringify(params, null, 2));
  console.log('[Placeholder Resolver] Available execution results:', Array.from(executionResults.keys()));
  
  const resolved: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      // Try to resolve placeholder
      const resolvedValue = tryResolvePlaceholder(value, executionResults);
      if (resolvedValue !== undefined) {
        resolved[key] = resolvedValue;
        console.log(`[Placeholder Resolver] ✅ Resolved key "${key}":`, resolvedValue);
      } else {
        resolved[key] = value;
        console.log(`[Placeholder Resolver] ❌ Could not resolve key "${key}":`, value);
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
      console.log(`[Placeholder Resolver] 📋 Resolved array key "${key}" with ${value.length} items`);
    } else if (typeof value === 'object' && value !== null) {
      // Recursively resolve nested objects
      resolved[key] = resolvePlaceholders(value, executionResults);
    } else {
      resolved[key] = value;
    }
  }
  
  console.log('[Placeholder Resolver] Resolution complete. Output:', JSON.stringify(resolved, null, 2));
  return resolved;
}

/**
 * Try to resolve a placeholder string
 */
function tryResolvePlaceholder(value: string, executionResults: Map<string, ExecutionResult>): any {
  // Pattern 1: ${stepId.output} or ${stepId.output.field} (JavaScript template literal syntax)
  const jsTemplateMatch = value.match(/^\$\{(.+)\}$/);
  if (jsTemplateMatch) {
    const placeholderContent = jsTemplateMatch[1].trim();
    return resolvePlaceholderContent(placeholderContent, executionResults, value);
  }
  
  // Pattern 2: {{stepId.output}} (double braces)
  const doubleBraceMatch = value.match(/^\{\{(.+)\}\}$/);
  if (doubleBraceMatch) {
    const placeholderContent = doubleBraceMatch[1].trim();
    return resolvePlaceholderContent(placeholderContent, executionResults, value);
  }
  
  // Pattern 3: {stepId.output} (single braces)
  const singleBraceMatch = value.match(/^\{(.+)\}$/);
  if (singleBraceMatch) {
    const placeholderContent = singleBraceMatch[1].trim();
    return resolvePlaceholderContent(placeholderContent, executionResults, value);
  }
  
  // Pattern 4: Pure placeholder without wrappers (e.g., "stepId.output" or "stepId.output.field")
  // Only match if the entire string looks like a placeholder (contains .output)
  const purePlaceholderMatch = value.match(/^([a-zA-Z0-9_-]+)\.output(?:\.(.+))?$/);
  if (purePlaceholderMatch) {
    return resolvePlaceholderContent(value, executionResults, value);
  }
  
  // Pattern 5: Direct field access without .output wrapper (e.g., "stepId.result", "stepId.value")
  // This is a fallback for LLM outputs that don't follow the standard format
  const directFieldMatch = value.match(/^([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_.]+)$/);
  if (directFieldMatch) {
    return resolvePlaceholderContent(value, executionResults, value);
  }
  
  return undefined;
}

/**
 * Resolve placeholder content (extracted from various wrapper formats)
 */
function resolvePlaceholderContent(
  placeholderContent: string,
  executionResults: Map<string, ExecutionResult>,
  originalValue: string
): any {
  // Check if it's stepId.output or stepId.output.field
  const outputMatch = placeholderContent.match(/^([a-zA-Z0-9_-]+)\.output(?:\.(.+))?$/);
  if (outputMatch) {
    const stepIdPattern = outputMatch[1];
    const fieldPath = outputMatch[2]; // Could be undefined
    
    const result = findExecutionResult(stepIdPattern, executionResults);
    if (result && result.status === 'success' && result.data) {
      if (fieldPath) {
        // Navigate the field path (e.g., "result" or "value")
        let fieldValue: any = result.data;
        const fields = fieldPath.split('.');
        for (const field of fields) {
          fieldValue = fieldValue?.[field];
        }
        if (fieldValue !== undefined) {
          console.log(`[Placeholder Resolver] Resolved "${originalValue}" to:`, fieldValue);
          return fieldValue;
        }
      } else {
        // Just stepId.output - extract standardized value
        const resolvedValue = extractValueFromResult(result);
        console.log(`[Placeholder Resolver] Resolved "${originalValue}" to:`, resolvedValue);
        return resolvedValue;
      }
    }
  }
  
  // Fallback: Try direct field access pattern (e.g., "stepId.result", "stepId.value")
  // This handles cases where LLM uses simplified syntax without .output
  const directFieldMatch = placeholderContent.match(/^([a-zA-Z0-9_-]+)\.([a-zA-Z][a-zA-Z0-9_.]*)$/);
  if (directFieldMatch) {
    const stepIdPattern = directFieldMatch[1];
    const fieldPath = directFieldMatch[2];
    
    console.log(`[Placeholder Resolver] Trying direct field access: stepId="${stepIdPattern}", field="${fieldPath}"`);
    
    const result = findExecutionResult(stepIdPattern, executionResults);
    if (result && result.status === 'success' && result.data) {
      console.log(`[Placeholder Resolver] Found result for "${stepIdPattern}", status: ${result.status}`);
      
      // Try navigating the field path in result.data first
      let fieldValue: any = result.data;
      const fields = fieldPath.split('.');
      for (const field of fields) {
        fieldValue = fieldValue?.[field];
      }
      if (fieldValue !== undefined) {
        console.log(`[Placeholder Resolver] ✅ Direct data field access "${originalValue}" ->`, fieldValue);
        return fieldValue;
      }
      
      // If not found in data, try metadata
      fieldValue = result.data?.metadata?.[fieldPath];
      if (fieldValue !== undefined) {
        console.log(`[Placeholder Resolver] ✅ Metadata field access "${originalValue}" ->`, fieldValue);
        return fieldValue;
      }
      
      // Try standardized fields as last resort
      if (fieldPath === 'result' || fieldPath === 'value' || fieldPath === 'output') {
        fieldValue = extractValueFromResult(result);
        if (fieldValue !== undefined) {
          console.log(`[Placeholder Resolver] ✅ Standardized field extraction "${originalValue}" ->`, fieldValue);
          return fieldValue;
        }
      }
      
      console.log(`[Placeholder Resolver] ⚠️ Field "${fieldPath}" not found in result`);
    } else {
      console.log(`[Placeholder Resolver] ⚠️ No result found for stepId: "${stepIdPattern}"`);
    }
  }
  
  return undefined;
}

/**
 * Extract actual value from NativeData result
 * Expects standardized metadata fields: resultValue, output, or value
 */
function extractValueFromResult(result: ExecutionResult): any {
  // Try standardized fields first (in priority order)
  if (result.data?.metadata?.resultValue !== undefined) {
    return result.data.metadata.resultValue;
  }
  if (result.data?.metadata?.output !== undefined) {
    return result.data.metadata.output;
  }
  if (result.data?.metadata?.value !== undefined) {
    return result.data.metadata.value;
  }
  
  // Fallback to legacy field names (for backward compatibility)
  if (result.data?.metadata?.aggregatedValue !== undefined) {
    return result.data.metadata.aggregatedValue;
  }
  if (result.data?.metadata?.count !== undefined) {
    return result.data.metadata.count;
  }
  
  // Try reference (file path or URL)
  if (result.data?.reference) {
    return result.data.reference;
  }
  
  // Fallback to JSON stringification
  return JSON.stringify(result.data);
}

/**
 * Normalize stepId for comparison (replace hyphens and underscores)
 */
function normalizeStepId(stepId: string): string {
  return stepId.toLowerCase().replace(/[-_]/g, '');
}

/**
 * Find execution result by stepId pattern (supports partial matching)
 */
function findExecutionResult(
  stepIdPattern: string, 
  executionResults: Map<string, ExecutionResult>
): ExecutionResult | undefined {
  // Try exact match first
  if (executionResults.has(stepIdPattern)) {
    return executionResults.get(stepIdPattern);
  }
  
  // Try normalized match (treat hyphens and underscores as equivalent)
  const normalizedPattern = normalizeStepId(stepIdPattern);
  for (const [stepId, result] of executionResults.entries()) {
    const normalizedStepId = normalizeStepId(stepId);
    if (normalizedStepId === normalizedPattern) {
      console.log(`[Placeholder Resolver] Normalized match: "${stepIdPattern}" -> "${stepId}"`);
      return result;
    }
  }
  
  // Try partial match (e.g., "count_prefectures" matches "step_count_prefectures")
  for (const [stepId, result] of executionResults.entries()) {
    if (stepId.includes(stepIdPattern) || stepIdPattern.includes(stepId)) {
      console.log(`[Placeholder Resolver] Partial match: "${stepIdPattern}" -> "${stepId}"`);
      return result;
    }
  }
  
  return undefined;
}
