/**
 * Virtual DataSource Manager - Manages temporary data sources created during conversation
 * 
 * Purpose:
 * - Store intermediate results from plugin execution (e.g., buffer analysis output)
 * - Make them available for subsequent steps in the same conversation
 * - Automatically clean up when conversation ends
 * 
 * Design Principles:
 * - In-memory only (no database persistence)
 * - Conversation-scoped (isolated per conversation)
 * - Auto-cleanup on conversation end
 * - Transparent to plugins (plugins query via DataSourceRepository)
 */

import fs from 'fs';
import type { NativeData } from '../../core';

export interface VirtualDataSource {
  id: string;                    // NativeData ID (same as result ID)
  name: string;                  // Descriptive name (e.g., "goal_1_buffer_result")
  type: 'geojson' | 'mvt' | 'postgis' | string;
  reference: string;             // File path or connection string
  nativeData: NativeData;        // Full NativeData object
  conversationId: string;        // Associated conversation
  createdAt: Date;
}

export class VirtualDataSourceManager {
  private static instance: VirtualDataSourceManager;
  private virtualSources: Map<string, VirtualDataSource> = new Map();

  private constructor() {}

  static getInstance(): VirtualDataSourceManager {
    if (!VirtualDataSourceManager.instance) {
      VirtualDataSourceManager.instance = new VirtualDataSourceManager();
    }
    return VirtualDataSourceManager.instance;
  }

  /**
   * Register a virtual data source from plugin execution result
   */
  register(result: {
    id: string;
    conversationId: string;
    stepId: string;
    data: NativeData;
  }): void {
    const virtualDs: VirtualDataSource = {
      id: result.id,
      name: `temp_${result.stepId}`,
      type: result.data.type,
      reference: result.data.reference,
      nativeData: result.data,
      conversationId: result.conversationId,
      createdAt: new Date()
    };

    this.virtualSources.set(result.id, virtualDs);
    console.log(`[VirtualDataSourceManager] Registered virtual source: ${result.id} (${result.data.type})`);
  }

  /**
   * Get virtual data source by ID
   * Returns undefined if not found or belongs to different conversation
   */
  getById(id: string, conversationId?: string): VirtualDataSource | undefined {
    const ds = this.virtualSources.get(id);
    
    if (!ds) {
      return undefined;
    }

    // If conversationId is provided, verify it matches
    if (conversationId && ds.conversationId !== conversationId) {
      console.warn(`[VirtualDataSourceManager] ID ${id} belongs to different conversation`);
      return undefined;
    }

    return ds;
  }

  /**
   * Check if a virtual data source exists
   */
  exists(id: string, conversationId?: string): boolean {
    return this.getById(id, conversationId) !== undefined;
  }

  /**
   * Clean up all virtual data sources for a specific conversation
   * Also deletes physical files (GeoJSON, etc.)
   */
  cleanup(conversationId: string): void {
    console.log(`[VirtualDataSourceManager] Cleaning up virtual sources for conversation: ${conversationId}`);
    
    let cleanedCount = 0;
    const toDelete: string[] = [];

    // Find all virtual sources for this conversation
    for (const [id, ds] of this.virtualSources.entries()) {
      if (ds.conversationId === conversationId) {
        toDelete.push(id);
        
        // Delete physical file if it exists
        try {
          if (ds.reference && !ds.reference.startsWith('/api/')) {
            // It's a file path, not a URL
            const filePath = ds.reference;
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              console.log(`[VirtualDataSourceManager] Deleted temp file: ${filePath}`);
            }
          }
        } catch (error) {
          console.warn(`[VirtualDataSourceManager] Failed to delete temp file ${ds.reference}:`, error);
        }
        
        cleanedCount++;
      }
    }

    // Remove from map
    toDelete.forEach(id => this.virtualSources.delete(id));
    
    console.log(`[VirtualDataSourceManager] Cleaned up ${cleanedCount} virtual sources`);
  }

  /**
   * Get statistics (for debugging/monitoring)
   */
  getStats(): {
    total: number;
    byConversation: Record<string, number>;
  } {
    const byConversation: Record<string, number> = {};
    
    for (const ds of this.virtualSources.values()) {
      byConversation[ds.conversationId] = (byConversation[ds.conversationId] || 0) + 1;
    }

    return {
      total: this.virtualSources.size,
      byConversation
    };
  }

  /**
   * Clear all virtual sources (use with caution, e.g., server shutdown)
   */
  clearAll(): void {
    console.log(`[VirtualDataSourceManager] Clearing all virtual sources (${this.virtualSources.size} total)`);
    this.virtualSources.clear();
  }
}

// Export singleton instance
export const VirtualDataSourceManagerInstance = VirtualDataSourceManager.getInstance();
