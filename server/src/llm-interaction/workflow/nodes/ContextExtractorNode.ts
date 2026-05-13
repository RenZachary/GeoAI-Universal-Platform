/**
 * ContextExtractorNode - Extracts spatial context and registers as virtual data sources
 * 
 * This node:
 * 1. Receives spatial context from frontend (viewport, selection, drawing)
 * 2. Converts to  GeoJSON.FeatureCollection
 * 3. Registers each feature as a virtual data source
 */

import type { GeoAIStateType } from '../GeoAIGraph';
import type { SpatialContext, DrawnGeometry } from '../../types/SpatialContext';
import { VirtualDataSourceManagerInstance } from '../../../data-access/managers/VirtualDataSourceManager';
import path from 'path';
import fs from 'fs/promises';
import type { FeatureCollection } from '../../../core';
import { DataAccessFacade } from '../../../data-access';

export interface ContextExtractorInput {
    query: string;
    context?: SpatialContext;
    conversationId: string;
}

export interface ContextExtractorOutput {
    contextMetadata?: {
        hasViewport: boolean;
        hasSelection: boolean;
        hasDrawing: boolean;
    };
}

export class ContextExtractorNode {
    private workspaceBase: string;

    constructor(workspaceBase: string) {
        this.workspaceBase = workspaceBase;
    }

    /**
     * Execute context extraction
     */
    async execute(state: GeoAIStateType): Promise<Partial<GeoAIStateType>> {
        const context = (state as any).context as SpatialContext | undefined;
        const conversationId = state.conversationId;

        // CRITICAL: Clean up old virtual data sources for this conversation BEFORE registering new ones
        // This ensures LLM only sees the latest spatial context and avoids confusion
        console.log(`[ContextExtractor] Cleaning up old virtual sources for conversation: ${conversationId}`);
        VirtualDataSourceManagerInstance.cleanup(conversationId);

        if (!context) {
            console.log('[ContextExtractor] No spatial context provided');
            return {
                contextMetadata: {
                    hasViewport: false,
                    hasSelection: false,
                    hasDrawing: false
                }
            };
        }

        console.log('[ContextExtractor] Processing spatial context:', {
            hasViewport: !!context.viewportBbox,
            hasSelection: !!context.selectedFeature,
            hasDrawingCount: context.drawnGeometries?.length || 0
        });

        // 创建标准的GeoJOSN文件
        const fsViewport: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
        const fsSelection: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
        const fsDrawing: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

        // 1. Convert viewport bbox to rectangle geometry (fixed ID: "viewport")
        if (context.viewportBbox) {
            console.log(`[ContextExtractor] Converting viewport bbox to polygon`)
            console.log(`[ContextExtractor] context.viewportBbox:", ${context.viewportBbox}`)
            const viewportGeometry = this.bboxToPolygon(context.viewportBbox);
            fsViewport.features.push({
                type: 'Feature',  // ← GeoJSON Feature type
                id: `viewport_${conversationId}`,
                geometry: viewportGeometry,
                properties: {
                    name: 'Viewport',
                    description: 'Current map viewport',
                    bbox: context.viewportBbox
                }
            });
        }

        // 2. Convert selected feature (fixed ID: "selection")
        // 这里不完善，需要判断完整的geometry类型
        if (context.selectedFeature) {
            fsSelection.features.push({
                type: 'Feature',  // ← GeoJSON Feature type
                id: `selection_${conversationId}`,
                geometry: context.selectedFeature.geometry,
                properties: {
                    name: 'Selection',
                    ...context.selectedFeature.properties,
                    sourceDatasetId: context.selectedFeature.datasetId
                }
            });
        }

        // 3. Convert drawn geometries (use original IDs or indexed names)
        // 这里不完善，需要判断完整的geometry类型Polygon or line
        if (context.drawnGeometries && context.drawnGeometries.length > 0) {
            context.drawnGeometries.forEach((drawn: DrawnGeometry, index: number) => {
                fsDrawing.features.push({
                    type: 'Feature',  // ← GeoJSON Feature type
                    id: `drawing_${conversationId}_${index}`,
                    geometry: drawn.geometry,
                    properties: {
                        name: `Drawing_${index + 1}`,
                        ...drawn.properties,
                        drawingType: drawn.type
                    }
                });
            });
        }

        // 4. Register as virtual data sources
        if (fsViewport.features.length > 0) {
            await this.registerAsVirtualDataSource(fsViewport, 'viewport', state.conversationId);
        }

        if (fsSelection.features.length > 0) {
           await this.registerAsVirtualDataSource(fsSelection, 'selection', state.conversationId);
        }

        if (fsDrawing.features.length > 0) {
            await this.registerAsVirtualDataSource(fsDrawing, 'drawing', state.conversationId);
        }

        return {
            contextMetadata: {
                hasViewport: !!context.viewportBbox,
                hasSelection: !!context.selectedFeature,
                hasDrawing: !!(context.drawnGeometries?.length)
            }
        };
    }

    /**
     * Convert bbox to polygon geometry
     */
    private bboxToPolygon(bbox: [number, number, number, number]): GeoJSON.Polygon {
        const [minX, minY, maxX, maxY] = bbox;
        return {
            type: 'Polygon',
            coordinates: [[
                [minX, minY],
                [maxX, minY],
                [maxX, maxY],
                [minX, maxY],
                [minX, minY] // Close the ring
            ]]
        };
    }

    /**
     * Register a user mentioned feature as virtual data source
     */
    private async registerAsVirtualDataSource(
        features: FeatureCollection,
        type: string,
        conversationId: string
    ): Promise<string> {
        // Create temporary GeoJSON file

        const tempDir = path.join(this.workspaceBase, 'temp');
        await fs.mkdir(tempDir, { recursive: true });
        const fileName = `${type}_${conversationId}.geojson`;
        const filePath = path.join(tempDir, fileName);
        await fs.writeFile(filePath, JSON.stringify(features));
        const metadata = await DataAccessFacade.getInstance().getMetadata('geojson', filePath);
        // Register to VirtualDataSourceManager
        VirtualDataSourceManagerInstance.register({
            id: fileName,
            conversationId,
            stepId: `context_${type}`,
            data: {
                id: fileName,
                type: 'geojson',
                reference: filePath,
                createdAt: new Date(),
                metadata: metadata as any
            }
        });

        console.log(`[ContextExtractor] Registered virtual data source: ${fileName} (${type})`);
        return fileName;
    }
}
