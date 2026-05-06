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
import { ToolRegistryInstance } from '../../plugin-orchestration';
import { ConversationBufferMemoryWithSQLite } from '../managers/ConversationMemoryManager';
import { ServicePublisher } from './ServicePublisher';
import { SummaryGenerator } from './SummaryGenerator';
import { SQLiteManagerInstance } from '../../storage/';
import { resolvePlaceholders } from './PlaceholderResolver';

// State interface for the GeoAI workflow
export interface GeoAIState {
  userInput: string;
  conversationId: string;
  messages?: BaseMessage[];
  goals?: AnalysisGoal[];
  executionPlans?: Map<string, ExecutionPlan>;
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
  requiredExecutors: string[]; // List of executor IDs needed for this goal
  priority: number;
  parameters?: Record<string, any>; // Optional extracted parameters (e.g., colorRamp, valueField)
}

export interface ExecutionPlan {
  goalId: string;
  steps: ExecutionStep[];
  requiredPlugins: string[];
}

export interface ExecutionStep {
  stepId: string;
  pluginId: string;
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
  type: 'mvt' | 'geojson' | 'image' | 'report';
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
  onPartialResult?: (service: VisualizationService) => void  // Callback for incremental streaming
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
  const servicePublisher = new ServicePublisher();
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
      console.log('[Plugin Executor] Executing plugins');
      
      const executionResults = new Map<string, any>();
      const allServices: VisualizationService[] = [];
      
      if (state.executionPlans) {
        for (const [goalId, plan] of state.executionPlans.entries()) {
          console.log(`[Plugin Executor] Executing plan for goal: ${goalId}`);
          console.log(`[Plugin Executor] Plan has ${plan.steps.length} steps`);
          
          // Execute each step in the plan
          for (const step of plan.steps) {
            try {
              console.log(`[Plugin Executor] Executing step: ${step.stepId} using plugin: ${step.pluginId}`);
              
              // Get tool from registry
              const tool = ToolRegistryInstance.getTool(step.pluginId);
              
              if (!tool) {
                console.error(`[Plugin Executor] Tool not found: ${step.pluginId}`);
                executionResults.set(step.stepId, {
                  id: step.stepId,
                  goalId,
                  status: 'failed',
                  error: `Plugin not found: ${step.pluginId}`
                });
                continue;
              }
              
              // Resolve placeholders in parameters using previous execution results
              console.log(`[Plugin Executor] Original parameters:`, step.parameters);
              const resolvedParameters = resolvePlaceholders(step.parameters, executionResults);
              console.log(`[Plugin Executor] Resolved parameters:`, resolvedParameters);
              
              // Invoke the tool with resolved parameters
              console.log(`[Plugin Executor] Invoking tool with parameters:`, resolvedParameters);
              const toolResult = await tool.invoke(resolvedParameters);
              
              console.log(`[Plugin Executor] Tool execution successful`);
              
              // Parse tool result (it's a JSON string)
              let parsedResult: any;
              try {
                parsedResult = typeof toolResult === 'string' ? JSON.parse(toolResult) : toolResult;
              } catch (error) {
                console.error(`[Plugin Executor] Failed to parse tool result:`, error);
                parsedResult = { success: false, error: 'Invalid tool result format' };
              }
              
              // Construct proper result object with NativeData
              const analysisResult: AnalysisResult = {
                id: step.stepId,
                goalId,
                status: parsedResult.success ? 'success' : 'failed',
                data: parsedResult.success ? {
                  id: parsedResult.resultId,
                  type: parsedResult.type || 'geojson',  // Use type from tool result
                  reference: parsedResult.reference || '',
                  metadata: parsedResult.metadata || {}
                } : undefined,
                error: parsedResult.error,
                metadata: {
                  pluginId: step.pluginId,
                  parameters: step.parameters,
                  executedAt: new Date().toISOString()
                }
              };
              
              executionResults.set(step.stepId, analysisResult);
              
            } catch (error) {
              console.error(`[Plugin Executor] Step ${step.stepId} failed:`, error);
              executionResults.set(step.stepId, {
                id: step.stepId,
                goalId,
                status: 'failed',
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          }
          
          // After completing ALL steps for this goal, publish services incrementally
          console.log(`[Plugin Executor] Goal ${goalId} complete, publishing services...`);
          
          // Filter results for this goal only
          const goalResults = new Map<string, any>();
          for (const [stepId, result] of executionResults.entries()) {
            if (result.goalId === goalId && result.status === 'success') {
              goalResults.set(stepId, result);
            }
          }
          
          // Publish services for this goal
          if (goalResults.size > 0) {
            const goalServices = servicePublisher.publishBatch(goalResults);
            console.log(`[Plugin Executor] Published ${goalServices.length} services for goal ${goalId}`);
            
            // Add to accumulated services
            allServices.push(...goalServices);
            
            // Stream partial results to frontend if callback provided
            if (onPartialResult) {
              for (const service of goalServices) {
                console.log(`[Plugin Executor] Streaming partial result: ${service.id}`);
                onPartialResult(service);
              }
            }
          }
        }
      }
      
      console.log(`[Plugin Executor] Execution complete. Results: ${executionResults.size}, Services: ${allServices.length}`);
      
      return {
        currentStep: 'execution',
        executionResults,
        visualizationServices: allServices,  // Accumulate services incrementally
      };
    })
    .addNode('outputGenerator', async (state: GeoAIStateType) => {
      console.log('[Output Generator] Publishing visualization services');
      
      if (!state.executionResults || state.executionResults.size === 0) {
        console.log('[Output Generator] No execution results to publish');
        return {
          currentStep: 'output',
          visualizationServices: []
        };
      }
      
      // Use ServicePublisher to generate services
      const visualizationServices = servicePublisher.publishBatch(state.executionResults);
      
      console.log(`[Output Generator] Published ${visualizationServices.length} services`);
      
      return {
        currentStep: 'output',
        visualizationServices,
      };
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
  workflow.addEdge('pluginExecutor', 'outputGenerator');
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
