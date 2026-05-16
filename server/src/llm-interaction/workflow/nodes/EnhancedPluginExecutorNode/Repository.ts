/**
 * Repository layer for intermediate result persistence
 * Handles all database operations related to execution results
 */

import type Database from 'better-sqlite3';
import type { PersistedResult, TaskExecutionResult } from './types';
import { INTERMEDIATE_RESULTS_TABLE } from './constant';
import { PersistenceError } from './errors';
import { SQLiteManagerInstance } from '../../../../storage';
export class ExecutorRepository {
    constructor() { }
    private getDb(){
        return SQLiteManagerInstance.getDatabase();
    }

    /**
     * Initialize the intermediate results table
     */
    initializeTable(): void {
        try {
            this.getDb().exec(`
        CREATE TABLE IF NOT EXISTS ${INTERMEDIATE_RESULTS_TABLE} (
          task_id TEXT PRIMARY KEY,
          goal_id TEXT,
          status TEXT,
          result_data TEXT,
          error TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
        } catch (error) {
            throw new PersistenceError(`Failed to initialize table: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Save or update an intermediate result
     */
    saveResult(taskId: string, result: TaskExecutionResult): void {
        try {
            this.initializeTable();

            this.getDb().prepare(`
        INSERT OR REPLACE INTO ${INTERMEDIATE_RESULTS_TABLE} 
        (task_id, goal_id, status, result_data, error)
        VALUES (?, ?, ?, ?, ?)
      `).run(
                taskId,
                result.goalId,
                result.status,
                result.data ? JSON.stringify(result.data) : null,
                result.error || null
            );
        } catch (error) {
            console.warn(`[ExecutorRepository] Failed to persist result for ${taskId}:`, error);
            // Don't fail execution if persistence fails
        }
    }

    /**
     * Load all persisted results
     */
    loadAllResults(): Map<string, TaskExecutionResult> {
        const results = new Map<string, TaskExecutionResult>();

        try {
            this.initializeTable();

            const rows = this.getDb().prepare(`
        SELECT task_id, goal_id, status, result_data, error, created_at
        FROM ${INTERMEDIATE_RESULTS_TABLE}
        ORDER BY created_at
      `).all() as PersistedResult[];

            for (const row of rows) {
                results.set(row.task_id, {
                    taskId: row.task_id,
                    goalId: row.goal_id,
                    status: row.status as 'success' | 'failed',
                    data: row.result_data ? JSON.parse(row.result_data) : null,
                    error: row.error || undefined,
                    metadata: {
                        executedAt: row.created_at
                    }
                });
            }
        } catch (error) {
            console.warn('[ExecutorRepository] Failed to load persisted results:', error);
        }

        return results;
    }

    /**
     * Clear all persisted results
     */
    clearAllResults(): void {
        try {
            this.getDb().exec(`DELETE FROM ${INTERMEDIATE_RESULTS_TABLE}`);
        } catch (error) {
            console.warn('[ExecutorRepository] Failed to clear persisted results:', error);
        }
    }

    /**
     * Get a single persisted result by task ID
     */
    getResultById(taskId: string): TaskExecutionResult | null {
        try {
            this.initializeTable();

            const row = this.getDb().prepare(`
        SELECT task_id, goal_id, status, result_data, error, created_at
        FROM ${INTERMEDIATE_RESULTS_TABLE}
        WHERE task_id = ?
      `).get(taskId) as PersistedResult | undefined;

            if (!row) {
                return null;
            }

            return {
                taskId: row.task_id,
                goalId: row.goal_id,
                status: row.status as 'success' | 'failed',
                data: row.result_data ? JSON.parse(row.result_data) : null,
                error: row.error || undefined,
                metadata: {
                    executedAt: row.created_at
                }
            };
        } catch (error) {
            console.warn(`[ExecutorRepository] Failed to load result for ${taskId}:`, error);
            return null;
        }
    }
}
