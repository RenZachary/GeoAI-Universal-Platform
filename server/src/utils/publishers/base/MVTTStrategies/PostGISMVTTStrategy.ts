/**
 * PostGIS MVT Strategy - Uses ST_AsMVT() SQL function (most efficient)
 * Generates tiles on-demand using PostGIS native MVT support
 */

import fs from 'fs';
import type { DataSourceType, NativeData } from '../../../../core/index';
import { PostGISTileGenerator, type PostGISTileQuery } from '../PostGISTileGenerator';
import { PostGISConnectionParser } from '../../../../data-access';
import type { PostGISConnectionConfig } from '../../../../core';
import type { GeoJSONVT, MVTTileGenerationStrategy } from './MVTTileGenerationStrategy';
import type { Pool } from 'pg';
import type Database from 'better-sqlite3';
import type { MVTTileOptions } from '../MVTPublisherTypes';
import path from 'path';
import { DataSourceRepository } from '../../../../data-access/repositories';
export class PostGISMVTTStrategy implements MVTTileGenerationStrategy {
    private tileIndexCache: Map<string, GeoJSONVT> = new Map();
    private postgisPools: Map<string, Pool> = new Map();
    private tileGenerator: PostGISTileGenerator;

    constructor(
        private mvtOutputDir: string,
        private db: Database.Database
    ) {
        this.tileGenerator = new PostGISTileGenerator();
    }

    async generateTiles(
        sourceReference: string,
        dataSourceType: DataSourceType,
        nativeData: NativeData,
        options: MVTTileOptions
    ): Promise<string> {
        console.log('[PostGIS MVT Strategy] Setting up PostGIS MVT generation...');
        console.log(`[PostGIS MVT Strategy] Source reference: ${sourceReference}`);

        const {
            minZoom = 0,
            maxZoom = 22,
            extent = 4096,
            tolerance = 3,
            buffer = 64,
            // layerName = 'default'  // Always use 'default' to match StyleFactory expectations
        } = options;

        // CRITICAL: Force layerName to 'default' for PostGIS tiles to match StyleFactory's 'source-layer' setting
        // This ensures consistency with GeoJSON-based MVT tiles which always use 'default'
        const forcedLayerName = 'default';

        // Generate a unique ID for this tileset
        const tilesetId = `mvt_postgis_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const tilesetDir = path.join(this.mvtOutputDir, tilesetId);

        if (!fs.existsSync(tilesetDir)) {
            fs.mkdirSync(tilesetDir, { recursive: true });
        }

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

        // Store pool for later use
        this.postgisPools.set(tilesetId, pool);

        // Cache the connection info for on-demand tile generation
        this.tileIndexCache.set(tilesetId, {
            connectionInfo,
            options: { minZoom, maxZoom, extent, tolerance, buffer, layerName: forcedLayerName },
            createdAt: Date.now()
        });

        // Create tileset metadata - save dataSourceId for secure password retrieval
        const metadata = {
            id: tilesetId,
            minZoom,
            maxZoom,
            extent,
            generatedAt: new Date().toISOString(),
            format: 'pbf',
            strategy: 'postgis',  // Must match the registered strategy key
            sourceReference,
            layerName: forcedLayerName,  // Always 'default' to match StyleFactory
            // Save dataSourceId to retrieve connection info securely (includes password)
            dataSourceId: nativeData.metadata?.dataSourceId || null,
            geometryColumn: nativeData.metadata?.geometryColumn || 'geom',
            // Include styleConfig for frontend rendering
            styleConfig: nativeData.metadata?.styleConfig || null,
            geometryType: nativeData.metadata?.geometryType || null
        };

        const metadataPath = path.join(tilesetDir, 'metadata.json');
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        console.log(`[PostGIS MVT Strategy] Tileset created: ${tilesetId}`);
        console.log(`[PostGIS MVT Strategy] Using on-demand generation with ST_AsMVT()`);

        return tilesetId;
    }

    /**
     * Get a single tile on-demand using PostGIS ST_AsMVT()
     */
    async getTile(tilesetId: string, z: number, x: number, y: number): Promise<Buffer | null> {
        let cached = this.tileIndexCache.get(tilesetId);

        // If not in cache, reload from metadata file (NOT from database)
        if (!cached) {
            console.log(`[PostGIS MVT Strategy] Tileset not in cache, reloading from metadata file...`);

            // Read metadata to get source reference and connection info
            const tilesetDir = path.join(this.mvtOutputDir, tilesetId);
            const metadataPath = path.join(tilesetDir, 'metadata.json');

            if (!fs.existsSync(metadataPath)) {
                console.warn(`[PostGIS MVT Strategy] Metadata not found: ${metadataPath}`);
                return null;
            }

            const fileMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
            const sourceReference = fileMetadata.sourceReference;

            if (!sourceReference) {
                console.warn(`[PostGIS MVT Strategy] Source reference not found in metadata`);
                return null;
            }

            console.log(`[PostGIS MVT Strategy] Reloading PostGIS connection for: ${sourceReference}`);

            try {
                // Get complete connection info from DataSourceRepository (includes password)
                let connectionInfo: any = null;
                
                if (fileMetadata.dataSourceId) {
                    // Preferred method: use dataSourceId to get full connection info
                    const dataSourceRepo = new DataSourceRepository(this.db);
                    const dataSource = dataSourceRepo.getById(fileMetadata.dataSourceId);
                    
                    if (dataSource && dataSource.metadata?.connection) {
                        console.log(`[PostGIS MVT Strategy] Retrieved connection from DataSourceRepository`);
                        const conn = dataSource.metadata.connection;
                        connectionInfo = {
                            user: conn.user,
                            password: conn.password,  // Safe: retrieved from secure SQLite DB
                            host: conn.host,
                            port: conn.port,
                            database: conn.database,
                            schema: fileMetadata.sourceReference.split('.')[0] || conn.schema || 'public',
                            tableName: fileMetadata.sourceReference.split('.')[1],
                            geometryColumn: fileMetadata.geometryColumn || 'geom'
                        };
                    }
                }
                
                // Fallback: try to parse from metadata (without password - will fail)
                if (!connectionInfo) {
                    console.warn(`[PostGIS MVT Strategy] dataSourceId not found, attempting fallback...`);
                    const reconstructedMetadata = {
                        connection: fileMetadata.connectionMetadata,
                        geometryColumn: fileMetadata.geometryColumn || 'geom'
                    };
                    
                    connectionInfo = PostGISConnectionParser.parse(
                        sourceReference,
                        reconstructedMetadata
                    );
                }

                if (!connectionInfo) {
                    console.warn(`[PostGIS MVT Strategy] Failed to get connection info`);
                    return null;
                }

                // Recreate connection pool using PostGISPoolManager
                const poolConfig: PostGISConnectionConfig = {
                    host: connectionInfo.host,
                    port: connectionInfo.port,
                    database: connectionInfo.database,
                    user: connectionInfo.user,
                    password: connectionInfo.password,
                    schema: connectionInfo.schema
                };

                const pool = await this.tileGenerator.createPool(poolConfig);
                this.postgisPools.set(tilesetId, pool);

                // Restore cache entry
                const { minZoom = 0, maxZoom = 22, extent = 4096 } = fileMetadata;
                cached = {
                    connectionInfo,
                    options: { minZoom, maxZoom, extent, layerName: 'default' },  // Always use 'default'
                    createdAt: Date.now()
                };
                this.tileIndexCache.set(tilesetId, cached);

                console.log(`[PostGIS MVT Strategy] Connection restored from metadata file for: ${tilesetId}`);
            } catch (error) {
                console.error('[PostGIS MVT Strategy] Failed to reload connection:', error);
                return null;
            }
        }

        console.log(`[PostGIS MVT Strategy] Found cached connection for: ${tilesetId}`);

        const { connectionInfo, options } = cached;
        const { layerName = 'default', extent = 4096 } = options;  // Will always be 'default'

        // Get pool from cache
        const pool = this.postgisPools.get(tilesetId);
        if (!pool) {
            console.warn(`[PostGIS MVT Strategy] PostGIS pool not found: ${tilesetId}`);
            return null;
        }

        try {
            // Build query using shared generator
            const query: PostGISTileQuery = {
                tableName: connectionInfo.tableName,
                sqlQuery: connectionInfo.sqlQuery,
                geometryColumn: connectionInfo.geometryColumn
            };
            console.log('[PostGIS MVT Strategy] Generating tile using ST_AsMVT()...');
            console.log('[PostGIS MVT Strategy] sqlQuery:', connectionInfo.sqlQuery);
            console.log("[PostGIS MVT Strategy] extent:", extent)
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
