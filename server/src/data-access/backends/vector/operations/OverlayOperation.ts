/**
 * OverlayOperation - Turf.js overlay operations
 */

import * as turf from '@turf/turf';
import type { PlatformFeatureCollection } from '../../../../core';

type OverlayType = 'intersect' | 'union' | 'difference' | 'symmetric_difference';

export class OverlayOperation {
  async execute(
    geojson1: PlatformFeatureCollection,
    geojson2: PlatformFeatureCollection,
    operation: OverlayType
  ): Promise<PlatformFeatureCollection> {
    const resultFeatures: any[] = [];
    
    for (const feature1 of geojson1.features) {
      for (const feature2 of geojson2.features) {
        try {
          let result: any = null;
          
          switch (operation) {
            case 'intersect':
                console.log('[OverlayOperation] Intersecting features...');
                console.log('[OverlayOperation] Feature 1:', feature1);
                console.log('[OverlayOperation] Feature 2:', feature2);
              if ((turf).booleanIntersects(feature1, feature2)) {
                result = (turf as any).intersect(feature1, feature2);
              }
              break;
            case 'union':
              result = (turf as any).union(feature1, feature2);
              break;
            case 'difference':
              result = (turf as any).difference(feature1, feature2);
              break;
            case 'symmetric_difference': {
              const diff1 = (turf as any).difference(feature1, feature2);
              const diff2 = (turf as any).difference(feature2, feature1);
              if (diff1 && diff2) {
                result = (turf as any).union(diff1, diff2);
              } else {
                result = diff1 || diff2;
              }
              break;
            }
          }
          
          if (result) {
            resultFeatures.push(result);
          }
        } catch (error) {
          console.warn(`[OverlayOperation] ${operation} failed:`, error);
        }
      }
    }
    
    return {
      type: 'FeatureCollection',
      features: resultFeatures
    };
  }
}
