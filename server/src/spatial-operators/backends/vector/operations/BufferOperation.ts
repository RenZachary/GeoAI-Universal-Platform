/**
 * BufferOperation - Turf.js buffer implementation
 */

import * as turf from '@turf/turf';
import type { BufferOptions } from '../../../../../../data-access';

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: any[];
}

export class BufferOperation {
  async execute(
    geojson: GeoJSONFeatureCollection,
    distance: number,
    options?: BufferOptions
  ): Promise<GeoJSONFeatureCollection> {
    const unit = options?.unit || 'meters';
    const dissolve = options?.dissolve || false;
    
    const bufferedFeatures: any[] = [];
    
    for (const feature of geojson.features) {
      try {
        const buffered = turf.buffer(feature, distance, { units: this.convertUnit(unit) });
        if (buffered) {
          bufferedFeatures.push(buffered);
        }
      } catch (error) {
        console.warn(`[BufferOperation] Buffer failed for feature:`, error);
      }
    }
    
    let result: GeoJSONFeatureCollection = {
      type: 'FeatureCollection',
      features: bufferedFeatures
    };
    
    if (dissolve && bufferedFeatures.length > 0) {
      try {
        const dissolved = (turf as any).dissolve(result);
        if (dissolved) {
          result = dissolved;
        }
      } catch (error) {
        console.warn('[BufferOperation] Dissolve failed:', error);
      }
    }
    
    return result;
  }
  
  private convertUnit(unit: string): string {
    const unitMap: Record<string, string> = {
      'meters': 'kilometers',
      'kilometers': 'kilometers',
      'feet': 'miles',
      'miles': 'miles',
      'degrees': 'degrees'
    };
    
    return unitMap[unit] || 'kilometers';
  }
}
