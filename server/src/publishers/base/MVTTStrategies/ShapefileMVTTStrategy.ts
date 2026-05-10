import type { MVTTileGenerationStrategy } from './MVTTileGenerationStrategy';

import fs from 'fs';
import type { DataSourceType, NativeData } from '../../../core/index';
import type { MVTTileOptions } from '../../../publishers/base/MVTPublisherTypes';
import path from 'path';
import { tryMultipleEncodings } from '../../../data-access';
import { GeoJSONMVTTStrategy } from './GeoJSONMVTTStrategy';

/**
 * Shapefile MVT Strategy - Converts to GeoJSON first, then delegates to GeoJSON strategy
 * 
 * Responsibility: ONLY conversion logic
 * - Read Shapefile with encoding detection
 * - Convert to GeoJSON
 * - Save converted GeoJSON temporarily
 * - Delegate to GeoJSON strategy
 * 
 * Does NOT handle:
 * - Directory creation (Publisher provides temp dir)
 * - Metadata persistence
 * - Tile ID generation
 */
export class ShapefileMVTTStrategy implements MVTTileGenerationStrategy {
    constructor(private tempDir?: string) { }

    async generateTiles(
        sourceReference: string,
        dataSourceType: DataSourceType,
        nativeData: NativeData,
        options: MVTTileOptions
    ): Promise<any> {
        // Validate that sourceReference is actually a Shapefile
        if (!sourceReference.endsWith('.shp') && !sourceReference.endsWith('.geojson')) {
            console.warn('[Shapefile MVT Strategy] Warning: sourceReference does not look like a Shapefile or GeoJSON:', sourceReference);
        }

        // If sourceReference is already a GeoJSON file (from previous conversion), just read it
        if (sourceReference.endsWith('.geojson')) {
            const geojsonStrategy = new GeoJSONMVTTStrategy();
            return geojsonStrategy.generateTiles(sourceReference, 'geojson', nativeData, options);
        }

        // Use shapefile library directly with shared encoding utility
        const shapefilePath = sourceReference.replace('.shp', '');
        const shapefileModule = await import('shapefile');

        // Use shared encoding utility for Chinese character support
        const features = await tryMultipleEncodings(
            async (encoding) => {
                return await (shapefileModule as any).open(shapefilePath, undefined, { encoding });
            },
            shapefilePath,
            (message) => console.log(`[Shapefile MVT Strategy] ${message}`)
        );

        const geojson = {
            type: 'FeatureCollection',
            features: features
        };

        console.log(`[Shapefile MVT Strategy] Converted to GeoJSON with ${geojson.features?.length || 0} features`);

        // Save the converted GeoJSON temporarily (Publisher will manage lifecycle)
        let convertedGeoJsonPath: string | null = null;
        
        if (this.tempDir) {
            // Ensure temp directory exists
            if (!fs.existsSync(this.tempDir)) {
                fs.mkdirSync(this.tempDir, { recursive: true });
            }
            
            convertedGeoJsonPath = path.join(this.tempDir, `temp_${Date.now()}.geojson`);
            fs.writeFileSync(convertedGeoJsonPath, JSON.stringify(geojson), 'utf-8');
        }

        // Delegate to GeoJSON strategy
        const geojsonStrategy = new GeoJSONMVTTStrategy();

        try {
            // Generate tiles from the converted GeoJSON file
            const config = await geojsonStrategy.generateTiles(
                convertedGeoJsonPath || sourceReference, 
                'geojson', 
                nativeData, 
                options
            );
            
            // Add shapefile-specific metadata
            config.metadata.strategy = 'shapefile';
            config.metadata.convertedFrom = sourceReference;
            
            return config;
        } catch (error) {
            // Clean up temporary file if created
            if (convertedGeoJsonPath && fs.existsSync(convertedGeoJsonPath)) {
                fs.unlinkSync(convertedGeoJsonPath);
            }
            throw error;
        }
    }

    /**
     * Get a specific tile by delegating to GeoJSON strategy
     */
    async getTile(config: any, z: number, x: number, y: number): Promise<Buffer | null> {
        // Delegate to GeoJSON strategy since Shapefile was converted to GeoJSON
        const geojsonStrategy = new GeoJSONMVTTStrategy();
        return geojsonStrategy.getTile(config, z, x, y);
    }
}