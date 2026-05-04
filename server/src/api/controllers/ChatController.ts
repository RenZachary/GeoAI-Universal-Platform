/**
 * Chat API Controller - Handles conversation with SSE streaming
 */

import type { Request, Response } from 'express';
import type { GeoAIStateType } from '../../llm-interaction';
import { compileGeoAIGraph } from '../../llm-interaction';
import { GeoAIStreamingHandler } from '../../llm-interaction/handlers/GeoAIStreamingHandler.js';
import type { LLMConfig } from '../../llm-interaction';
import type { ToolRegistry } from '../../plugin-orchestration';
import type Database from 'better-sqlite3';

export class ChatController {
  private db: Database.Database;
  private llmConfig: LLMConfig;
  private toolRegistry: ToolRegistry;
  private workspaceBase: string;

  constructor(db: Database.Database, llmConfig: LLMConfig, toolRegistry: ToolRegistry, workspaceBase: string) {
    this.db = db;
    this.llmConfig = llmConfig;
    this.toolRegistry = toolRegistry;
    this.workspaceBase = workspaceBase;
  }

  /**
   * POST /api/chat - Start conversation with SSE streaming
   */
  async handleChat(req: Request, res: Response): Promise<void> {
    try {
      const { message, conversationId, language = 'en-US' } = req.body;

      if (!message) {
        res.status(400).json({
          success: false,
          error: 'Message is required'
        });
        return;
      }

      // Generate or use existing conversation ID
      const convId = conversationId || `conv_${Date.now()}`;

      console.log(`[Chat API] Starting conversation: ${convId}`);

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');

      // Create streaming handler
      const streamingHandler = new GeoAIStreamingHandler(res);

      // Initialize LangGraph workflow with conversation memory support
      const graph = compileGeoAIGraph(
        this.llmConfig, 
        this.workspaceBase, 
        this.toolRegistry,
        this.db,  // Pass database for conversation memory
        // Incremental streaming callback - publish services as each goal completes
        (service) => {
          console.log(`[Chat API] Streaming partial result: ${service.id}`);
          res.write(`data: ${JSON.stringify({
            type: 'partial_result',
            service: {
              id: service.id,
              type: service.type,
              url: service.url,
              goalId: service.goalId,
              stepId: service.stepId,
              metadata: service.metadata
            },
            timestamp: Date.now()
          })}\n\n`);
        }
      );

      // Prepare initial state
      const initialState: Partial<GeoAIStateType> = {
        userInput: message,
        conversationId: convId,
        currentStep: 'goal_splitting'
      };

      // TODO: Integrate agents and tool registry here
      // For now, run the basic workflow
      console.log('[Chat API] Executing workflow...');

      // Execute workflow with streaming
      const stream = await graph.stream(initialState, {
        callbacks: [streamingHandler]
      });

      // Process stream events
      let finalServices: any[] = [];
      
      for await (const chunk of stream) {
        console.log('[Chat API] Workflow step:', Object.keys(chunk));
        
        // Capture visualization services from outputGenerator node
        if (chunk.outputGenerator && chunk.outputGenerator.visualizationServices) {
          finalServices = chunk.outputGenerator.visualizationServices;
        }
        
        // Stream is handled by callbacks
        // Additional processing can be added here
      }

      // Send completion event with summary and all services
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        conversationId: convId,
        services: finalServices,  // Include all accumulated services
        timestamp: Date.now()
      })}\n\n`);

      res.end();
      console.log(`[Chat API] Conversation completed: ${convId}`);

    } catch (error) {
      console.error('[Chat API] Error:', error);
      
      // Send error event if headers not yet sent
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.write(`data: ${JSON.stringify({
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now()
        })}\n\n`);
        res.end();
      } else {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now()
        })}\n\n`);
        res.end();
      }
    }
  }

  /**
   * GET /api/conversations/:id - Get conversation history
   */
  async getConversation(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // TODO: Query database for conversation messages
      const messages = this.db.prepare(`
        SELECT role, content, timestamp
        FROM conversation_messages
        WHERE conversation_id = ?
        ORDER BY timestamp ASC
      `).all(id);

      res.json({
        success: true,
        conversationId: id,
        messages
      });

    } catch (error) {
      console.error('[Chat API] Error getting conversation:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * DELETE /api/conversations/:id - Delete conversation
   */
  async deleteConversation(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Delete conversation messages
      this.db.prepare(`
        DELETE FROM conversation_messages
        WHERE conversation_id = ?
      `).run(id);

      res.json({
        success: true,
        message: 'Conversation deleted'
      });

    } catch (error) {
      console.error('[Chat API] Error deleting conversation:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/conversations - List all conversations
   */
  async listConversations(req: Request, res: Response): Promise<void> {
    try {
      // Get unique conversation IDs
      const conversations = this.db.prepare(`
        SELECT DISTINCT conversation_id as id, 
               MIN(timestamp) as created_at,
               MAX(timestamp) as updated_at,
               COUNT(*) as message_count
        FROM conversation_messages
        GROUP BY conversation_id
        ORDER BY updated_at DESC
      `).all();

      res.json({
        success: true,
        conversations
      });

    } catch (error) {
      console.error('[Chat API] Error listing conversations:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
