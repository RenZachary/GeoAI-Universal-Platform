/**
 * PostGIS MVT Strategy - Uses ST_AsMVT() SQL function (most efficient)
 * 
 * Responsibility: ONLY tile generation logic
 * - Parse connection info from NativeData
 * - Create connection pool
 * - Generate tiles using ST_AsMVT()
 * 
 * Does NOT handle:
 * - Directory creation
 * - Metadata persistence
 * - Tile ID generation
 */

import type { DataSourceType, NativeData } from '../../../../core/index';
import { PostGISTileGenerator, type PostGISTileQuery } from '../PostGISTileGenerator';
import { PostGISConnectionParser } from '../../../../data-access';
import type { PostGISConnectionConfig } from '../../../../core';
import type { MVTTileGenerationStrategy } from './MVTTileGenerationStrategy';
import type Database from 'better-sqlite3';
import type { MVTTileOptions } from '../MVTPublisherTypes';

export class PostGISMVTTStrategy implements MVTTileGenerationStrategy {
    private tileGenerator: PostGISTileGenerator;

    constructor(private db: Database.Database) {
        this.tileGenerator = new PostGISTileGenerator();
    }

    async generateTiles(
        sourceReference: string,
        dataSourceType: DataSourceType,
        nativeData: NativeData,
        options: MVTTileOptions
    ): Promise<any> {
        console.log('[PostGIS MVT Strategy] Setting up PostGIS MVT generation...');
        console.log(`[PostGIS MVT Strategy] Source reference: ${sourceReference}`);

        const {
            minZoom = 0,
            maxZoom = 22,
            extent = 4096,
            tolerance = 3,
            buffer = 64,
        } = options;

        // CRITICAL: Force layerName to 'default' for PostGIS tiles to match StyleFactory's 'source-layer' setting
        const forcedLayerName = 'default';

        // Use nativeData.metadata to parse connection info (no database query needed)
        const connectionInfo = PostGISConnectionParser.parse(sourceReference, nativeData.metadata);

        if (!connectionInfo) {
            throw new Error('Invalid PostGIS connection reference format');
        }

        // Create connection pool using shared manager
        const poolConfig: PostGISConnectionConfig = {
            host: connectionInfo.host,
            port: connectionInfo.port,
            database: connectionInfo.database,
            user: connectionInfo.user,
            password: connectionInfo.password,
            schema: connectionInfo.schema
        };

        const pool = await this.tileGenerator.createPool(poolConfig);

        console.log(`[PostGIS MVT Strategy] Connection pool created successfully`);

        // Return configuration (Publisher will handle persistence)
        return {
            pool,
            connectionInfo: {
                ...connectionInfo,
                layerName: forcedLayerName,
                geometryColumn: nativeData.metadata?.geometryColumn || 'geom'
            },
            options: { minZoom, maxZoom, extent, tolerance, buffer, layerName: forcedLayerName },
            metadata: {
                strategy: 'postgis',
                sourceReference,
                layerName: forcedLayerName,
                connectionInfo: nativeData.metadata?.connection || null,
                geometryColumn: nativeData.metadata?.geometryColumn || 'geom',
                styleConfig: nativeData.metadata?.styleConfig || null,
                geometryType: nativeData.metadata?.geometryType || null
            }
        };
    }

    /**
     * Get a single tile on-demand using PostGIS ST_AsMVT()
     */
    async getTile(config: any, z: number, x: number, y: number): Promise<Buffer | null> {
        const { pool, connectionInfo, options } = config;
        const { layerName = 'default', extent = 4096 } = options;

        try {
            // Build query using shared generator
            const query: PostGISTileQuery = {
                tableName: connectionInfo.tableName,
                sqlQuery: connectionInfo.sqlQuery,
                geometryColumn: connectionInfo.geometryColumn
            };
            
            console.log('[PostGIS MVT Strategy] Generating tile using ST_AsMVT()...');
            console.log('[PostGIS MVT Strategy] sqlQuery:', connectionInfo.sqlQuery);
            console.log("[PostGIS MVT Strategy] extent:", extent);
            
            const result = await this.tileGenerator.generateTile(
                pool,
                z, x, y,
                query,
                {
                    extent,
                    layerName,
                    schema: connectionInfo.schema
                }
            );

            if (!result.success) {
                console.error('[PostGIS MVT Strategy] Tile generation failed:', result.error);
                return null;
            }
            
            return result.tileBuffer || null;

        } catch (error) {
            console.error('[PostGIS MVT Strategy] Error generating tile:', error);
            return null;
        }
    }
}
