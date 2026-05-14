import type { Database } from "better-sqlite3";
import { VirtualDataSourceManagerInstance } from "../../data-access/managers/VirtualDataSourceManager";
import { VisualizationServicePublisher } from "../../services";
import type { AnalysisResult, GeoAIStateType, VisualizationService } from "./GeoAIGraph";
import { ToolRegistryInstance } from "../tools/ToolRegistry";

export async function publishStepResult(result: Partial<GeoAIStateType>, state: GeoAIStateType, workspaceBase: string, db?: Database) {
    // Publish visualization services using unified publisher
    const allServices: VisualizationService[] = [];

    if (result.executionResults) {
        // Register ALL successful results with NativeData structure as virtual data sources
        // This enables cross-step reference via placeholders like {step_id.result.id}
        const successfulResults = new Map<string, AnalysisResult>();
        for (const [stepId, analysisResult] of result.executionResults.entries()) {
            if (analysisResult.status === 'success' && analysisResult.data) {
                // Check if result has NativeData structure (has id, type, reference)
                const hasNativeDataStructure = analysisResult.data.id &&
                    analysisResult.data.type &&
                    analysisResult.data.reference;

                if (!hasNativeDataStructure) continue;
                // Register as virtual data source for cross-step reference
                VirtualDataSourceManagerInstance.register({
                    id: analysisResult.data.id,
                    conversationId: state.conversationId,
                    stepId: stepId,
                    data: analysisResult.data as any
                });

                // Add to successful results for potential MVT publishing
                successfulResults.set(stepId, analysisResult);
            }
        }

        // Publish services using unified VisualizationServicePublisher
        if (successfulResults.size > 0) {
            const unifiedPublisher = VisualizationServicePublisher.getInstance(workspaceBase, db || undefined);

            for (const [stepId, analysisResult] of successfulResults.entries()) {
                try {
                    // ARCHITECTURAL DECISION: Only publish results from visualization operators
                    // This ensures that styling is always applied and prevents duplicate layers
                    const operatorId = analysisResult.metadata?.operatorId;
                    let shouldPublish = false;

                    if (operatorId) {
                        const operator = ToolRegistryInstance.getOperator(operatorId);
                        if (operator && operator.category === 'visualization') {
                            shouldPublish = true;
                        }
                    } else {
                        // Fallback: If no operatorId in metadata, check if it's a report
                        const dataType = analysisResult.data.type || 'geojson';
                        if (dataType.toLowerCase() === 'report' || dataType.toLowerCase() === 'markdown') {
                            shouldPublish = true;
                        }
                    }

                    if (!shouldPublish) continue;

                    const dataType = analysisResult.data.type || 'geojson';
                    let publishResult: any = null;

                    switch (dataType.toLowerCase()) {
                        case 'report':
                        case 'markdown':
                            publishResult = unifiedPublisher.publishReport(
                                stepId,
                                analysisResult.data.content || '',
                                86400000 // 24 hours for reports
                            );
                            break;

                        default: {
                            // All vector data from visualization operators should be published as MVT
                            const mvtOptions = {
                                minZoom: 0,
                                maxZoom: 18,
                                extent: 4096,
                                layerName: 'default'
                            };

                            // Use unified VisualizationServicePublisher with NativeData (no conversion needed)
                            publishResult = await unifiedPublisher.publishMVTFromNativeData(
                                analysisResult.data,  // Pass NativeData directly
                                mvtOptions,
                                stepId,               // Use stepId as service ID
                                3600000               // 1 hour TTL
                            );

                            break;
                        }
                    }

                    if (publishResult.success && publishResult.metadata) {
                        const service: VisualizationService = {
                            id: publishResult.serviceId || stepId,
                            stepId,
                            goalId: analysisResult.goalId,
                            type: publishResult.metadata.type as VisualizationService['type'],
                            url: publishResult.url || '',
                            ttl: publishResult.metadata.ttl || 3600000,
                            expiresAt: publishResult.metadata.expiresAt || new Date(Date.now() + 3600000),
                            metadata: {
                                // Merge operator metadata (operatorId, etc.) with data metadata (styleConfig, etc.)
                                ...analysisResult.metadata,  // Contains operatorId, executedAt
                                ...publishResult.metadata.metadata  // Contains styleConfig, geometryType, etc.
                            }
                        };

                        allServices.push(service);

                        // Stream partial results to frontend if callback provided
                    }
                } catch (error) {
                    console.error(`[Plugin Executor] Failed to publish service for ${stepId}:`, error);
                }
            }
        }
    }
    return allServices;
}