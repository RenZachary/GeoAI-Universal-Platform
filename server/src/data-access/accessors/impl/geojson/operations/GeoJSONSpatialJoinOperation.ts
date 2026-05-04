/**
 * GeoJSON Spatial Join Operation
 */

import type { NativeData } from '../../../../../core';
import { generateId } from '../../../../../core';
import type { GeoJSONFeatureCollection } from '../GeoJSONBasedAccessor';
import * as turf from '@turf/turf';

export class GeoJSONSpatialJoinOperation {
  async execute(
    targetGeoJSON: GeoJSONFeatureCollection,
    joinGeoJSON: GeoJSONFeatureCollection,
    operation: string,
    joinType: string,
    saveGeoJSON: (geojson: GeoJSONFeatureCollection, hint?: string) => Promise<string>,
    extractMetadata: (geojson: GeoJSONFeatureCollection, reference: string) => any
  ): Promise<NativeData> {
    try {
      const resultFeatures = [];

      for (const targetFeature of targetGeoJSON.features) {
        let matched = false;

        for (const joinFeature of joinGeoJSON.features) {
          try {
            let isMatch = false;

            switch (operation) {
              case 'intersects':
                isMatch = (turf as any).booleanIntersects(targetFeature, joinFeature);
                break;
              case 'within':
                isMatch = (turf as any).booleanWithin(targetFeature, joinFeature);
                break;
              case 'contains':
                isMatch = (turf as any).booleanContains(joinFeature, targetFeature);
                break;
              case 'touches':
                isMatch = (turf as any).booleanTouching(targetFeature, joinFeature);
                break;
              default:
                throw new Error(`Unsupported spatial operation: ${operation}`);
            }

            if (isMatch) {
              matched = true;
              const mergedFeature = {
                ...targetFeature,
                properties: {
                  ...targetFeature.properties,
                  ...joinFeature.properties
                }
              };
              resultFeatures.push(mergedFeature);
              
              if (joinType === 'inner') break;
            }
          } catch (error) {
            console.warn('[GeoJSONSpatialJoinOperation] Check failed:', error);
          }
        }

        if (joinType === 'left' && !matched) {
          resultFeatures.push(targetFeature);
        }
      }

      const result: GeoJSONFeatureCollection = {
        type: 'FeatureCollection',
        features: resultFeatures
      };

      const resultPath = await saveGeoJSON(result, 'spatial_join');

      return {
        id: generateId(),
        type: 'geojson',
        reference: resultPath,
        metadata: {
          ...extractMetadata(result, resultPath),
          operation: 'spatial_join',
          spatialRelationship: operation,
          joinType
        },
        createdAt: new Date()
      };
    } catch (error) {
      console.error('[GeoJSONSpatialJoinOperation] Failed:', error);
      throw error;
    }
  }
}
