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
import { ServicePublisher } from './ServicePublisher';
import { SummaryGenerator } from './SummaryGenerator';
import { reportDecisionNode } from './nodes/ReportDecisionNode';
import { EnhancedExecutorInstance } from './nodes/EnhancedPluginExecutor';
import { SQLiteManagerInstance } from '../../storage/';
import { VirtualDataSourceManagerInstance } from '../../data-access/managers/VirtualDataSourceManager';
import type { ParallelGroup } from '../analyzers/ParallelTaskAnalyzer';
import { VisualizationServicePublisher } from '../../services/VisualizationServicePublisher';
import { MVTStrategyPublisher } from '../../utils/publishers/MVTStrategyPublisher';

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

// Supporting types
export interface AnalysisGoal {
  id: string;
  description: string;
  priority?: number;
  parameters?: Record<string, any>; // Optional extracted parameters (e.g., colorRamp, valueField)
}

export interface ExecutionPlan {
  goalId: string;
  steps: ExecutionStep[];
  requiredPlugins: string[];
}

// Re-export ParallelGroup for external use
export type { ParallelGroup } from '../analyzers/ParallelTaskAnalyzer';

export interface ExecutionStep {
  stepId: string;
  operatorId: string; // SpatialOperator ID (matches TaskPlanner output)
  parameters: Record<string, any>;
  dependsOn?: string[];
}

export interface AnalysisResult {
  id: string;
  goalId: string;
  status: 'success' | 'failed';
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
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
  onPartialResult?: (service: VisualizationService) => void,  // Callback for incremental streaming
  streamWriter?: any  // Stream writer for sending tool events
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
      console.log('[Plugin Executor] Starting enhanced execution with parallel support');
      
      // Use EnhancedPluginExecutor for parallel execution
      const result = await EnhancedExecutorInstance.executeWithParallelSupport(state, streamWriter);
      
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
              console.log(`[Plugin Executor] Registered virtual data source for step ${stepId}: ${analysisResult.data.id}`);
              
              // Add to successful results for potential MVT publishing
              successfulResults.set(stepId, analysisResult);
            } else {
              console.log(`[Plugin Executor] Step ${stepId} result is not NativeData, skipping virtual source registration`);
            }
          }
        }
        
        // Publish services using unified VisualizationServicePublisher
        if (successfulResults.size > 0) {
          const unifiedPublisher = VisualizationServicePublisher.getInstance(workspaceBase, db || undefined);
          
          for (const [stepId, analysisResult] of successfulResults.entries()) {
            try {
              const dataType = analysisResult.data.type || 'geojson';
              let publishResult;
              
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
                  // All vector data should be published as MVT using MVTStrategyPublisher
                  // MVTStrategyPublisher supports GeoJSON, Shapefile, and PostGIS natively
                  console.log(`[Plugin Executor] Publishing MVT for step ${stepId}, data type: ${analysisResult.data.type}`);
                  console.log(`[Plugin Executor] analysisResult.data structure:`, JSON.stringify({
                    id: analysisResult.data?.id,
                    type: analysisResult.data?.type,
                    reference: analysisResult.data?.reference,
                    hasMetadata: !!analysisResult.data?.metadata,
                    metadataKeys: analysisResult.data?.metadata ? Object.keys(analysisResult.data.metadata) : []
                  }, null, 2));
                  
                  const mvtStrategyPublisher = MVTStrategyPublisher.getInstance(workspaceBase, db || undefined);
                  
                  const mvtOptions = {
                    minZoom: 0,
                    maxZoom: 18,
                    extent: 4096,
                    layerName: 'default'
                  };
                  
                  // Use MVTStrategyPublisher which handles different data types correctly
                  const mvtResult = await mvtStrategyPublisher.publish(analysisResult.data, mvtOptions);
                  console.log(`[Plugin Executor] MVT publish result:`, mvtResult);
                  
                  if (mvtResult.success) {
                    // Convert MVTStrategyPublisher result to ServicePublishResult format
                    publishResult = {
                      success: true,
                      serviceId: mvtResult.tilesetId,
                      url: mvtResult.serviceUrl,
                      metadata: {
                        id: mvtResult.tilesetId,
                        type: 'mvt',
                        url: mvtResult.serviceUrl,
                        createdAt: new Date(),
                        ttl: 3600000,
                        expiresAt: new Date(Date.now() + 3600000),
                        metadata: mvtResult.metadata
                      }
                    };
                    console.log(`[Plugin Executor] MVT service created: ${publishResult.serviceId}`);
                  } else {
                    console.error(`[Plugin Executor] MVT publish failed:`, mvtResult.error);
                    publishResult = {
                      success: false,
                      error: mvtResult.error
                    };
                  }
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
                
                console.log(`[Plugin Executor] Published ${publishResult.metadata.type} service: ${publishResult.serviceId}`);
                
                // Stream partial results to frontend if callback provided
                if (onPartialResult) {
                  console.log(`[Plugin Executor] Streaming partial result: ${service.id}`);
                  onPartialResult(service);
                }
              }
            } catch (error) {
              console.error(`[Plugin Executor] Failed to publish service for ${stepId}:`, error);
            }
          }
          
          console.log(`[Plugin Executor] Published ${allServices.length} visualization services via unified publisher`);
        }
      }
      
      console.log(`[Plugin Executor] Execution complete. Results: ${result.executionResults?.size || 0}, Services: ${allServices.length}`);
      
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
  onPartialResult?: (service: VisualizationService) => void,
  streamWriter?: any // Add streamWriter for sending tool events
) {
  const graph = createGeoAIGraph(llmConfig, workspaceBase, onPartialResult, streamWriter);
  return graph.compile();
}
