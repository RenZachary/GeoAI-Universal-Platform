/**
 * Base MVT Publisher - Concrete base class for all MVT publishers
 * 
 * Provides shared infrastructure:
 * - Directory management
 * - Metadata persistence
 * - Tile ID generation
 * - Common utilities
 * 
 * Subclasses implement specific tile generation strategies
 */

import fs from 'fs';
import path from 'path';

export interface MVTPublishResult {
  success: boolean;
  tilesetId: string;
  serviceUrl: string;
  metadata: Record<string, any>;
  error?: string;
}

/**
 * Base class for MVT publishers with shared infrastructure
 * All MVT publisher implementations should extend this class
 */
export class BaseMVTPublisher {
  protected workspaceBase: string;
  protected mvtOutputDir: string;

  constructor(workspaceBase: string, outputSubdir: string = 'mvt') {
    this.workspaceBase = workspaceBase;
    this.mvtOutputDir = this.ensureOutputDir(outputSubdir);
  }

  /**
   * Ensure output directory exists
   */
  protected ensureOutputDir(subdir: string): string {
    const dir = path.join(this.workspaceBase, 'results', subdir);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    return dir;
  }

  /**
   * Generate a unique tileset ID
   * @param prefix - Prefix for the tileset ID (default: 'mvt')
   * @returns Unique tileset identifier
   */
  protected generateTilesetId(prefix: string = 'mvt'): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Save tileset metadata to disk
   * @param tilesetId - Tileset identifier
   * @param metadata - Metadata object to save
   */
  protected saveMetadata(tilesetId: string, metadata: any): void {
    const tilesetDir = path.join(this.mvtOutputDir, tilesetId);
    
    if (!fs.existsSync(tilesetDir)) {
      fs.mkdirSync(tilesetDir, { recursive: true });
    }

    const metadataPath = path.join(tilesetDir, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Load tileset metadata from disk
   * @param tilesetId - Tileset identifier
   * @returns Metadata object or null if not found
   */
  protected loadMetadata(tilesetId: string): any | null {
    const metadataPath = path.join(this.mvtOutputDir, tilesetId, 'metadata.json');
    
    if (fs.existsSync(metadataPath)) {
      try {
        return JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      } catch (error) {
        console.error(`[BaseMVTPublisher] Failed to load metadata for ${tilesetId}:`, error);
        return null;
      }
    }
    
    return null;
  }

  /**
   * Delete tileset directory from disk
   * @param tilesetId - Tileset identifier
   * @returns true if deleted successfully
   */
  protected deleteTilesetDirectory(tilesetId: string): boolean {
    const tilesetDir = path.join(this.mvtOutputDir, tilesetId);
    
    if (fs.existsSync(tilesetDir)) {
      fs.rmSync(tilesetDir, { recursive: true, force: true });
      return true;
    }
    
    return false;
  }

  /**
   * List all tilesets from disk
   * @returns Array of tileset info with metadata
   */
  protected listTilesetsFromDisk(): Array<{ tilesetId: string; metadata: any }> {
    if (!fs.existsSync(this.mvtOutputDir)) {
      return [];
    }

    const tilesets: Array<{ tilesetId: string; metadata: any }> = [];
    const entries = fs.readdirSync(this.mvtOutputDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const metadata = this.loadMetadata(entry.name);
        if (metadata) {
          tilesets.push({ tilesetId: entry.name, metadata });
        }
      }
    }

    return tilesets;
  }

  /**
   * Get tileset directory path
   * @param tilesetId - Tileset identifier
   * @returns Full path to tileset directory
   */
  protected getTilesetDir(tilesetId: string): string {
    return path.join(this.mvtOutputDir, tilesetId);
  }

  // ============================================================================
  // Methods to be overridden by subclasses
  // These throw errors if not implemented, enforcing the contract
  // ============================================================================

  /**
   * Publish/generate MVT tiles from a data source
   * Must be implemented by subclasses
   * @returns Publication result with tilesetId and service URL
   */
  async publish(...args: any[]): Promise<MVTPublishResult> {
    throw new Error('Method "publish" must be implemented by subclass');
  }

  /**
   * Get a single tile on-demand
   * Must be implemented by subclasses
   * @param tilesetId - Tileset identifier
   * @param z - Zoom level
   * @param x - X coordinate
   * @param y - Y coordinate
   * @returns PBF buffer or null if tile doesn't exist
   */
  async getTile(tilesetId: string, z: number, x: number, y: number): Promise<Buffer | null> {
    throw new Error('Method "getTile" must be implemented by subclass');
  }

  // ============================================================================
  // Concrete Methods - Can be overridden by subclasses
  // ============================================================================

  /**
   * List all published tilesets
   * Default implementation reads from disk
   * Subclasses can override to use memory cache
   */
  listTilesets(): Array<{ tilesetId: string; metadata: any }> {
    return this.listTilesetsFromDisk();
  }

  /**
   * Delete a tileset and clean up resources
   * Default implementation removes directory
   * Subclasses can override to add additional cleanup
   */
  deleteTileset(tilesetId: string): boolean {
    return this.deleteTilesetDirectory(tilesetId);
  }

  /**
   * Get tileset metadata
   * Default implementation reads from disk
   * Subclasses can override to use memory cache
   */
  getMetadata(tilesetId: string): any | null {
    return this.loadMetadata(tilesetId);
  }
}
