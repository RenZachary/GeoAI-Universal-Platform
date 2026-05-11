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
  private currentChainName: string | null = null; // Track current workflow node
  private shouldStreamTokens: boolean = false; // Only stream tokens during summary generation

  constructor(streamWriter: Writable) {
    super();
    this.streamWriter = streamWriter;
  }

  /**
   * Called when LLM generates a new token
   * Only streams tokens during summary generation (not goal splitting or task planning)
   */
  async handleLLMNewToken(token: string): Promise<void> {
    // Debug logging
    if (token.length > 0) {
      console.log(`[GeoAIStreamingHandler] Token received, shouldStreamTokens: ${this.shouldStreamTokens}, currentChain: ${this.currentChainName}, token preview: "${token.substring(0, 30)}..."`);
    }
    
    // Only stream tokens if we're in the summary generation phase
    if (!this.shouldStreamTokens) {
      return; // Skip tokens from GoalSplitter, TaskPlanner, etc.
    }
    
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
    // Try multiple ways to get the chain/node name
    let chainName: string | undefined;
    
    // Method 1: Direct name property
    if (chain.name && typeof chain.name === 'string' && !chain.name.startsWith('Runnable')) {
      chainName = chain.name;
    }
    // Method 2: From constructor
    else if (chain.constructor?.name && chain.constructor.name !== 'Object') {
      chainName = chain.constructor.name;
    }
    // Method 3: From run metadata (LangGraph specific)
    else if (chain.run_metadata?.langgraph_node) {
      chainName = chain.run_metadata.langgraph_node;
    }
    // Method 4: From config
    else if (chain.config?.run_name) {
      chainName = chain.config.run_name;
    }
    
    // Skip if we can't get a meaningful name or it's an internal Runnable
    if (!chainName || chainName.startsWith('Runnable') || chainName === 'Object') {
      return;
    }
    
    // Track current chain and determine if we should stream tokens
    this.currentChainName = chainName;
    this.shouldStreamTokens = (chainName === 'summaryGenerator');
    
    console.log(`[GeoAIStreamingHandler] Chain started: ${chainName}, shouldStreamTokens: ${this.shouldStreamTokens}`);
    
    this.writeSSE({
      type: 'step_start',
      step: chainName,
      timestamp: Date.now(),
    });
  }

  /**
   * Called when a chain/workflow node ends
   * Captures step_complete events
   */
  async handleChainEnd(outputs: any, runId?: string): Promise<void> {
    // Reset token streaming flag when chain ends
    this.shouldStreamTokens = false;
    this.currentChainName = null;
    
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
