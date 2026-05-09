/**
 * Service Publisher - Publishes different types of visualization services
 * Separates service publishing logic from output analysis
 */

import type { AnalysisResult, VisualizationService } from './GeoAIGraph';

export interface ServicePublishingContext {
    stepId: string;
    goalId?: string;
    result: AnalysisResult;
}

export class ServicePublisher {
    /**
     * Publish visualization service based on result data type
     */
    publish(context: ServicePublishingContext): VisualizationService | null {
        const { stepId, goalId, result } = context;

        if (result.status !== 'success' || !result.data) {
            return null;
        }

        // Skip metadata-only results (e.g., data source queries)
        if (result.data.metadata?.isMetadataOnly) {
            console.log(`[Service Publisher] Skipping metadata-only result: ${stepId}`);
            return null;
        }

        // Determine service type and URL based on data type
        const serviceType = this.determineServiceType(result.data.type);
        // Use result.data.id for URL generation (actual file ID)
        const resultId = result.data.id || stepId;
        const serviceUrl = this.generateServiceUrl(serviceType, resultId, result.data);

        if (!serviceUrl) {
            console.warn(`[Service Publisher] Cannot generate URL for type: ${result.data.type}`);
            return null;
        }

        return {
            id: `service_${resultId}`,
            stepId,
            goalId,
            type: serviceType,
            url: serviceUrl,
            ttl: 3600000, // 1 hour default
            expiresAt: new Date(Date.now() + 3600000),
            metadata: {
                // Merge data.metadata (from executor) with result.metadata (from operator execution)
                ...result.data?.metadata,  // Contains styleUrl, tilesetId, etc.
                ...result.metadata,        // Contains operatorId, parameters, executedAt
                resultType: result.data.type || 'unknown',
                generatedAt: new Date().toISOString()
            }
        };
    }

    /**
     * Determine service type from data type
     */
    private determineServiceType(dataType?: string): 'geojson' | 'mvt' | 'image' | 'report' {
        if (!dataType) {
            return 'geojson'; // Default fallback
        }

        switch (dataType.toLowerCase()) {
            case 'mvt':
                return 'mvt';

            case 'tif':
            case 'geotiff':
            case 'wms':
                return 'image'; // WMS/Image service for map viewing

            case 'report':
            case 'markdown':
                return 'report'; // Report service

            case 'geojson':
            case 'shapefile':
            case 'postgis':
            default:
                return 'geojson';
        }
    }

    /**
     * Generate service URL based on type and data
     */
    private generateServiceUrl(
        serviceType: 'geojson' | 'mvt' | 'image' | 'report',
        stepId: string,
        data: any
    ): string {
        switch (serviceType) {
            case 'mvt':
                // MVT uses tileset ID from metadata or stepId
                {
                    const tilesetId = data.tilesetId || data.metadata?.tilesetId || stepId;
                    return `/api/services/mvt/${tilesetId}/{z}/{x}/{y}.pbf`;
                }

            case 'image':
                // WMS or image service
                return `/api/services/wms/${stepId}`;

            case 'report':
                // Report file
                return `/api/results/reports/${stepId}.md`;

            case 'geojson':
            default:
                // GeoJSON result endpoint
                return `/api/results/${stepId}.geojson`;
        }
    }

    /**
     * Batch publish services for multiple results
     */
    publishBatch(results: Map<string, AnalysisResult>): VisualizationService[] {
        const services: VisualizationService[] = [];

        for (const [stepId, result] of results.entries()) {
            const service = this.publish({
                stepId,
                goalId: result.goalId,
                result
            });

            if (service) {
                services.push(service);
            }
        }

        return services;
    }
}
