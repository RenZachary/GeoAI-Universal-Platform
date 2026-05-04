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
   * DISABLED: We manually stream only the final summary to avoid leaking internal LLM calls
   */
  async handleLLMNewToken(token: string): Promise<void> {
    // Skip intermediate LLM tokens - only stream final summary from ChatController
    // this.writeSSE({
    //   type: 'token',
    //   content: token,
    //   timestamp: Date.now(),
    // });
  }

  /**
   * Called when a chain starts
   * DISABLED: We use ChatController to send workflow-level step events instead
   */
  async handleChainStart(chain: any, inputs: any): Promise<void> {
    // Skip sending step_start events - handled by ChatController for cleaner UX
    // this.writeSSE({
    //   type: 'step_start',
    //   step: stepName,
    //   timestamp: Date.now(),
    // });
  }

  /**
   * Called when a chain ends
   * DISABLED: We use ChatController to send workflow-level step events instead
   */
  async handleChainEnd(outputs: any): Promise<void> {
    // Skip sending step_complete events - handled by ChatController for cleaner UX
    // this.writeSSE({
    //   type: 'step_complete',
    //   timestamp: Date.now(),
    // });
  }

  /**
   * Called when a tool starts
   */
  async handleToolStart(tool: any, input: string): Promise<void> {
    this.writeSSE({
      type: 'tool_start',
      tool: tool.name,
      input: this.truncate(input, 200),
      timestamp: Date.now(),
    });
  }

  /**
   * Called when a tool ends
   */
  async handleToolEnd(output: string): Promise<void> {
    this.writeSSE({
      type: 'tool_complete',
      output: this.truncate(output, 500),
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
