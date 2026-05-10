import geojsonvt from "geojson-vt";
import type { DataSourceType, NativeData } from "../../../core";
import type { MVTTileOptions } from "../../../publishers/base/MVTPublisherTypes";
import type { MVTTileGenerationStrategy } from "./MVTTileGenerationStrategy";
import vtPbf from 'vt-pbf';

import fs from 'fs';

/**
 * GeoJSON MVT Strategy - Uses geojson-vt library
 * 
 * Responsibility: ONLY tile generation logic
 * - Parse GeoJSON file
 * - Create tile index using geojson-vt
 * - Generate PBF tiles on-demand
 * 
 * Does NOT handle:
 * - Directory creation
 * - Metadata persistence
 * - Tile ID generation
 */
export class GeoJSONMVTTStrategy implements MVTTileGenerationStrategy {
    async generateTiles(
        sourceReference: string,
        dataSourceType: DataSourceType,
        nativeData: NativeData,
        options: MVTTileOptions
    ): Promise<any> {
        const {
            minZoom = 0,
            maxZoom = 22,
            extent = 4096,
            tolerance = 3,
            buffer = 64
        } = options;

        console.log('[GeoJSON MVT Strategy] Creating tile index for on-demand generation');

        // Read GeoJSON file
        if (!fs.existsSync(sourceReference)) {
            throw new Error(`GeoJSON file not found: ${sourceReference}`);
        }

        const fileContent = fs.readFileSync(sourceReference, 'utf-8');
        const featureCollection = JSON.parse(fileContent);

        if (!featureCollection || featureCollection.type !== 'FeatureCollection') {
            throw new Error('Input must be a valid GeoJSON FeatureCollection');
        }

        const featureCount = featureCollection.features?.length || 0;
        console.log(`[GeoJSON MVT Strategy] Processing ${featureCount} features`);

        // Create tile index using geojson-vt
        const tileIndex = geojsonvt(featureCollection, {
            maxZoom,
            extent,
            tolerance,
            buffer
        });

        console.log('[GeoJSON MVT Strategy] Tile index created successfully');

        // Return configuration (Publisher will handle persistence)
        return {
            tileIndex,
            options: { minZoom, maxZoom, extent, tolerance, buffer },
            sourceReference,
            featureCount,
            metadata: {
                strategy: 'geojson',
                sourceFile: sourceReference,
                featureCount,
                styleConfig: nativeData.metadata?.styleConfig || null,
                geometryType: nativeData.metadata?.geometryType || null
            }
        };
    }

    /**
     * Get a single tile on-demand
     */
    async getTile(config: any, z: number, x: number, y: number): Promise<Buffer | null> {
        const { tileIndex, options } = config;
        const { extent = 4096, minZoom = 0, maxZoom = 22 } = options;

        // Check if zoom level is within range
        if (z < minZoom || z > maxZoom) {
            console.log(`[GeoJSON MVT Strategy] Zoom ${z} out of range [${minZoom}, ${maxZoom}]`);
            return null;
        }

        // Get tile from index
        const tile = tileIndex.getTile(z, x, y);

        if (!tile || !tile.features || tile.features.length === 0) {
            console.log(`[GeoJSON MVT Strategy] Empty tile at ${z}/${x}/${y}`);
            return null;  // Empty tile
        }

        console.log(`[GeoJSON MVT Strategy] Generating PBF for tile with ${tile.features.length} features`);

        // Convert to PBF
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const layers: any = {};
        layers['default'] = {
            features: tile.features,
            extent: extent,
            version: 2
        };

        const pbf = vtPbf.fromGeojsonVt(layers, { version: 2, extent });

        console.log(`[GeoJSON MVT Strategy] Generated PBF buffer size: ${pbf.length} bytes`);

        return Buffer.from(pbf);
    }
}
