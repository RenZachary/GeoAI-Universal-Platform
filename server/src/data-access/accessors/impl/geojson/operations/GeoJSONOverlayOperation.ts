/**
 * GeoJSON Overlay Operation
 */

import type { NativeData } from '../../../../../core';
import { generateId } from '../../../../../core';
import type { OverlayOptions } from '../../../../interfaces';
import type { GeoJSONFeatureCollection } from '../GeoJSONBasedAccessor';
import * as turf from '@turf/turf';

export class GeoJSONOverlayOperation {
  async execute(
    geojson1: GeoJSONFeatureCollection,
    geojson2: GeoJSONFeatureCollection,
    options: OverlayOptions,
    saveGeoJSON: (geojson: GeoJSONFeatureCollection, hint?: string) => Promise<string>,
    extractMetadata: (geojson: GeoJSONFeatureCollection, reference: string) => any
  ): Promise<NativeData> {
    try {
      const resultFeatures = [];

      for (const feature1 of geojson1.features) {
        for (const feature2 of geojson2.features) {
          try {
            let result: any = null;

            switch (options.operation) {
              case 'intersect':
                if ((turf as any).booleanIntersects(feature1, feature2)) {
                  result = (turf as any).intersect(feature1, feature2);
                }
                break;
              case 'union':
                result = (turf as any).union(feature1, feature2);
                break;
              case 'difference':
                result = (turf as any).difference(feature1, feature2);
                break;
              default:
                throw new Error(`Unsupported overlay operation: ${options.operation}`);
            }

            if (result) {
              resultFeatures.push(result);
            }
          } catch (error) {
            console.warn('[GeoJSONOverlayOperation] Feature overlay failed:', error);
          }
        }
      }

      const result: GeoJSONFeatureCollection = {
        type: 'FeatureCollection',
        features: resultFeatures
      };

      // Generate ID first, then use it for filename to ensure consistency
      const resultId = generateId();
      const resultPath = await saveGeoJSON(result, resultId);

      return {
        id: resultId,
        type: 'geojson',
        reference: resultPath,
        metadata: {
          ...extractMetadata(result, resultPath),
          operation: 'overlay',
          overlayType: options.operation
        },
        createdAt: new Date()
      };
    } catch (error) {
      console.error('[GeoJSONOverlayOperation] Failed:', error);
      throw error;
    }
  }
}
