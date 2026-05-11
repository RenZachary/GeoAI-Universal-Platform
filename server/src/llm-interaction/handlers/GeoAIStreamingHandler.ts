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
   * Called when LLM generates a new token
   * Streams real-time tokens for summary generation
   */
  async handleLLMNewToken(token: string): Promise<void> {
    this.writeSSE({
      type: 'token',
      data: { token },
      timestamp: Date.now(),
    });
  }

  /**
   * Called when a chain/workflow node starts
   * Captures step_start events for all workflow nodes
   */
  async handleChainStart(chain: any, inputs: any): Promise<void> {
    // Only send for meaningful workflow nodes (skip internal Runnable chains)
    const chainName = chain.name || chain.constructor?.name;
    if (!chainName || chainName.startsWith('Runnable')) {
      return;
    }
    
    this.writeSSE({
      type: 'step_start',
      step: chainName, // e.g., 'memoryLoader', 'goalSplitter', 'taskPlanner'
      timestamp: Date.now(),
    });
  }

  /**
   * Called when a chain/workflow node ends
   * Captures step_complete events
   */
  async handleChainEnd(outputs: any, runId?: string): Promise<void> {
    this.writeSSE({
      type: 'step_complete',
      timestamp: Date.now(),
    });
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
