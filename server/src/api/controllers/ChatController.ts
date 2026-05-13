/**
 * Chat API Controller - Handles conversation with SSE streaming
 */

import type { Request, Response } from 'express';
import type { GeoAIStateType } from '../../llm-interaction';
import { compileGeoAIGraph } from '../../llm-interaction';
import { GeoAIStreamingHandler } from '../../llm-interaction';
import type { LLMConfig } from '../../llm-interaction';
import type { ConversationService } from '../../services';
import type { SpatialContext } from '../../llm-interaction/types/SpatialContext';
import { VirtualDataSourceManagerInstance } from '../../data-access/managers/VirtualDataSourceManager';

export class ChatController {
  private llmConfig: LLMConfig;
  private workspaceBase: string;
  private conversationService: ConversationService;

  constructor(llmConfig: LLMConfig, workspaceBase: string, conversationService: ConversationService) {
    this.llmConfig = llmConfig;
    this.workspaceBase = workspaceBase;
    this.conversationService = conversationService;
  }

  /**
   * POST /api/chat - Start conversation with SSE streaming
   */
  async handleChat(req: Request, res: Response): Promise<void> {
    try {
      const { message, conversationId, language = 'en-US', context } = req.body;

      if (!message) {
        res.status(400).json({
          success: false,
          error: 'Message is required'
        });
        return;
      }

      // Log spatial context if provided
      if (context) {
        console.log('[Chat API] Received spatial context:', {
          hasViewport: !!context.viewportBbox,
          hasSelection: !!context.selectedFeature,
          drawnGeometriesCount: context.drawnGeometries?.length || 0
        });
      }

      // Generate or use existing conversation ID
      const convId = conversationId || `conv_${Date.now()}`;

      console.log(`[Chat API] Starting conversation: ${convId}`);

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');

      // Send initial message_start event (what frontend expects)
      res.write(`data: ${JSON.stringify({
        type: 'message_start',
        data: {
          conversationId: convId,
          content: message
        },
        timestamp: Date.now()
      })}\n\n`);

      // Create streaming handler - unified event source for all SSE events
      const streamingHandler = new GeoAIStreamingHandler(res);

      // Initialize LangGraph workflow with conversation memory support
      const graph = compileGeoAIGraph(
        this.llmConfig, 
        this.workspaceBase,
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
        },
        // Token streaming callback - send LLM tokens directly to frontend
        (token: string) => {
          res.write(`data: ${JSON.stringify({
            type: 'token',
            data: { token },
            timestamp: Date.now()
          })}\n\n`);
        }
      );

      // Prepare initial state
      const initialState: Partial<GeoAIStateType> = {
        userInput: message,
        conversationId: convId,
        context: context as SpatialContext | undefined,
        currentStep: 'intent_classification'
      };

      // Execute workflow with streaming callbacks
      console.log('[Chat API] Executing workflow...');

      const stream = await graph.stream(initialState, {
        callbacks: [streamingHandler]
      });

      // Process stream to capture final state
      let finalSummary: string = '';
      let finalServices: any[] = [];
      
      for await (const chunk of stream) {
        // Extract summary from summaryGenerator node
        if (chunk.summaryGenerator?.summary) {
          finalSummary = chunk.summaryGenerator.summary;
        }
        
        // Extract services from outputGenerator node
        if (chunk.outputGenerator?.visualizationServices) {
          finalServices = chunk.outputGenerator.visualizationServices;
        }
      }

      // Send completion event with summary and all services
      res.write(`data: ${JSON.stringify({
        type: 'message_complete',
        data: {
          conversationId: convId,
          summary: finalSummary,
          services: finalServices
        },
        timestamp: Date.now()
      })}\n\n`);

      // Save visualization services to the last assistant message
      if (finalServices && finalServices.length > 0) {
        this.conversationService.saveServicesToLastMessage(convId, finalServices);
      }

      // Note: Virtual data sources are cleaned up at the START of each new message by ContextExtractorNode
      // No need to clean here - they will be cleaned when the next message arrives or conversation is deleted

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
   * GET /api/chat/conversations/:id - Get conversation history
   */
  async getConversation(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const conversationId = Array.isArray(id) ? id[0] : id;

      const messages = this.conversationService.getConversation(conversationId);

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
   * DELETE /api/chat/conversations/:id - Delete conversation
   */
  async deleteConversation(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const conversationId = Array.isArray(id) ? id[0] : id;

      // Clean up virtual data sources for this conversation
      console.log(`[Chat API] Cleaning up virtual sources for deleted conversation: ${conversationId}`);
      VirtualDataSourceManagerInstance.cleanup(conversationId);

      this.conversationService.deleteConversation(conversationId);

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
   * GET /api/chat/conversations - List all conversations
   */
  async listConversations(req: Request, res: Response): Promise<void> {
    try {
      const conversations = this.conversationService.listConversations();

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

  /**
   * PUT /api/chat/conversations/:id - Rename conversation
   */
  async renameConversation(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const conversationId = Array.isArray(id) ? id[0] : id;
      const { title } = req.body;

      if (!title) {
        res.status(400).json({
          success: false,
          error: 'Title is required'
        });
        return;
      }

      this.conversationService.renameConversation(conversationId, title);

      res.json({
        success: true,
        message: 'Conversation renamed'
      });

    } catch (error) {
      console.error('[Chat API] Error renaming conversation:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
