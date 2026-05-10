import type { DataSourceType, NativeData } from "../../../../core";
import type { MVTTileOptions } from "../MVTPublisherTypes";

export type GeoJSONVT = any;

/**
 * Strategy interface for MVT tile generation
 * 
 * Strategies are responsible ONLY for tile generation logic.
 * They do NOT handle persistence, metadata management, or directory operations.
 * Those concerns belong to the Publisher layer.
 */
export interface MVTTileGenerationStrategy {
    /**
     * Generate MVT tile index/configuration from a data source
     * 
     * This method should:
     * - Parse/validate the input data
     * - Create tile index (for GeoJSON) or connection pool (for PostGIS)
     * - Return configuration needed for on-demand tile generation
     * 
     * The Publisher will handle:
     * - Generating tilesetId
     * - Saving metadata to disk
     * - Caching the strategy result
     * 
     * @param sourceReference - Data source reference (file path, table name, etc.)
     * @param dataSourceType - Type of data source
     * @param nativeData - Full native data with metadata
     * @param options - Tile generation options
     * @returns Strategy-specific configuration for tile generation
     */
    generateTiles(
        sourceReference: string,
        dataSourceType: DataSourceType,
        nativeData: NativeData,
        options: MVTTileOptions
    ): Promise<any>;

    /**
     * Get a single tile on-demand using previously generated configuration
     * 
     * @param config - Configuration returned by generateTiles()
     * @param z - Zoom level
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns PBF buffer or null if tile doesn't exist
     */
    getTile?(config: any, z: number, x: number, y: number): Promise<Buffer | null>;
}