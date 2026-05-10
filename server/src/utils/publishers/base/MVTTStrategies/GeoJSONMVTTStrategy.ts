import geojsonvt from "geojson-vt";
import type { DataSourceType, NativeData } from "../../../../core";
import type { MVTTileOptions } from "../MVTPublisherTypes";
import type { GeoJSONVT, MVTTileGenerationStrategy } from "./MVTTileGenerationStrategy";
import vtPbf from 'vt-pbf';

import fs from 'fs';
import path from 'path';

/**
 * GeoJSON MVT Strategy - Uses geojson-vt library
 * Generates tiles on-demand from cached tile index
 */
export class GeoJSONMVTTStrategy implements MVTTileGenerationStrategy {
    // Cache for tile indexes (tilesetId -> tileIndex)
    private tileIndexCache: Map<string, GeoJSONVT> = new Map();

    constructor(private mvtOutputDir: string) { }

    async generateTiles(
        sourceReference: string,
        dataSourceType: DataSourceType,
        nativeData: NativeData,
        options: MVTTileOptions
    ): Promise<string> {
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

        // Generate a unique ID for this tile set
        const tilesetId = `mvt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const tilesetDir = path.join(this.mvtOutputDir, tilesetId);

        if (!fs.existsSync(tilesetDir)) {
            fs.mkdirSync(tilesetDir, { recursive: true });
        }

        // Cache the tile index for on-demand access
        this.tileIndexCache.set(tilesetId, {
            tileIndex,
            options: { minZoom, maxZoom, extent, tolerance, buffer },
            sourceReference,
            createdAt: Date.now()
        });

        console.log('[GeoJSON MVT Strategy] On-demand mode enabled. Tiles will be generated when requested.');

        // Create tileset metadata
        const metadata = {
            id: tilesetId,
            minZoom,
            maxZoom,
            extent,
            generatedAt: new Date().toISOString(),
            format: 'pbf',
            strategy: 'geojson',  // Must match the registered strategy key
            sourceFile: sourceReference,
            featureCount,
            // Include styleConfig and geometryType for frontend rendering
            styleConfig: nativeData.metadata?.styleConfig || null,
            geometryType: nativeData.metadata?.geometryType || null
        };

        const metadataPath = path.join(tilesetDir, 'metadata.json');
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        console.log(`[GeoJSON MVT Strategy] Tileset created: ${tilesetId}`);

        return tilesetId;
    }

    /**
     * Get a single tile on-demand
     */
    async getTile(tilesetId: string, z: number, x: number, y: number): Promise<Buffer | null> {
        console.log(`[GeoJSON MVT Strategy] getTile called: ${tilesetId}/${z}/${x}/${y}`);
        console.log(`[GeoJSON MVT Strategy] Cache size: ${this.tileIndexCache.size}`);

        let cached = this.tileIndexCache.get(tilesetId);

        // If not in cache, load from source file
        if (!cached) {
            console.log(`[GeoJSON MVT Strategy] Tileset not in cache, loading from source...`);

            // Read metadata to get source file path
            const tilesetDir = path.join(this.mvtOutputDir, tilesetId);
            const metadataPath = path.join(tilesetDir, 'metadata.json');

            if (!fs.existsSync(metadataPath)) {
                console.warn(`[GeoJSON MVT Strategy] Metadata not found: ${metadataPath}`);
                return null;
            }

            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
            const sourceFile = metadata.sourceFile;

            if (!sourceFile || !fs.existsSync(sourceFile)) {
                console.warn(`[GeoJSON MVT Strategy] Source file not found: ${sourceFile}`);
                return null;
            }

            console.log(`[GeoJSON MVT Strategy] Loading GeoJSON from: ${sourceFile}`);

            try {
                // Read and parse GeoJSON
                const fileContent = fs.readFileSync(sourceFile, 'utf-8');
                const featureCollection = JSON.parse(fileContent);

                if (!featureCollection || featureCollection.type !== 'FeatureCollection') {
                    console.warn('[GeoJSON MVT Strategy] Invalid GeoJSON format');
                    return null;
                }

                console.log(`[GeoJSON MVT Strategy] Creating tileIndex for ${featureCollection.features?.length || 0} features`);

                // Create tile index
                const tileIndex = geojsonvt(featureCollection, {
                    maxZoom: metadata.maxZoom || 22,
                    extent: metadata.extent || 4096,
                    tolerance: 3,
                    buffer: 64
                });

                // Cache the tile index
                cached = { tileIndex, options: metadata };
                this.tileIndexCache.set(tilesetId, cached);

                console.log(`[GeoJSON MVT Strategy] TileIndex created and cached for: ${tilesetId}`);
            } catch (error) {
                console.error('[GeoJSON MVT Strategy] Failed to load source file:', error);
                return null;
            }
        }

        console.log(`[GeoJSON MVT Strategy] Found cached tileIndex for: ${tilesetId}`);

        const { tileIndex, options } = cached;
        const { extent = 4096 } = options;

        // Check if zoom level is within range
        if (z < options.minZoom || z > options.maxZoom) {
            console.log(`[GeoJSON MVT Strategy] Zoom ${z} out of range [${options.minZoom}, ${options.maxZoom}]`);
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
