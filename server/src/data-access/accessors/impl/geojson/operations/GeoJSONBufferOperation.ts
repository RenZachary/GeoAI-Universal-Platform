/**
 * GeoJSON Buffer Operation
 */

import type { NativeData } from '../../../../../core';
import { generateId } from '../../../../../core';
import type { BufferOptions } from '../../../../interfaces';
import type { GeoJSONFeatureCollection } from '../GeoJSONBasedAccessor';
import * as turf from '@turf/turf';

export class GeoJSONBufferOperation {
  async execute(
    geojson: GeoJSONFeatureCollection,
    distance: number,
    options: BufferOptions | undefined,
    saveGeoJSON: (geojson: GeoJSONFeatureCollection, hint?: string) => Promise<string>,
    extractMetadata: (geojson: GeoJSONFeatureCollection, reference: string) => any
  ): Promise<NativeData> {
    try {
      const bufferedFeatures = [];
      
      for (const feature of geojson.features) {
        try {
          const buffered = turf.buffer(feature, distance, { 
            units: (options?.unit as any) || 'meters' 
          });
          
          if (buffered) {
            bufferedFeatures.push(buffered);
          }
        } catch (error) {
          console.warn('[GeoJSONBufferOperation] Failed to buffer feature:', error);
        }
      }

      let result: GeoJSONFeatureCollection = {
        type: 'FeatureCollection',
        features: bufferedFeatures
      };

      // Apply dissolve if requested
      if (options?.dissolve && bufferedFeatures.length > 0) {
        const dissolved = (turf as any).dissolve(result);
        result = {
          type: 'FeatureCollection',
          features: dissolved.features
        };
      }

      const resultPath = await saveGeoJSON(result, 'buffer');

      return {
        id: generateId(),
        type: 'geojson',
        reference: resultPath,
        metadata: extractMetadata(result, resultPath),
        createdAt: new Date()
      };
    } catch (error) {
      console.error('[GeoJSONBufferOperation] Failed:', error);
      throw error;
    }
  }
}
