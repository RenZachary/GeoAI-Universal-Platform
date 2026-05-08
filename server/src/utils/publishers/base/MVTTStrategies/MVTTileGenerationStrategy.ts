import type { DataSourceType, NativeData } from "../../../../core";
import type { MVTTileOptions } from "../MVTPublisherTypes";

export type GeoJSONVT = any;
/**
 * Strategy interface for MVT tile generation
 */
export interface MVTTileGenerationStrategy {
    /**
     * Generate MVT tiles from a data source
     * @param sourceReference - Data source reference (file path, table name, etc.)
     * @param dataSourceType - Type of data source
     * @param options - Tile generation options
     * @returns tilesetId - Unique identifier for the generated tileset
     */
    generateTiles(
        sourceReference: string,
        dataSourceType: DataSourceType,
        nativeData: NativeData,
        options: MVTTileOptions
    ): Promise<string>;

    /**
     * Get a single tile on-demand (for dynamic generation)
     * @param tilesetId - Tileset identifier
     * @param z - Zoom level
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns PBF buffer or null if tile doesn't exist
     */
    getTile?(tilesetId: string, z: number, x: number, y: number): Promise<Buffer | null>;
}