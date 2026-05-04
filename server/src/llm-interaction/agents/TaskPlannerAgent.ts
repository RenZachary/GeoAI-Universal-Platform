/**
 * Task Planner Agent - Creates execution plans for each analysis goal
 */

import { z } from 'zod';
import type { LLMConfig } from '../adapters/LLMAdapterFactory.js';
import { LLMAdapterFactory } from '../adapters/LLMAdapterFactory.js';
import type { PromptManager } from '../managers/PromptManager.js';
import type { GeoAIStateType, ExecutionPlan} from '../workflow/GeoAIGraph.js';
import type { ToolRegistry } from '../../plugin-orchestration';
import { DataSourceRepository } from '../../data-access/repositories';
import type Database from 'better-sqlite3';

export class TaskPlannerAgent {
  private llmConfig: LLMConfig;
  private promptManager: PromptManager;
  private toolRegistry: ToolRegistry;
  private dataSourceRepo: DataSourceRepository;

  constructor(
    llmConfig: LLMConfig,
    promptManager: PromptManager,
    toolRegistry: ToolRegistry,
    db: Database.Database
  ) {
    this.llmConfig = llmConfig;
    this.promptManager = promptManager;
    this.toolRegistry = toolRegistry;
    this.dataSourceRepo = new DataSourceRepository(db);
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
      const availableTools = this.toolRegistry.listToolsWithMetadata();
      
      // Get available data sources with metadata
      const dataSources = this.dataSourceRepo.listAll();
      const dataSourcesMetadata = this.formatDataSourcesForLLM(dataSources);

      // Define output schema for structured output
      const stepSchema = z.object({
        stepId: z.string().describe('Unique identifier for this step'),
        pluginId: z.string().describe('ID of the plugin/tool to execute'),
        parameters: z.record(z.any()).describe('Parameters to pass to the plugin'),
        dependsOn: z.array(z.string()).optional().describe('Step IDs that must complete first')
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
          const plan = await chain.invoke({
            goalDescription: goal.description,
            goalType: goal.type,
            availableTools: JSON.stringify(availableTools, null, 2),
            dataSourcesMetadata,
            availablePlugins: JSON.stringify(availableTools.map(t => ({
              id: t.name,
              description: t.description,
              parameters: t.parameters  // Fixed: use 'parameters' not 'schema'
            })), null, 2),
            previousResults: '',  // TODO: Add previous results context
            timestamp: new Date().toISOString()
          }) as ExecutionPlan;

          return [goal.id, plan] as const;
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
          const fieldInfo = ds.metadata.fields.slice(0, 8).map((field: string) => {
            const info = sampleValues[field];
            if (info?.isNumeric) {
              return `${field} (numeric)`;
            }
            return field;
          });
          lines.push(`  Fields: ${fieldInfo.join(', ')}`);
        }
      }
      
      return lines.join('\n');
    }).join('\n\n');

    return `Available Data Sources (${dataSources.length}):\n\n${formatted}`;
  }
}
