/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Task Planner Agent - Creates execution plans for each analysis goal
 */

import { z } from 'zod';
import type { LLMConfig } from '../adapters/LLMAdapterFactory';
import { LLMAdapterFactory } from '../adapters/LLMAdapterFactory';
import type { PromptManager } from '../managers/PromptManager';
import type { GeoAIStateType, ExecutionPlan, ExecutionStep } from '../workflow/GeoAIGraph';
import { SpatialOperatorRegistryInstance } from '../../spatial-operators';
import { DataSourceRepository } from '../../data-access';
import { SQLiteManagerInstance } from '../../storage/';
import { ParallelTaskAnalyzer } from '../analyzers/ParallelTaskAnalyzer';
import { DataSourceService } from '../../services/DataSourceService';

export class TaskPlannerAgent {
  private llmConfig: LLMConfig;
  private promptManager: PromptManager;
  private dataSourceService: DataSourceService;
  private parallelAnalyzer: ParallelTaskAnalyzer;

  constructor(
    llmConfig: LLMConfig,
    promptManager: PromptManager
  ) {
    this.llmConfig = llmConfig;
    this.promptManager = promptManager;
    const db = SQLiteManagerInstance.getDatabase();
    this.dataSourceService = new DataSourceService(new DataSourceRepository(db));
    this.parallelAnalyzer = new ParallelTaskAnalyzer();
  }

  /**
   * Execute task planning for all goals
   */
  async execute(state: GeoAIStateType): Promise<Partial<GeoAIStateType>> {
    if (!state.goals || state.goals.length === 0) {
      return {
        executionPlans: new Map(),
        currentStep: 'execution'
      };
    }

    try {
      // Load prompt template
      const promptTemplate = await this.promptManager.loadTemplate(
        'task-planning',
        'en-US'
      );

      // Get available operators for context (with full metadata including schemas)
      const allOperators = SpatialOperatorRegistryInstance.listOperatorsWithMetadata();

      // Get available data sources with metadata
      const dataSourcesMetadata = this.dataSourceService.formatDataSourcesForLLM();
      // Define output schema for structured output
      const stepSchema = z.object({
        stepId: z.string().describe('Unique identifier for this step'),
        operatorId: z.string().describe('ID of the spatial operator to execute'),
        parameters: z.record(z.any()).describe('Parameters to pass to the operator'),
        dependsOn: z.array(z.string()).nullable().default([]).describe('Step IDs that must complete first')
      });

      const planSchema = z.object({
        goalId: z.string().describe('ID of the goal this plan addresses'),
        steps: z.array(stepSchema).describe('Ordered list of execution steps'),
        requiredOperators: z.array(z.string()).describe('List of operator IDs required for this plan')
      });

      // Create LLM with structured output
      const llm = LLMAdapterFactory.createAdapter(this.llmConfig);
      const modelWithStructuredOutput = llm.withStructuredOutput(
        planSchema,
        { name: 'task_planner' }
      );

      // Create chain
      const chain = promptTemplate.pipe(modelWithStructuredOutput);

      // Plan each goal in parallel
      const planPromises = state.goals.map(async (goal) => {
        try {
          // STAGE 1: Determine compatible plugins using capability-based filtering
          let compatiblePluginIds: string[] = [];

          // Use capability-based filtering to find candidate plugins
          compatiblePluginIds = this.filterPluginsByGoalDescription(goal);

          // If still no compatible plugins found, create fallback plan
          if (compatiblePluginIds.length === 0) {
            const fallbackPlan: ExecutionPlan = {
              id: `plan_${goal.id}_${Date.now()}`,
              goalId: goal.id,
              steps: [],
              executionMode: 'sequential',
              createdAt: new Date(),
              requiredPlugins: []
            };
            return [goal.id, fallbackPlan] as const;
          }

          // Filter operators to only include compatible ones
          const compatibleOperators = allOperators.filter(op =>
            compatiblePluginIds.includes(op.operatorId)
          );

          // Prepare previous results context for multi-goal scenarios
          let previousResultsContext = '';
          if (state.executionResults && state.executionResults.size > 0) {
            // Collect results from goals that have already been planned/executed
            const previousGoalsResults: any[] = [];
            for (const [stepId, result] of state.executionResults.entries()) {
              if (result.status === 'success' && result.data) {
                previousGoalsResults.push({
                  stepId,
                  goalId: result.goalId,
                  type: result.data.type,
                  result: result.data.metadata?.result || result.data,
                  description: result.data.metadata?.description
                });
              }
            }

            if (previousGoalsResults.length > 0) {
              previousResultsContext = JSON.stringify(previousGoalsResults, null, 2);
            }
          }
          // console.log(`[Task Planner] dataSourcesMetadata:`, dataSourcesMetadata);
          // console.log(`[Task Planner] virtualDataSourceInfo:`, virtualDataSourceInfo);
          // STAGE 2: LLM-based selection from filtered candidates
          const plan = await chain.invoke({
            goalId: goal.id,
            goalDescription: goal.description,
            availableTools: JSON.stringify(compatibleOperators, null, 2),
            dataSourcesMetadata,
            availablePlugins: JSON.stringify(compatibleOperators.map(op => {
              const metadata = op.getMetadata();
              return {
                id: metadata.operatorId,
                name: metadata.name,
                description: metadata.description,
                parameters: metadata.inputSchema,
                outputSchema: metadata.outputSchema
              };
            }), null, 2),
            previousResults: previousResultsContext,
            timestamp: new Date().toISOString()
          }) as any; // Cast as any first since LLM output doesn't match ExecutionPlan exactly

          console.log(`[Task Planner] LLM Output for goal ${goal.id}:`, plan);
          // Transform LLM output to match ExecutionPlan interface
          // LLM returns: requiredOperators, dependsOn
          // ExecutionPlan expects: requiredPlugins, dependencies (in steps)
          const transformedPlan: ExecutionPlan = {
            id: `plan_${goal.id}_${Date.now()}`,
            goalId: plan.goalId,
            steps: (plan.steps || []).map((step: any) => ({
              ...step,
              // Map dependsOn to dependencies for compatibility with ExecutionStep interface
              dependencies: step.dependsOn || step.dependencies || []
            })),
            executionMode: 'sequential',
            createdAt: new Date(),
            requiredPlugins: plan.requiredOperators || plan.requiredPlugins || []
          };

          // STAGE 2.5: Remove duplicate steps (defensive programming)
          const deduplicatedPlan = this.removeDuplicateSteps(transformedPlan);

          // STAGE 2.6: Ensure stepId global uniqueness by adding goalId prefix if missing
          const uniqueStepIdPlan = this.ensureUniqueStepIds(deduplicatedPlan);

          // STAGE 3: Validate terminal node constraints
          const validatedPlan = this.validateTerminalNodeConstraints(uniqueStepIdPlan, compatiblePluginIds);

          if (!validatedPlan) {
            console.warn(`[Task Planner] Plan failed terminal node validation, creating fallback`);
            const fallbackPlan: ExecutionPlan = {
              id: `plan_${goal.id}_${Date.now()}`,
              goalId: goal.id,
              steps: [],
              executionMode: 'sequential',
              createdAt: new Date(),
              requiredPlugins: []
            };
            return [goal.id, fallbackPlan] as const;
          }

          console.log(`[Task Planner] Plan validated successfully with ${validatedPlan.steps.length} steps`);
          return [goal.id, validatedPlan] as const;
        } catch (error) {
          console.error(`[Task Planner] Failed to plan goal ${goal.id}:`, error);

          // Create fallback plan
          const fallbackPlan: ExecutionPlan = {
            id: `plan_${goal.id}_${Date.now()}`,
            goalId: goal.id,
            steps: [],
            executionMode: 'sequential',
            createdAt: new Date(),
            requiredPlugins: []
          };

          return [goal.id, fallbackPlan] as const;
        }
      });

      const planEntries = await Promise.all(planPromises);
      const executionPlans = new Map(planEntries);

      console.log(`[Task Planner] Created ${executionPlans.size} execution plans`);

      // STAGE 4: Analyze parallel execution opportunities
      console.log('[Task Planner] Stage 4: Analyzing parallel execution opportunities...');
      const parallelGroups = this.parallelAnalyzer.analyzeParallelGroups(executionPlans);
      const executionMode = this.parallelAnalyzer.recommendExecutionMode(parallelGroups);
      
      // Generate and log analysis report
      const report = this.parallelAnalyzer.generateReport(parallelGroups, executionPlans);
      console.log(report);

      return {
        executionPlans,
        parallelGroups, // NEW: Include parallel task groups
        executionMode,  // NEW: Include recommended execution mode
        currentStep: 'execution'
      };

    } catch (error) {
      console.error('[Task Planner] Failed to create execution plans:', error);

      // Fallback: Create empty plans for all goals
      const fallbackPlans = new Map<string, ExecutionPlan>();
      state.goals.forEach(goal => {
        fallbackPlans.set(goal.id, {
          id: `plan_${goal.id}_${Date.now()}`,
          goalId: goal.id,
          steps: [],
          executionMode: 'sequential',
          createdAt: new Date(),
          requiredPlugins: []
        });
      });

      return {
        executionPlans: fallbackPlans,
        currentStep: 'execution',
        errors: [
          ...(state.errors || []),
          {
            goalId: 'task_planner',
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        ]
      };
    }
  }

  /**
   * Ensure stepId global uniqueness by adding goalId prefix if missing
   * This is a defensive measure to prevent stepId collisions across different goals
   */
  private ensureUniqueStepIds(plan: ExecutionPlan): ExecutionPlan {
    if (!plan || !plan.steps || plan.steps.length === 0) {
      return plan;
    }

    const goalId = plan.goalId;
    let needsFixing = false;

    // Check if any stepId is missing the goalId prefix
    const fixedSteps = plan.steps.map(step => {
      // If stepId already starts with goalId, keep it as is
      if (step.stepId.startsWith(`${goalId}_`)) {
        return step;
      }

      // Otherwise, add the prefix
      needsFixing = true;
      const newStepId = `${goalId}_${step.stepId}`;
      
      console.log(`[Task Planner] Fixing stepId: "${step.stepId}" -> "${newStepId}"`);

      // Also update dependencies references if they exist
      const fixedDependencies = step.dependencies?.map((depId: string) => {
        // If dependency already has a goal prefix, keep it
        if (depId.includes('_') && !depId.startsWith(goalId)) {
          return depId; // Assume it's from another goal, keep as is
        }
        // Otherwise, add current goal's prefix
        return depId.startsWith(goalId) ? depId : `${goalId}_${depId}`;
      });

      return {
        ...step,
        stepId: newStepId,
        dependencies: fixedDependencies
      };
    });

    if (!needsFixing) {
      return plan; // No changes needed
    }

    return {
      ...plan,
      steps: fixedSteps
    };
  }

  /**
   * Filter operators based on goal description using minimal category-based filtering
   * 
   * DESIGN PRINCIPLE: Let LLM make the final decision
   * This method only excludes obviously irrelevant operators (like report generation)
   * The actual operator selection is done by LLM in Stage 2 with full semantic understanding
   */
  private filterPluginsByGoalDescription(goal: any): string[] {
    console.log(`[Task Planner] Filtering operators for goal: ${goal.id}`);
    console.log(`[Task Planner] Goal description:`, goal.description);
    
    const allOperators = SpatialOperatorRegistryInstance.listOperators();
    
    // Minimal filtering: exclude operators that are NOT spatial analysis/visualization tools
    // Report generation is handled separately by ReportDecisionNode, not as a plugin step
    const candidateOperators = allOperators.filter(op => {
      // Exclude report/textual output operators - they're handled outside the execution plan
      if (op.category === 'reporting' || op.category === 'textual') {
        return false;
      }
      
      // Include all other operators (analysis, visualization, geometry, query, etc.)
      // Let LLM decide which ones are appropriate based on goal description
      return true;
    });
    
    const candidateIds = candidateOperators.map(op => op.operatorId);
    
    console.log(`[Task Planner] Providing ${candidateIds.length} operators to LLM for selection`);
    return candidateIds;
  }

  /**
   * Validate terminal node constraints in execution plan
   * 
   * Rules:
   * 1. A goal can have AT MOST ONE terminal node
   * 2. Terminal nodes (visualization, textual) MUST be the last step
   * 3. Textual plugins require a predecessor (non-terminal) step
   * 
   * @param plan - The execution plan to validate
   * @param compatiblePluginIds - List of plugin IDs that were considered
   * @returns Validated plan or null if validation fails
   */
  private validateTerminalNodeConstraints(
    plan: ExecutionPlan,
    compatiblePluginIds: string[]
  ): ExecutionPlan | null {
    if (!plan || !plan.steps || plan.steps.length === 0) {
      return plan; // Empty plan is valid
    }

    console.log(`[Task Planner] Validating plan with ${plan.steps.length} steps`);
    console.log(`[Task Planner] Validating plan with ${plan.steps[0]?.operatorId}`);

    // Step 1: Identify terminal nodes
    const terminalPluginIds = this.getTerminalPluginIds(compatiblePluginIds);
    console.log(`[Task Planner] Terminal plugin IDs:`, terminalPluginIds);

    // Step 2: Count terminal nodes in plan
    let terminalNodeCount = 0;
    let terminalNodeIndex = -1;

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      if (terminalPluginIds.includes(step.operatorId)) {
        terminalNodeCount++;
        terminalNodeIndex = i;
      }
    }

    // Rule 1: At most one terminal node
    if (terminalNodeCount > 1) {
      console.error(`[Task Planner] VALIDATION FAILED: Plan has ${terminalNodeCount} terminal nodes (max 1 allowed)`);
      console.error(`[Task Planner] Steps:`, plan.steps.map(s => s.operatorId));
      return null;
    }

    // Rule 2: Terminal node must be the last step
    if (terminalNodeCount === 1 && terminalNodeIndex !== plan.steps.length - 1) {
      console.error(`[Task Planner] VALIDATION FAILED: Terminal node at index ${terminalNodeIndex} is not the last step`);
      console.error(`[Task Planner] Terminal node: ${plan.steps[terminalNodeIndex].operatorId}`);
      console.error(`[Task Planner] Expected at index: ${plan.steps.length - 1}`);

      // Fix: Move terminal node to the end
      console.warn(`[Task Planner] Attempting to fix: Moving terminal node to last position`);
      const fixedSteps = [...plan.steps];
      const terminalStep = fixedSteps.splice(terminalNodeIndex, 1)[0];
      fixedSteps.push(terminalStep);

      return {
        ...plan,
        steps: fixedSteps
      };
    }

    // Rule 3: Textual plugins validation removed
    // Report generation is now handled by ReportDecisionNode at workflow level,
    // not as a plugin step in the execution plan.
    // Other textual plugins can be added here if needed in the future.

    console.log(`[Task Planner] Terminal node validation PASSED`);
    return plan;
  }

  /**
   * Get list of operator IDs that are terminal nodes
   * Terminal nodes: visualization operators
   */
  private getTerminalPluginIds(pluginIds: string[]): string[] {
    // Visualization operators are terminal nodes
    const allOperators = SpatialOperatorRegistryInstance.listOperators();
    const visualizationIds = allOperators
      .filter(op => op.category === 'visualization')
      .map(op => op.operatorId);
    
    // Return intersection of pluginIds and visualization operators
    return pluginIds.filter(id => visualizationIds.includes(id));
  }

  /**
   * Remove duplicate steps from execution plan
   * Keeps only the first occurrence of each plugin
   * This is a defensive measure against LLM generating duplicate steps
   * 
   * @param plan - The execution plan to deduplicate
   * @returns Deduplicated execution plan
   */
  private removeDuplicateSteps(plan: ExecutionPlan): ExecutionPlan {
    if (!plan || !plan.steps || plan.steps.length === 0) {
      return plan;
    }

    const seenOperators = new Set<string>();
    const uniqueSteps: ExecutionStep[] = [];
    const uniqueOperatorIds: string[] = [];

    for (const step of plan.steps) {
      if (!seenOperators.has(step.operatorId)) {
        seenOperators.add(step.operatorId);
        uniqueSteps.push(step);
        if (!uniqueOperatorIds.includes(step.operatorId)) {
          uniqueOperatorIds.push(step.operatorId);
        }
      } else {
        console.warn(`[Task Planner] Removing duplicate step with operator: ${step.operatorId}`);
      }
    }

    return {
      ...plan,
      steps: uniqueSteps,
      requiredPlugins: uniqueOperatorIds
    };
  }
}
