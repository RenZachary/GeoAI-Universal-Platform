/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GeoAI Graph - LangGraph StateGraph for orchestrating analysis workflow
 */

import { StateGraph, Annotation, END, START } from '@langchain/langgraph';
import type { BaseMessage} from '@langchain/core/messages';
import { HumanMessage } from '@langchain/core/messages';
import type { LLMConfig } from '../adapters/LLMAdapterFactory';
import type Database from 'better-sqlite3';
import { PromptManager } from '../managers/PromptManager';
import { GoalSplitterAgent } from '../agents/GoalSplitterAgent';
import { TaskPlannerAgent } from '../agents/TaskPlannerAgent';
import { ConversationBufferMemoryWithSQLite } from '../managers/ConversationMemoryManager';
import { SummaryGenerator } from './SummaryGenerator';
import { reportDecisionNode } from './nodes/ReportDecisionNode';
import { EnhancedExecutorInstance } from './nodes/EnhancedPluginExecutor';
import { SQLiteManagerInstance } from '../../storage/';
import { VirtualDataSourceManagerInstance } from '../../data-access/managers/VirtualDataSourceManager';
import { ToolRegistryInstance } from '../tools/ToolRegistry';
import type { ParallelGroup } from '../analyzers/ParallelTaskAnalyzer';
import { VisualizationServicePublisher } from '../../services/VisualizationServicePublisher';
import type {
  AnalysisGoal,
  ExecutionPlan as CoreExecutionPlan,
  ExecutionStep as CoreExecutionStep,
  AnalysisResult as CoreAnalysisResult
} from '../../core';

// State interface for the GeoAI workflow
export interface GeoAIState {
  userInput: string;
  conversationId: string;
  messages?: BaseMessage[];
  goals?: AnalysisGoal[];
  executionPlans?: Map<string, ExecutionPlan>;
  parallelGroups?: ParallelGroup[]; // NEW v2.0: Parallel task groups
  executionMode?: 'sequential' | 'parallel' | 'hybrid'; // NEW v2.0: Execution mode recommendation
  executionResults?: Map<string, AnalysisResult>;
  visualizationServices?: VisualizationService[];
  summary?: string;
  currentStep: 'goal_splitting' | 'task_planning' | 'execution' | 'output' | 'summary';
  errors?: Array<{ goalId: string; error: string }>;
}

// Re-export types for external use (with workflow extensions)
export {
  AnalysisGoal,
  ParallelGroup
};

/**
 * Workflow-specific ExecutionPlan extending core with operator tracking
 */
export interface ExecutionPlan extends Omit<CoreExecutionPlan, 'steps'> {
  goalId: string;
  steps: ExecutionStep[];
  requiredPlugins: string[];
}

/**
 * Workflow-specific ExecutionStep with operator ID mapping
 */
export interface ExecutionStep extends CoreExecutionStep {
  stepId: string;
  operatorId: string; // SpatialOperator ID (matches TaskPlanner output)
}

/**
 * Workflow-specific AnalysisResult with execution metadata
 */
export interface AnalysisResult extends Omit<CoreAnalysisResult, 'completedAt'> {
  id: string;
  goalId: string;
  status: 'success' | 'failed';
  data?: any;
  returnType?: 'spatial' | 'analytical' | 'textual'; // NEW: Operator return type for smart placeholder resolution
  error?: string;
  metadata?: Record<string, any>; // Operator execution metadata (operatorId, executedAt, etc.)
}

export interface VisualizationService {
  id: string;
  stepId?: string;
  goalId?: string;
  type: 'mvt' | 'wms' | 'geojson' | 'image' | 'report';
  url: string;
  ttl: number;
  expiresAt: Date;
  metadata?: Record<string, any>;
}

// Define state using Annotation
const GeoAIStateAnnotation = Annotation.Root({
  userInput: Annotation<string>,
  conversationId: Annotation<string>,
  messages: Annotation<BaseMessage[]>,
  goals: Annotation<AnalysisGoal[]>,
  executionPlans: Annotation<Map<string, ExecutionPlan>>,
  parallelGroups: Annotation<ParallelGroup[]>, // NEW v2.0
  executionMode: Annotation<'sequential' | 'parallel' | 'hybrid'>, // NEW v2.0
  executionResults: Annotation<Map<string, AnalysisResult>>,
  visualizationServices: Annotation<VisualizationService[]>,
  summary: Annotation<string>,
  currentStep: Annotation<'goal_splitting' | 'task_planning' | 'execution' | 'output' | 'summary'>,
  errors: Annotation<Array<{ goalId: string; error: string }>>,
});

export type GeoAIStateType = typeof GeoAIStateAnnotation.State;

/**
 * Create the GeoAI workflow graph with conversation memory support
 */
export function createGeoAIGraph(
  llmConfig: LLMConfig, 
  workspaceBase: string, 
  onPartialResult?: (service: VisualizationService) => void
) {
  // Initialize managers and agents
  const promptManager = new PromptManager(workspaceBase);
  const goalSplitter = new GoalSplitterAgent(llmConfig, promptManager);
  
  // Get database instance with validation
  let db: Database.Database | null = null;
  try {
    db = SQLiteManagerInstance.getDatabase();
    // Validate that db has the expected methods
    if (!db || typeof db.prepare !== 'function') {
      console.warn('[GeoAIGraph] Invalid database instance - TaskPlanner will have limited data source context');
      db = null;
    }
  } catch (error) {
    console.warn('[GeoAIGraph] Failed to get database instance:', error);
    db = null;
  }
  
  const taskPlanner = new TaskPlannerAgent(llmConfig, promptManager);
  
  // Initialize service publisher and summary generator
  const summaryGenerator = new SummaryGenerator(workspaceBase, 'en-US', llmConfig);
  
  const workflow = new StateGraph(GeoAIStateAnnotation)
    // Memory Loading Node - Load conversation history at start
    .addNode('memoryLoader', async (state: GeoAIStateType) => {
      console.log('[Memory Loader] Loading conversation history');
      
      if (!db || !state.conversationId) {
        console.log('[Memory Loader] No database or conversation ID, skipping memory load');
        return { messages: [] };
      }
      
      try {
        // Create memory instance
        const memory = new ConversationBufferMemoryWithSQLite(state.conversationId, db);
        
        // Load conversation history
        const memoryVars = await memory.loadMemoryVariables({});
        const messages = memoryVars.history as BaseMessage[];
        
        console.log(`[Memory Loader] Loaded ${messages.length} previous messages`);
        
        // Add current user message to messages array
        const currentMessage = new HumanMessage({ content: state.userInput });
        const allMessages = [...messages, currentMessage];
        
        return {
          messages: allMessages,
          currentStep: 'goal_splitting'
        };
      } catch (error) {
        console.error('[Memory Loader] Error loading memory:', error);
        // Continue without memory on error
        return {
          messages: [new HumanMessage({ content: state.userInput })],
          currentStep: 'goal_splitting'
        };
      }
    })
    .addNode('goalSplitter', async (state: GeoAIStateType) => {
      console.log('[Goal Splitter Node] Processing user input:', state.userInput);
      return await goalSplitter.execute(state);
    })
    .addNode('taskPlanner', async (state: GeoAIStateType) => {
      console.log('[Task Planner Node] Planning execution');
      return await taskPlanner.execute(state);
    })
    .addNode('pluginExecutor', async (state: GeoAIStateType) => {
      // Use EnhancedPluginExecutor for parallel execution
      const result = await EnhancedExecutorInstance.executeWithParallelSupport(state);
      
      // Get execution metrics
      const metrics = EnhancedExecutorInstance.getMetrics();
      if (metrics) {
        console.log(EnhancedExecutorInstance.generateSummary());
      }
      
      // Publish visualization services using unified publisher
      const allServices: VisualizationService[] = [];
      
      if (result.executionResults) {
        // Register ALL successful results with NativeData structure as virtual data sources
        // This enables cross-step reference via placeholders like {step_id.result.id}
        const successfulResults = new Map<string, AnalysisResult>();
        for (const [stepId, analysisResult] of result.executionResults.entries()) {
          if (analysisResult.status === 'success' && analysisResult.data) {
            // Check if result has NativeData structure (has id, type, reference)
            const hasNativeDataStructure = analysisResult.data.id && 
                                           analysisResult.data.type && 
                                           analysisResult.data.reference;
            
            if (hasNativeDataStructure) {
              // Register as virtual data source for cross-step reference
              VirtualDataSourceManagerInstance.register({
                id: analysisResult.data.id,
                conversationId: state.conversationId,
                stepId: stepId,
                data: analysisResult.data as any
              });
              
              // Add to successful results for potential MVT publishing
              successfulResults.set(stepId, analysisResult);
            } else {
              // Skip non-NativeData results
            }
          }
        }
        
        // Publish services using unified VisualizationServicePublisher
        if (successfulResults.size > 0) {
          const unifiedPublisher = VisualizationServicePublisher.getInstance(workspaceBase, db || undefined);
          
          for (const [stepId, analysisResult] of successfulResults.entries()) {
            try {
              // ARCHITECTURAL DECISION: Only publish results from visualization operators
              // This ensures that styling is always applied and prevents duplicate layers
              const operatorId = analysisResult.metadata?.operatorId;
              let shouldPublish = false;
              
              if (operatorId) {
                const operator = ToolRegistryInstance.getOperator(operatorId);
                if (operator && operator.category === 'visualization') {
                  shouldPublish = true;
                }
              } else {
                // Fallback: If no operatorId in metadata, check if it's a report
                const dataType = analysisResult.data.type || 'geojson';
                if (dataType.toLowerCase() === 'report' || dataType.toLowerCase() === 'markdown') {
                  shouldPublish = true;
                }
              }
              
              if (!shouldPublish) continue;

              const dataType = analysisResult.data.type || 'geojson';
              let publishResult: any = null;
              
              switch (dataType.toLowerCase()) {
                case 'report':
                case 'markdown':
                  publishResult = unifiedPublisher.publishReport(
                    stepId,
                    analysisResult.data.content || '',
                    86400000 // 24 hours for reports
                  );
                  break;
                  
                default: {
                  // All vector data from visualization operators should be published as MVT
                  const mvtOptions = {
                    minZoom: 0,
                    maxZoom: 18,
                    extent: 4096,
                    layerName: 'default'
                  };
                  
                  // Use unified VisualizationServicePublisher with NativeData (no conversion needed)
                  publishResult = await unifiedPublisher.publishMVTFromNativeData(
                    analysisResult.data,  // Pass NativeData directly
                    mvtOptions,
                    stepId,               // Use stepId as service ID
                    3600000               // 1 hour TTL
                  );
                  
                  break;
                }
              }
              
              if (publishResult.success && publishResult.metadata) {
                const service: VisualizationService = {
                  id: publishResult.serviceId || stepId,
                  stepId,
                  goalId: analysisResult.goalId,
                  type: publishResult.metadata.type as VisualizationService['type'],
                  url: publishResult.url || '',
                  ttl: publishResult.metadata.ttl || 3600000,
                  expiresAt: publishResult.metadata.expiresAt || new Date(Date.now() + 3600000),
                  metadata: {
                    // Merge operator metadata (operatorId, etc.) with data metadata (styleConfig, etc.)
                    ...analysisResult.metadata,  // Contains operatorId, executedAt
                    ...publishResult.metadata.metadata  // Contains styleConfig, geometryType, etc.
                  }
                };
                
                allServices.push(service);
                
                // Stream partial results to frontend if callback provided
              }
            } catch (error) {
              console.error(`[Plugin Executor] Failed to publish service for ${stepId}:`, error);
            }
          }
        }
      }
      
      return {
        currentStep: 'execution',
        executionResults: result.executionResults,
        visualizationServices: allServices,
        errors: result.errors
      };
    })
    .addNode('outputGenerator', async (state: GeoAIStateType) => {
      console.log('[Output Generator] Preserving visualization services');
      
      // Services have already been published incrementally in pluginExecutor
      // This node just preserves them (including any reports from ReportDecisionNode)
      const existingServices = state.visualizationServices || [];
      
      console.log(`[Output Generator] Total services: ${existingServices.length}`);
      
      return {
        currentStep: 'output',
        visualizationServices: existingServices,
      };
    })
    .addNode('reportDecision', async (state: GeoAIStateType) => {
      return await reportDecisionNode(state, { 
        llmConfig, 
        workspaceBase,
        onPartialResult // Pass the streaming callback
      });
    })
    .addNode('summaryGenerator', async (state: GeoAIStateType) => {
      console.log('[Summary Generator] Creating analysis summary');
      
      // Generate summary using template-based approach
      const summary = await summaryGenerator.generate(state, {
        includeGoals: true,
        includeResults: true,
        includeServices: true,
        includeErrors: true,
        includeNextSteps: true
      });
      
      console.log('[Summary Generator] Summary generated');
      
      // Save conversation memory as side effect
      if (db && state.conversationId) {
        try {
          const memory = new ConversationBufferMemoryWithSQLite(state.conversationId, db);
          await memory.saveContext(
            { input: state.userInput },
            { output: summary || 'Analysis completed' }
          );
          console.log('[Summary Generator] Conversation saved to memory');
        } catch (error) {
          console.error('[Summary Generator] Error saving memory:', error);
          // Don't fail the workflow if memory save fails
        }
      }
      
      return {
        currentStep: 'summary',
        summary,
      };
    });

  // Define edges
  workflow.addEdge(START, 'memoryLoader');
  workflow.addEdge('memoryLoader', 'goalSplitter');
  workflow.addEdge('goalSplitter', 'taskPlanner');
  workflow.addEdge('taskPlanner', 'pluginExecutor');
  workflow.addEdge('pluginExecutor', 'reportDecision');
  workflow.addEdge('reportDecision', 'outputGenerator');
  workflow.addEdge('outputGenerator', 'summaryGenerator');
  workflow.addEdge('summaryGenerator', END);

  // Set entry point
  //workflow.setEntryPoint('memoryLoader');

  return workflow;
}

/**
 * Compile and return the runnable graph
 */
export function compileGeoAIGraph(
  llmConfig: LLMConfig, 
  workspaceBase: string, 
  onPartialResult?: (service: VisualizationService) => void
) {
  const graph = createGeoAIGraph(llmConfig, workspaceBase, onPartialResult);
  return graph.compile();
}
