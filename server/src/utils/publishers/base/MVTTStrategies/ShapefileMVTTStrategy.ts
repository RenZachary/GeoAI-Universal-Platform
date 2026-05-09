import type { MVTTileGenerationStrategy } from './MVTTileGenerationStrategy';

import fs from 'fs';
import type { DataSourceType, NativeData } from '../../../../core/index';
import type { MVTTileOptions } from '../MVTPublisherTypes';
import path from 'path';
import { tryMultipleEncodings } from '../../../../data-access';
import { GeoJSONMVTTStrategy } from './GeoJSONMVTTStrategy';
/**
 * Shapefile MVT Strategy - Converts to GeoJSON first, then uses geojson-vt
 */
export class ShapefileMVTTStrategy implements MVTTileGenerationStrategy {
    constructor(private mvtOutputDir: string) { }

    async generateTiles(
        sourceReference: string,
        dataSourceType: DataSourceType,
        nativeData: NativeData,
        options: MVTTileOptions
    ): Promise<string> {
        console.log('[Shapefile MVT Strategy] Converting Shapefile to GeoJSON...');

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

        // Generate tilesetId first so we can save the converted GeoJSON in its directory
        const tilesetId = `mvt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const tilesetDir = path.join(this.mvtOutputDir, tilesetId);

        if (!fs.existsSync(tilesetDir)) {
            fs.mkdirSync(tilesetDir, { recursive: true });
        }

        // Save the converted GeoJSON in the tileset directory (persistent, needed for on-demand generation)
        const convertedGeoJsonPath = path.join(tilesetDir, 'source.geojson');
        fs.writeFileSync(convertedGeoJsonPath, JSON.stringify(geojson), 'utf-8');
        console.log(`[Shapefile MVT Strategy] Saved converted GeoJSON to: ${convertedGeoJsonPath}`);

        // Delegate to GeoJSON strategy
        const geojsonStrategy = new GeoJSONMVTTStrategy(this.mvtOutputDir);

        try {
            // Generate tiles from the converted GeoJSON file
            return await geojsonStrategy.generateTiles(convertedGeoJsonPath, 'geojson', nativeData, options);
        } catch (error) {
            // Only clean up if tile generation failed
            if (fs.existsSync(convertedGeoJsonPath)) {
                fs.unlinkSync(convertedGeoJsonPath);
                console.log('[Shapefile MVT Strategy] Cleaned up converted GeoJSON file after error');
            }
            throw error;
        }
        // Note: Do NOT delete convertedGeoJsonPath on success - it's needed for on-demand tile generation
    }
}