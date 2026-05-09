/**
 * FilterOperation - Attribute and spatial filtering
 */

import * as turf from '@turf/turf';
import type { FilterCondition } from '../../../interfaces';

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: any[];
}

export class FilterOperation {
  async execute(
    geojson: GeoJSONFeatureCollection,
    filterCondition: FilterCondition
  ): Promise<GeoJSONFeatureCollection> {
    const filteredFeatures = geojson.features.filter(feature => {
      return this.evaluateFilter(feature, filterCondition);
    });
    
    return {
      type: 'FeatureCollection',
      features: filteredFeatures
    };
  }
  
  private evaluateFilter(feature: any, condition: FilterCondition): boolean {
    if ('field' in condition) {
      // Attribute filter
      const fieldValue = feature.properties?.[condition.field];
      
      switch (condition.operator) {
        case 'equals':
          return fieldValue === condition.value;
        case 'not_equals':
          return fieldValue !== condition.value;
        case 'greater_than':
          return fieldValue > condition.value;
        case 'less_than':
          return fieldValue < condition.value;
        case 'contains':
          return String(fieldValue).includes(String(condition.value));
        default:
          console.warn(`[FilterOperation] Unsupported operator: ${condition.operator}`);
          return false;
      }
    } else if (condition.type === 'spatial') {
      // Spatial filter
      if (!condition.geometry) {
        return false;
      }
      
      switch (condition.operation) {
        case 'intersects':
          return (turf as any).booleanIntersects(feature, { type: 'Feature', geometry: condition.geometry });
        case 'within':
          return (turf as any).booleanWithin(feature, { type: 'Feature', geometry: condition.geometry });
        case 'contains':
          return (turf as any).booleanContains({ type: 'Feature', geometry: condition.geometry }, feature);
        default:
          console.warn(`[FilterOperation] Unsupported spatial operation: ${condition.operation}`);
          return false;
      }
    }
    
    return false;
  }
}
