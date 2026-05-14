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
import { getIntentClassifier } from './nodes/IntentClassifierNode';
import { getKnowledgeRetriever } from './nodes/KnowledgeRetrieverNode';
import { ContextExtractorNode } from './nodes/ContextExtractorNode';
import { SQLiteManagerInstance } from '../../storage/';
import type { ParallelGroup } from '../analyzers/ParallelTaskAnalyzer';
import type {
  AnalysisGoal,
  ExecutionPlan as CoreExecutionPlan,
  ExecutionStep as CoreExecutionStep,
  AnalysisResult as CoreAnalysisResult
} from '../../core';
import type { IntentClassification } from '../../knowledge-base/types';
import type { SpatialContext } from '../types/SpatialContext';
import { publishStepResult } from './GeoAIGraphUtils';

// State interface for the GeoAI workflow
export interface GeoAIState {
  userInput: string;
  conversationId: string;
  messages?: BaseMessage[];
  
  // NEW: Spatial context from frontend
  context?: SpatialContext;
  contextMetadata?: {
    hasViewport: boolean;
    hasSelection: boolean;
    hasDrawing: boolean;
  };
  
  // NEW: Intent classification
  intent?: IntentClassification;
  
  // NEW: Knowledge context from RAG
  knowledgeContext?: {
    query: string;
    retrievedChunks: Array<{
      content: string;
      documentId: string;
      score: number;
      metadata: any;
    }>;
    contextString: string;
  };
  
  goals?: AnalysisGoal[];
  executionPlans?: Map<string, ExecutionPlan>;
  parallelGroups?: ParallelGroup[]; // NEW v2.0: Parallel task groups
  executionMode?: 'sequential' | 'parallel' | 'hybrid'; // NEW v2.0: Execution mode recommendation
  executionResults?: Map<string, AnalysisResult>;
  visualizationServices?: VisualizationService[];
  summary?: string;
  currentStep: 'intent_classification' | 'knowledge_retrieval' | 'goal_splitting' | 'task_planning' | 'execution' | 'output' | 'summary';
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
  
  // NEW: Spatial context from frontend
  context: Annotation<SpatialContext | undefined>,
  contextMetadata: Annotation<{
    hasViewport: boolean;
    hasSelection: boolean;
    hasDrawing: boolean;
  } | undefined>,
  
  // NEW: Intent classification
  intent: Annotation<IntentClassification | undefined>,
  
  // NEW: Knowledge context from RAG
  knowledgeContext: Annotation<{
    query: string;
    retrievedChunks: Array<{
      content: string;
      documentId: string;
      score: number;
      metadata: any;
    }>;
    contextString: string;
  } | undefined>,
  
  goals: Annotation<AnalysisGoal[]>,
  executionPlans: Annotation<Map<string, ExecutionPlan>>,
  parallelGroups: Annotation<ParallelGroup[]>, // NEW v2.0
  executionMode: Annotation<'sequential' | 'parallel' | 'hybrid'>, // NEW v2.0
  executionResults: Annotation<Map<string, AnalysisResult>>,
  visualizationServices: Annotation<VisualizationService[]>,
  summary: Annotation<string>,
  currentStep: Annotation<'intent_classification' | 'knowledge_retrieval' | 'goal_splitting' | 'task_planning' | 'execution' | 'output' | 'summary'>,
  errors: Annotation<Array<{ goalId: string; error: string }>>,
});

export type GeoAIStateType = typeof GeoAIStateAnnotation.State;

/**
 * Create the GeoAI workflow graph with conversation memory support
 */
export function createGeoAIGraph(
  llmConfig: LLMConfig, 
  workspaceBase: string, 
  onPartialResult?: (service: VisualizationService) => void,
  onToken?: (token: string) => void // Callback for real-time token streaming
) {
  // Initialize managers and agents
  const promptManager = new PromptManager(workspaceBase);
  const intentClassifier = getIntentClassifier(llmConfig, workspaceBase);
  const knowledgeRetriever = getKnowledgeRetriever();
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
  
  // Initialize context extractor
  const contextExtractor = new ContextExtractorNode(workspaceBase);
  
  const workflow = new StateGraph(GeoAIStateAnnotation)
    // NEW: Context Extractor Node - Process spatial context first
    .addNode('contextExtractor', async (state: GeoAIStateType) => {
      console.log('[Context Extractor Node] Processing spatial context');
      return await contextExtractor.execute(state);
    })
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
          currentStep: 'intent_classification'
        };
      } catch (error) {
        console.error('[Memory Loader] Error loading memory:', error);
        // Continue without memory on error
        return {
          messages: [new HumanMessage({ content: state.userInput })],
          currentStep: 'intent_classification'
        };
      }
    })
    // NEW: Intent Classification Node
    .addNode('intentClassifier', async (state: GeoAIStateType) => {
      console.log('[Intent Classifier Node] Classifying user intent');
      if (onToken) {
        onToken('__STATUS__:🧠 Understanding your request...');
      }
      
      const result = await intentClassifier.classify(state);
      
      // Send intent classification result to frontend
      if (onToken && result.intent) {
        const intentInfo = JSON.stringify({
          type: 'intent_classified',
          intent: result.intent.type,
          confidence: result.intent.confidence,
          reasoning: result.intent.reasoning
        });
        onToken(`__EVENT__:${intentInfo}`);
      }
      
      return result;
    })
    // NEW: Knowledge Retriever Node (conditional)
    .addNode('knowledgeRetriever', async (state: GeoAIStateType) => {
      console.log('[Knowledge Retriever Node] Retrieving knowledge context');
      
      // Send structured KB retrieval start event
      if (onToken && (state.intent?.type === 'KNOWLEDGE_QUERY' || state.intent?.type === 'HYBRID')) {
        const startEvent = JSON.stringify({
          type: 'kb_retrieval_start',
          data: { query: state.userInput }
        });
        onToken(`__EVENT__:${startEvent}`);
      }
      
      const startTime = Date.now();
      const result = await knowledgeRetriever.retrieve(state);
      const searchTime = Date.now() - startTime;
      
      // Send structured KB retrieval complete event
      if (onToken && result.knowledgeContext) {
        const completeEvent = JSON.stringify({
          type: 'kb_retrieval_complete',
          data: { 
            resultCount: result.knowledgeContext.retrievedChunks.length,
            searchTime
          }
        });
        onToken(`__EVENT__:${completeEvent}`);
        
        // Send source citation events for each retrieved chunk
        result.knowledgeContext.retrievedChunks.forEach((chunk, index) => {
          const citationEvent = JSON.stringify({
            type: 'source_citation',
            data: {
              documentId: chunk.documentId,
              documentName: chunk.metadata?.documentName || 'Unknown',
              pageNumber: chunk.metadata?.pageNumber,
              score: chunk.score,
              preview: chunk.content.substring(0, 200),
              index: index + 1
            }
          });
          onToken(`__EVENT__:${citationEvent}`);
        });
      }
      
      return result;
    })
    .addNode('goalSplitter', async (state: GeoAIStateType) => {
      // Send status update via onToken callback
      if (onToken) {
        onToken('__STATUS__:🎯 Analyzing your request...');
      }
      
      console.log('[Goal Splitter Node] Processing user input:', state.userInput);
      return await goalSplitter.execute(state);
    })
    .addNode('taskPlanner', async (state: GeoAIStateType) => {
      // Send status update via onToken callback
      if (onToken) {
        onToken('__STATUS__:📋 Planning analysis tasks...');
      }
      
      console.log('[Task Planner Node] Planning execution');
      return await taskPlanner.execute(state);
    })
    .addNode('pluginExecutor', async (state: GeoAIStateType) => {
      // Send status update via onToken callback
      if (onToken) {
        onToken('__STATUS__:⚙️ Executing analysis...');
      }
      
      // Use EnhancedPluginExecutor for parallel execution
      const result = await EnhancedExecutorInstance.executeWithParallelSupport(state);
      
      // Get execution metrics
      const metrics = EnhancedExecutorInstance.getMetrics();
      if (metrics) {
        console.log(EnhancedExecutorInstance.generateSummary());
      }
      
      // Publish visualization services using unified publisher
      const allServices: VisualizationService[] = await publishStepResult(result, state, workspaceBase, db || undefined);
            
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
      // Send status update via onToken callback
      if (onToken) {
        onToken('__STATUS__:📊 Evaluating report needs...');
      }
      
      return await reportDecisionNode(state, { 
        llmConfig, 
        workspaceBase,
        onPartialResult // Pass the streaming callback for partial results
        // Note: onToken is intentionally NOT passed to avoid sending report tokens to frontend
        // Report content should be accessed via the service link, not streamed in chat
      });
    })
    .addNode('summaryGenerator', async (state: GeoAIStateType) => {
      // Send status update via onToken callback
      if (onToken) {
        onToken('__STATUS__:📝 Creating summary...');
      }
      
      console.log('[Summary Generator] Creating analysis summary');
      
      // Generate summary using template-based approach
      const summary = await summaryGenerator.generate(state, {
        includeGoals: true,
        includeResults: true,
        includeServices: true,
        includeErrors: true,
        includeNextSteps: true,
        onToken // Pass the token callback for summary generation
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
  workflow.addEdge(START, 'contextExtractor');
  workflow.addEdge('contextExtractor', 'memoryLoader');
  workflow.addEdge('memoryLoader', 'intentClassifier');
  
  // NEW: Conditional routing based on intent type
  workflow.addConditionalEdges('intentClassifier', (state: GeoAIStateType) => {
    console.log('[GeoAIGraph] Routing based on intent:', state.intent?.type);
    
    switch (state.intent?.type) {
      case 'GENERAL_CHAT':
        // Direct to summary for chat responses
        return 'summaryGenerator';
      
      case 'KNOWLEDGE_QUERY':
        // Route to knowledge retriever only
        return 'knowledgeRetriever';
      
      case 'GIS_ANALYSIS':
        // Standard GIS workflow - skip knowledge retrieval
        return 'goalSplitter';
      
      case 'HYBRID':
        // Hybrid query - retrieve knowledge first, then proceed to GIS
        return 'knowledgeRetriever';
      
      default:
        // Fallback to standard workflow
        console.warn('[GeoAIGraph] Unknown intent type, defaulting to goalSplitter');
        return 'goalSplitter';
    }
  });
  
  // After knowledge retrieval, route based on intent
  workflow.addConditionalEdges('knowledgeRetriever', (state: GeoAIStateType) => {
    if (state.intent?.type === 'KNOWLEDGE_QUERY') {
      // Pure knowledge query - go directly to summary
      return 'summaryGenerator';
    } else {
      // HYBRID query - continue with GIS workflow
      return 'goalSplitter';
    }
  });
  
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
  onToken?: (token: string) => void // Callback for real-time token streaming
) {
  const graph = createGeoAIGraph(llmConfig, workspaceBase, onPartialResult, onToken);
  return graph.compile();
}
