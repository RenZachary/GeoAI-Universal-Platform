/**
 * Task Planner Agent - Creates execution plans for each analysis goal
 */

import { z } from 'zod';
import type { LLMConfig } from '../adapters/LLMAdapterFactory';
import { LLMAdapterFactory } from '../adapters/LLMAdapterFactory';
import type { PromptManager } from '../managers/PromptManager';
import type { GeoAIStateType, ExecutionPlan, ExecutionStep } from '../workflow/GeoAIGraph';
import { ToolRegistryInstance } from '../../plugin-orchestration';
import { DataSourceRepository } from '../../data-access/repositories';
import { SQLiteManagerInstance } from '../../storage/';
import { PluginCapabilityRegistry } from '../../plugin-orchestration';

export class TaskPlannerAgent {
  private llmConfig: LLMConfig;
  private promptManager: PromptManager;
  private dataSourceRepo: DataSourceRepository;

  constructor(
    llmConfig: LLMConfig,
    promptManager: PromptManager
  ) {
    this.llmConfig = llmConfig;
    this.promptManager = promptManager;
    this.dataSourceRepo = new DataSourceRepository(SQLiteManagerInstance.getDatabase());
  }

  /**
   * Execute task planning for all goals
   */
  async execute(state: GeoAIStateType): Promise<Partial<GeoAIStateType>> {
    console.log('[Task Planner] Creating execution plans...');

    if (!state.goals || state.goals.length === 0) {
      console.warn('[Task Planner] No goals to plan');
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

      // Get available tools for context
      const allTools = ToolRegistryInstance.listToolsWithMetadata();

      // Get available data sources with metadata
      const dataSources = this.dataSourceRepo.listAll();
      const dataSourcesMetadata = this.formatDataSourcesForLLM(dataSources);

      // Define output schema for structured output
      const stepSchema = z.object({
        stepId: z.string().describe('Unique identifier for this step'),
        pluginId: z.string().describe('ID of the plugin/tool to execute'),
        parameters: z.record(z.any()).describe('Parameters to pass to the plugin'),
        dependsOn: z.array(z.string()).nullable().default([]).describe('Step IDs that must complete first')
      });

      const planSchema = z.object({
        goalId: z.string().describe('ID of the goal this plan addresses'),
        steps: z.array(stepSchema).describe('Ordered list of execution steps'),
        requiredPlugins: z.array(z.string()).describe('List of plugin IDs required for this plan')
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
          // STAGE 1: Use required executors from goal (no filtering needed)
          console.log(`[Task Planner] Stage 1: Processing goal ${goal.id}`);
          console.log(`[Task Planner] Required executors:`, goal.requiredExecutors);

          // Use the required executors directly - no category filtering
          const compatiblePluginIds = goal.requiredExecutors || [];

          if (compatiblePluginIds.length === 0) {
            console.warn(`[Task Planner] No executors specified for goal ${goal.id}`);
          }

          console.log(`[Task Planner] Stage 1: Found ${compatiblePluginIds.length} required executors:`, compatiblePluginIds);

          // If no compatible plugins found, create fallback plan
          if (compatiblePluginIds.length === 0) {
            console.warn(`[Task Planner] No compatible plugins found for goal ${goal.id}`);
            const fallbackPlan: ExecutionPlan = {
              goalId: goal.id,
              steps: [],
              requiredPlugins: []
            };
            return [goal.id, fallbackPlan] as const;
          }

          // Filter tools to only include compatible ones
          const compatibleTools = allTools.filter(tool =>
            compatiblePluginIds.includes(tool.id)
          );

          console.log(`[Task Planner] Stage 2: LLM selection from ${compatibleTools.length} candidates`);

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
              console.log(`[Task Planner] Providing ${previousGoalsResults.length} previous results as context`);
            }
          }

          // STAGE 2: LLM-based selection from filtered candidates
          const plan = await chain.invoke({
            goalDescription: goal.description,
            availableTools: JSON.stringify(compatibleTools, null, 2),
            dataSourcesMetadata,
            availablePlugins: JSON.stringify(compatibleTools.map(t => ({
              id: t.id,
              name: t.name,
              description: t.description,
              parameters: t.parameters,
              outputSchema: t.outputSchema  // Include output schema for placeholder reference
            })), null, 2),
            previousResults: previousResultsContext,
            timestamp: new Date().toISOString()
          }) as ExecutionPlan;

          // STAGE 2.5: Remove duplicate steps (defensive programming)
          const deduplicatedPlan = this.removeDuplicateSteps(plan);
          if (deduplicatedPlan.steps.length !== plan.steps.length) {
            console.warn(`[Task Planner] Removed ${plan.steps.length - deduplicatedPlan.steps.length} duplicate steps from plan`);
            console.log(`[Task Planner] Original steps:`, plan.steps.map(s => s.pluginId));
            console.log(`[Task Planner] Deduplicated steps:`, deduplicatedPlan.steps.map(s => s.pluginId));
          }

          // STAGE 3: Validate terminal node constraints
          console.log(`[Task Planner] Stage 3: Validating terminal node constraints for goal ${goal.id}`);
          const validatedPlan = this.validateTerminalNodeConstraints(deduplicatedPlan, compatiblePluginIds);

          if (!validatedPlan) {
            console.warn(`[Task Planner] Plan failed terminal node validation, creating fallback`);
            const fallbackPlan: ExecutionPlan = {
              goalId: goal.id,
              steps: [],
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
            goalId: goal.id,
            steps: [],
            requiredPlugins: []
          };

          return [goal.id, fallbackPlan] as const;
        }
      });

      const planEntries = await Promise.all(planPromises);
      const executionPlans = new Map(planEntries);

      console.log(`[Task Planner] Created ${executionPlans.size} execution plans`);

      return {
        executionPlans,
        currentStep: 'execution'
      };

    } catch (error) {
      console.error('[Task Planner] Failed to create execution plans:', error);

      // Fallback: Create empty plans for all goals
      const fallbackPlans = new Map<string, ExecutionPlan>();
      state.goals.forEach(goal => {
        fallbackPlans.set(goal.id, {
          goalId: goal.id,
          steps: [],
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
   * Format data sources for LLM context injection
   * Creates a human-readable summary of available data sources with schema information
   */
  private formatDataSourcesForLLM(dataSources: any[]): string {
    if (!dataSources || dataSources.length === 0) {
      return 'No data sources available. User must upload or register data sources first.';
    }

    const formatted = dataSources.map(ds => {
      const lines = [
        `- ID: ${ds.id}`,
        `  Name: ${ds.name}`,
        `  Type: ${ds.type}`,
        `  Description: ${ds.metadata?.description || 'No description'}`
      ];

      // Add type-specific info
      if (ds.type === 'postgis') {
        const refParts = ds.reference?.split('/') || [];
        const tableName = refParts[refParts.length - 1] || 'unknown';
        lines.push(`  Table: ${tableName}`);

        // Add geometry info if available
        if (ds.metadata?.geometryType) {
          lines.push(`  Geometry: ${ds.metadata.geometryType} (SRID: ${ds.metadata.srid || 'unknown'})`);
        }

        // Add row count if available
        if (ds.metadata?.rowCount !== undefined) {
          lines.push(`  Rows: ${ds.metadata.rowCount.toLocaleString()}`);
        }

        // Add field information if available in metadata
        if (ds.metadata?.fields && Array.isArray(ds.metadata.fields)) {
          const numericFields = ds.metadata.fields.filter((f: any) =>
            ['integer', 'numeric', 'float', 'double precision', 'real'].includes(f.dataType?.toLowerCase())
          );
          const textFields = ds.metadata.fields.filter((f: any) =>
            ['character varying', 'text', 'varchar', 'char'].includes(f.dataType?.toLowerCase())
          );

          if (numericFields.length > 0) {
            lines.push(`  Numeric Fields: ${numericFields.map((f: any) => f.columnName).join(', ')}`);
          }
          if (textFields.length > 0) {
            lines.push(`  Text Fields: ${textFields.map((f: any) => f.columnName).join(', ')}`);
          }
        }
      } else if (ds.type === 'geojson' || ds.type === 'shapefile') {
        lines.push(`  File: ${ds.reference?.split('/').pop() || 'unknown'}`);

        // Add geometry type if available
        if (ds.metadata?.geometryType) {
          lines.push(`  Geometry: ${ds.metadata.geometryType}`);
        }

        // Add feature count if available
        if (ds.metadata?.featureCount !== undefined) {
          lines.push(`  Features: ${ds.metadata.featureCount.toLocaleString()}`);
        }

        // Add field information if available
        if (ds.metadata?.fields && Array.isArray(ds.metadata.fields)) {
          const sampleValues = ds.metadata.sampleValues || {};

          // Support both formats: string[] or Array<{name: string; type: string}>
          const fieldInfo = ds.metadata.fields.slice(0, 8).map((field: any) => {
            // If field is an object with name and type
            if (typeof field === 'object' && field.name) {
              const fieldName = field.name;
              const fieldType = field.type || 'unknown';
              const info = sampleValues[fieldName];
              if (info?.isNumeric || fieldType === 'number' || fieldType === 'integer') {
                return `${fieldName} (${fieldType})`;
              }
              return `${fieldName} (${fieldType})`;
            }
            // If field is a string (legacy format)
            else if (typeof field === 'string') {
              const info = sampleValues[field];
              if (info?.isNumeric) {
                return `${field} (numeric)`;
              }
              return field;
            }
            return String(field);
          });
          lines.push(`  Fields: ${fieldInfo.join(', ')}`);
        }
      }

      return lines.join('\n');
    }).join('\n\n');

    return `Available Data Sources (${dataSources.length}):\n\n${formatted}`;
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

    // Step 1: Identify terminal nodes
    const terminalPluginIds = this.getTerminalPluginIds(compatiblePluginIds);
    console.log(`[Task Planner] Terminal plugin IDs:`, terminalPluginIds);

    // Step 2: Count terminal nodes in plan
    let terminalNodeCount = 0;
    let terminalNodeIndex = -1;

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      if (terminalPluginIds.includes(step.pluginId)) {
        terminalNodeCount++;
        terminalNodeIndex = i;
      }
    }

    // Rule 1: At most one terminal node
    if (terminalNodeCount > 1) {
      console.error(`[Task Planner] VALIDATION FAILED: Plan has ${terminalNodeCount} terminal nodes (max 1 allowed)`);
      console.error(`[Task Planner] Steps:`, plan.steps.map(s => s.pluginId));
      return null;
    }

    // Rule 2: Terminal node must be the last step
    if (terminalNodeCount === 1 && terminalNodeIndex !== plan.steps.length - 1) {
      console.error(`[Task Planner] VALIDATION FAILED: Terminal node at index ${terminalNodeIndex} is not the last step`);
      console.error(`[Task Planner] Terminal node: ${plan.steps[terminalNodeIndex].pluginId}`);
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

    // Rule 3: Textual plugins can work standalone or with predecessor
    // In multi-goal scenarios, textual plugins may need to access previous goals' results
    // This will be handled at execution time by injecting context from state.results
    const textualPluginIds = ['report_generator']; // Add other textual plugins here
    if (terminalNodeCount === 1) {
      const terminalStep = plan.steps[terminalNodeIndex];
      if (textualPluginIds.includes(terminalStep.pluginId) && plan.steps.length === 1) {
        console.warn(`[Task Planner] Textual plugin '${terminalStep.pluginId}' has no predecessor in current plan`);
        console.warn(`[Task Planner] Will attempt to inject previous results at execution time`);
        // Don't fail validation - allow execution to proceed
        // The executor will handle missing data gracefully
      }
    }

    console.log(`[Task Planner] Terminal node validation PASSED`);
    return plan;
  }

  /**
   * Get list of plugin IDs that are terminal nodes
   * Terminal nodes: visualization and textual plugins
   */
  private getTerminalPluginIds(pluginIds: string[]): string[] {
    // These are known terminal node categories
    const terminalCategories = ['visualization', 'textual'];

    const terminalIds: string[] = [];

    for (const pluginId of pluginIds) {
      const capability = PluginCapabilityRegistry.getCapability(pluginId);
      if (capability && terminalCategories.includes(capability.executionCategory)) {
        terminalIds.push(pluginId);
      }
    }

    return terminalIds;
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

    const seenPlugins = new Set<string>();
    const uniqueSteps: ExecutionStep[] = [];
    const uniquePluginIds: string[] = [];

    for (const step of plan.steps) {
      if (!seenPlugins.has(step.pluginId)) {
        seenPlugins.add(step.pluginId);
        uniqueSteps.push(step);
        if (!uniquePluginIds.includes(step.pluginId)) {
          uniquePluginIds.push(step.pluginId);
        }
      } else {
        console.warn(`[Task Planner] Removing duplicate step with plugin: ${step.pluginId}`);
      }
    }

    return {
      ...plan,
      steps: uniqueSteps,
      requiredPlugins: uniquePluginIds
    };
  }
}
