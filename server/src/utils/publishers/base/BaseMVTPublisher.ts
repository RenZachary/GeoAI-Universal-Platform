/**
 * Base MVT Publisher - Abstract base class for all MVT publishers
 * 
 * Defines the common interface for Mapbox Vector Tile generation
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
 * Abstract base class for MVT publishers
 * All MVT publisher implementations should extend this class
 */
export abstract class BaseMVTPublisher {
  protected workspaceBase: string;
  protected mvtOutputDir: string;

  constructor(workspaceBase: string, outputSubdir: string) {
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
   * Publish/generate MVT tiles from a data source
   * @returns tilesetId - Unique identifier for the tileset
   */
  abstract publish(...args: any[]): Promise<MVTPublishResult>;

  /**
   * Get a single tile on-demand
   * @param tilesetId - Tileset identifier
   * @param z - Zoom level
   * @param x - X coordinate
   * @param y - Y coordinate
   * @returns PBF buffer or null if tile doesn't exist
   */
  abstract getTile(tilesetId: string, z: number, x: number, y: number): Promise<Buffer | null>;

  /**
   * List all published tilesets
   */
  abstract listTilesets(): Array<{ tilesetId: string; metadata: any }>;

  /**
   * Delete a tileset and clean up resources
   * @param tilesetId - Tileset identifier to delete
   * @returns true if deleted successfully
   */
  abstract deleteTileset(tilesetId: string): boolean;

  /**
   * Get tileset metadata
   * @param tilesetId - Tileset identifier
   * @returns Metadata object or null if not found
   */
  abstract getMetadata(tilesetId: string): any | null;
}
