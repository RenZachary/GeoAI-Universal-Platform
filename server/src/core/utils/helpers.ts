/**
 * Utility functions for GeoAI-UP platform
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a unique identifier
 */
export function generateId(): string {
  return uuidv4();
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if a value is null or undefined
 */
export function isNullOrUndefined(value: any): boolean {
  return value === null || value === undefined;
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Extract variables from template string {{variable}}
 */
export function extractTemplateVariables(template: string): string[] {
  const matches = template.match(/\{\{([^}]+)\}\}/g);
  if (!matches) return [];
  
  return matches.map(match => match.replace(/[{}]/g, ''));
}

/**
 * Replace variables in template string
 */
export function replaceTemplateVariables(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  
  return result;
}

/**
 * Safely parse JSON with error handling
 */
export function safeJsonParse<T>(jsonString: string, defaultValue?: T): T | undefined {
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    console.warn('Failed to parse JSON:', error);
    return defaultValue;
  }
}

/**
 * Create a retry wrapper for async functions
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      console.warn(`Retry ${i + 1}/${maxRetries} failed:`, error);
      
      if (i < maxRetries - 1) {
        await sleep(delayMs);
      }
    }
  }
  
  throw lastError;
}

/**
 * Get current timestamp in ISO format
 */
export function now(): string {
  return new Date().toISOString();
}

/**
 * Calculate time difference in milliseconds
 */
export function timeDiffMs(from: Date, to: Date = new Date()): number {
  return to.getTime() - from.getTime();
}

/**
 * Check if a date has expired based on TTL
 */
export function isExpired(createdAt: Date, ttlMs: number): boolean {
  return timeDiffMs(createdAt) > ttlMs;
}

/**
 * Wrap an error with additional context while preserving the original error chain
 * 
 * @param error - The caught error
 * @param message - Custom error message prefix
 * @returns A new Error with the original error as cause
 * 
 * @example
 * ```typescript
 * try {
 *   await someOperation();
 * } catch (error) {
 *   throw wrapError(error, 'Failed to perform operation');
 * }
 * ```
 */
export function wrapError(error: unknown, message: string): Error {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  const wrappedError = new Error(`${message}: ${errorMessage}`);
  // Use type assertion because Error.cause is ES2022+ feature
  (wrappedError as any).cause = error;
  return wrappedError;
}
