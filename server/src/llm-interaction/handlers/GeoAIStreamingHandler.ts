/**
 * GeoAI Streaming Handler - LangChain callback handler for SSE streaming
 */

import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { Writable } from 'stream';

export class GeoAIStreamingHandler extends BaseCallbackHandler {
  name = 'geoai_streaming_handler';
  private streamWriter: Writable;
  private lastErrorTimestamp: number = 0;
  private errorDeduplicationWindow: number = 100; // ms - prevent duplicate errors within 100ms

  constructor(streamWriter: Writable) {
    super();
    this.streamWriter = streamWriter;
  }

  /**
   * NOTE: handleLLMNewToken is intentionally NOT implemented here.
   * LLM token streaming is handled at the business logic level (SummaryGenerator, ReportGenerator)
   * to provide fine-grained control over which tokens are sent to the frontend.
   */

  /**
   * Called when a chain/workflow node starts
   * NOTE: Disabled - step_start events are now sent via __STATUS__ tokens in GeoAIGraph nodes
   * This avoids the issue of LangGraph not providing reliable node names in callbacks
   */
  async handleChainStart(chain: any, inputs: any): Promise<void> {
    // Intentionally empty - step tracking is handled at the application level
    // See GeoAIGraph.ts where each node sends __STATUS__ tokens via onToken callback
  }

  /**
   * Called when a chain/workflow node ends
   * NOTE: Disabled - step tracking is now handled via __STATUS__ tokens in GeoAIGraph nodes
   */
  async handleChainEnd(outputs: any, runId?: string): Promise<void> {
    // Intentionally empty - step completion is not tracked at callback level
  }

  /**
   * Called when a tool starts execution
   * Automatically triggered by LangChain when tool.invoke() is called
   */
  async handleToolStart(tool: any, input: string): Promise<void> {
    this.writeSSE({
      type: 'tool_start',
      tool: tool.name, // operatorId from ToolAdapter
      input: this.truncate(input, 200),
      timestamp: Date.now(),
    });
  }

  /**
   * Called when a tool completes execution
   * Automatically triggered by LangChain after tool returns result
   */
  async handleToolEnd(output: string, runId?: string): Promise<void> {
    this.writeSSE({
      type: 'tool_complete',
      output: this.truncate(output, 2000),
      timestamp: Date.now(),
    });
  }

  /**
   * Called on error
   */
  async handleChainError(error: Error): Promise<void> {
    const now = Date.now();
    
    // Deduplicate errors - only send if enough time has passed
    if (now - this.lastErrorTimestamp < this.errorDeduplicationWindow) {
      return; // Skip duplicate error
    }
    
    this.lastErrorTimestamp = now;
    
    this.writeSSE({
      type: 'error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: now,
    });
  }

  /**
   * Write SSE formatted data
   */
  private writeSSE(data: any): void {
    const eventData = JSON.stringify(data);
    this.streamWriter.write(`data: ${eventData}\n\n`);
  }

  /**
   * Truncate long strings
   */
  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
  }
}
