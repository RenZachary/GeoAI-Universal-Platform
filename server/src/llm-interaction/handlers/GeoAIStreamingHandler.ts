/**
 * GeoAI Streaming Handler - LangChain callback handler for SSE streaming
 */

import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { Writable } from 'stream';

export class GeoAIStreamingHandler extends BaseCallbackHandler {
  name = 'geoai_streaming_handler';
  private streamWriter: Writable;

  constructor(streamWriter: Writable) {
    super();
    this.streamWriter = streamWriter;
  }

  /**
   * Called when LLM generates a new token
   */
  async handleLLMNewToken(token: string): Promise<void> {
    this.writeSSE({
      type: 'token',
      content: token,
      timestamp: Date.now(),
    });
  }

  /**
   * Called when a chain starts
   */
  async handleChainStart(chain: any, inputs: any): Promise<void> {
    this.writeSSE({
      type: 'step_start',
      step: chain.name || chain.constructor?.name || 'unknown',
      timestamp: Date.now(),
    });
  }

  /**
   * Called when a chain ends
   */
  async handleChainEnd(outputs: any): Promise<void> {
    this.writeSSE({
      type: 'step_complete',
      timestamp: Date.now(),
    });
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
    this.writeSSE({
      type: 'error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: Date.now(),
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
