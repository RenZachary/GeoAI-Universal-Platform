/**
 * ParallelTaskAnalyzer - Analyzes task dependencies for parallel execution
 * 
 * This analyzer examines execution plans to identify which tasks can run
 * in parallel and which must run sequentially based on data dependencies.
 */

import type { ExecutionPlan, ExecutionStep, AnalysisGoal } from '../workflow/GeoAIGraph';

export interface ParallelGroup {
  groupId: string;
  tasks: string[]; // Task IDs that can run in parallel
  estimatedTimeMs: number;
}

export interface DependencyGraph {
  nodes: Map<string, TaskNode>;
  edges: Array<{ from: string; to: string }>;
}

export interface TaskNode {
  taskId: string;
  pluginId: string;
  inputs: Set<string>; // Data dependencies (input data sources)
  outputs: Set<string>; // Data produced
  estimatedTimeMs: number;
}

export class ParallelTaskAnalyzer {
  /**
   * Analyze execution plans and identify parallel task groups
   */
  analyzeParallelGroups(executionPlans: Map<string, ExecutionPlan>): ParallelGroup[] {
    console.log('[ParallelTaskAnalyzer] Analyzing task dependencies for parallel execution...');
    
    // Build dependency graph
    const graph = this.buildDependencyGraph(executionPlans);
    
    // Detect cycles (should not exist in valid plans)
    if (this.hasCycle(graph)) {
      console.warn('[ParallelTaskAnalyzer] Circular dependency detected! Falling back to sequential execution.');
      return this.createSequentialGroups(executionPlans);
    }
    
    // Topological sort and group by levels
    const levels = this.topologicalSortByLevels(graph);
    
    // Convert levels to parallel groups
    const parallelGroups: ParallelGroup[] = levels.map((level, index) => ({
      groupId: `parallel_group_${index}`,
      tasks: level,
      estimatedTimeMs: this.calculateGroupTime(level, executionPlans)
    }));
    
    console.log(`[ParallelTaskAnalyzer] Identified ${parallelGroups.length} parallel groups`);
    return parallelGroups;
  }

  /**
   * Build dependency graph from execution plans
   */
  private buildDependencyGraph(executionPlans: Map<string, ExecutionPlan>): DependencyGraph {
    const nodes = new Map<string, TaskNode>();
    const edges: Array<{ from: string; to: string }> = [];
    
    // Iterate through all goals and their steps
    for (const [goalId, plan] of executionPlans.entries()) {
      for (const step of plan.steps) {
        const taskId = step.stepId;
        
        // Create node for this task
        const node: TaskNode = {
          taskId,
          pluginId: step.pluginId,
          inputs: new Set(this.extractInputs(step)),
          outputs: new Set(this.extractOutputs(step)),
          estimatedTimeMs: this.estimateTaskTime(step)
        };
        
        nodes.set(taskId, node);
      }
    }
    
    // Build edges based on data dependencies
    for (const [fromId, fromNode] of nodes.entries()) {
      for (const [toId, toNode] of nodes.entries()) {
        if (fromId === toId) continue;
        
        // If 'to' task depends on output from 'from' task
        for (const output of fromNode.outputs) {
          if (toNode.inputs.has(output)) {
            edges.push({ from: fromId, to: toId });
          }
        }
      }
    }
    
    return { nodes, edges };
  }

  /**
   * Extract input data dependencies from execution step
   */
  private extractInputs(step: ExecutionStep): string[] {
    const inputs: string[] = [];
    
    // Check parameters for data source references
    if (step.parameters) {
      for (const [key, value] of Object.entries(step.parameters)) {
        if (typeof value === 'string' && this.isDataSourceReference(value)) {
          inputs.push(value);
        } else if (Array.isArray(value)) {
          for (const item of value) {
            if (typeof item === 'string' && this.isDataSourceReference(item)) {
              inputs.push(item);
            }
          }
        }
      }
    }
    
    return inputs;
  }

  /**
   * Extract output data sources from execution step
   */
  private extractOutputs(step: ExecutionStep): string[] {
    // For now, assume each task produces one output with a predictable name
    // In reality, this should come from the operator's output schema
    return [`result_${step.stepId}`];
  }

  /**
   * Check if a string is a data source reference
   */
  private isDataSourceReference(value: string): boolean {
    // Data source references typically have patterns like:
    // - dataSource://id
    // - result_taskId
    // - Or just match known data source ID patterns
    return value.includes('://') || value.startsWith('result_') || /^[a-zA-Z0-9_-]+$/.test(value);
  }

  /**
   * Estimate task execution time (simplified heuristic)
   */
  private estimateTaskTime(step: ExecutionStep): number {
    // Base time estimates by operator type
    const baseTimes: Record<string, number> = {
      'buffer': 1000,
      'overlay': 2000,
      'filter': 500,
      'aggregation': 1500,
      'statistics': 1000,
      'choropleth': 3000,
      'heatmap': 3000,
      'query': 500
    };
    
    const pluginId = step.pluginId || '';
    const baseTime = baseTimes[pluginId] || 1000; // Default 1 second
    
    // Adjust based on complexity (if available in metadata)
    // TODO: Add complexity estimation based on parameter analysis
    return baseTime;
  }

  /**
   * Detect cycles in dependency graph using DFS
   */
  private hasCycle(graph: DependencyGraph): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      
      // Get all neighbors (nodes this node points to)
      const neighbors = graph.edges
        .filter(edge => edge.from === nodeId)
        .map(edge => edge.to);
      
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) return true;
        } else if (recursionStack.has(neighbor)) {
          return true; // Cycle detected
        }
      }
      
      recursionStack.delete(nodeId);
      return false;
    };
    
    for (const nodeId of graph.nodes.keys()) {
      if (!visited.has(nodeId)) {
        if (dfs(nodeId)) return true;
      }
    }
    
    return false;
  }

  /**
   * Topological sort by levels (for parallel grouping)
   * Returns array of arrays, where each inner array contains tasks that can run in parallel
   */
  private topologicalSortByLevels(graph: DependencyGraph): string[][] {
    const inDegree = new Map<string, number>();
    const levels: string[][] = [];
    
    // Initialize in-degree for all nodes
    for (const nodeId of graph.nodes.keys()) {
      inDegree.set(nodeId, 0);
    }
    
    // Calculate in-degrees
    for (const edge of graph.edges) {
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    }
    
    // Find all nodes with in-degree 0 (no dependencies)
    let currentLevel = Array.from(graph.nodes.keys())
      .filter(nodeId => inDegree.get(nodeId) === 0);
    
    while (currentLevel.length > 0) {
      levels.push(currentLevel);
      
      const nextLevel: string[] = [];
      
      for (const nodeId of currentLevel) {
        // Get all nodes that depend on this node
        const dependents = graph.edges
          .filter(edge => edge.from === nodeId)
          .map(edge => edge.to);
        
        for (const dependent of dependents) {
          const newDegree = (inDegree.get(dependent) || 1) - 1;
          inDegree.set(dependent, newDegree);
          
          if (newDegree === 0) {
            nextLevel.push(dependent);
          }
        }
      }
      
      currentLevel = nextLevel;
    }
    
    return levels;
  }

  /**
   * Calculate estimated execution time for a parallel group
   * (maximum time among parallel tasks, since they run concurrently)
   */
  private calculateGroupTime(taskIds: string[], executionPlans: Map<string, ExecutionPlan>): number {
    let maxTime = 0;
    
    // Build a lookup from stepId to step
    const stepMap = new Map<string, ExecutionStep>();
    for (const plan of executionPlans.values()) {
      for (const step of plan.steps) {
        stepMap.set(step.stepId, step);
      }
    }
    
    for (const taskId of taskIds) {
      const step = stepMap.get(taskId);
      if (step) {
        const time = this.estimateTaskTime(step);
        maxTime = Math.max(maxTime, time);
      }
    }
    
    return maxTime;
  }

  /**
   * Create sequential groups (fallback when parallel execution is not possible)
   */
  private createSequentialGroups(executionPlans: Map<string, ExecutionPlan>): ParallelGroup[] {
    const groups: ParallelGroup[] = [];
    let index = 0;
    
    // Iterate through all goals and their steps
    for (const plan of executionPlans.values()) {
      for (const step of plan.steps) {
        groups.push({
          groupId: `sequential_${index}`,
          tasks: [step.stepId],
          estimatedTimeMs: this.estimateTaskTime(step)
        });
        index++;
      }
    }
    
    return groups;
  }

  /**
   * Get execution mode recommendation based on analysis
   */
  recommendExecutionMode(parallelGroups: ParallelGroup[]): 'sequential' | 'parallel' | 'hybrid' {
    if (parallelGroups.length === 0) {
      return 'sequential';
    }
    
    if (parallelGroups.length === 1 && parallelGroups[0].tasks.length <= 1) {
      return 'sequential';
    }
    
    // Check if there are multiple tasks in any group
    const hasParallelism = parallelGroups.some(group => group.tasks.length > 1);
    
    if (hasParallelism) {
      return 'hybrid'; // Mix of parallel and sequential
    }
    
    return 'sequential';
  }

  /**
   * Calculate total estimated execution time
   */
  calculateTotalEstimatedTime(parallelGroups: ParallelGroup[]): number {
    return parallelGroups.reduce((total, group) => total + group.estimatedTimeMs, 0);
  }

  /**
   * Generate a summary report of the parallel analysis
   */
  generateReport(parallelGroups: ParallelGroup[], executionPlans: Map<string, ExecutionPlan>): string {
    const executionMode = this.recommendExecutionMode(parallelGroups);
    const totalTime = this.calculateTotalEstimatedTime(parallelGroups);
    const sequentialTime = this.calculateTotalEstimatedTime(
      this.createSequentialGroups(executionPlans)
    );
    const speedup = sequentialTime / totalTime;
    
    let report = `\n=== Parallel Execution Analysis Report ===\n`;
    report += `Execution Mode: ${executionMode}\n`;
    report += `Total Parallel Groups: ${parallelGroups.length}\n`;
    report += `Estimated Time: ${(totalTime / 1000).toFixed(2)}s\n`;
    report += `Sequential Time: ${(sequentialTime / 1000).toFixed(2)}s\n`;
    report += `Speedup: ${speedup.toFixed(2)}x\n\n`;
    
    for (const group of parallelGroups) {
      report += `[${group.groupId}] (${group.tasks.length} tasks, ~${(group.estimatedTimeMs / 1000).toFixed(2)}s)\n`;
      
      // Build a lookup from stepId to step
      const stepMap = new Map<string, ExecutionStep>();
      for (const plan of executionPlans.values()) {
        for (const step of plan.steps) {
          stepMap.set(step.stepId, step);
        }
      }
      
      for (const taskId of group.tasks) {
        const step = stepMap.get(taskId);
        report += `  - ${taskId}: ${step?.pluginId || 'unknown'}\n`;
      }
    }
    
    return report;
  }
}
