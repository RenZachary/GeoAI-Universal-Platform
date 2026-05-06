/**
 * GeoJSON Filter Operation - Attribute and Spatial Filtering
 */

import type { NativeData } from '../../../../../core';
import { generateId } from '../../../../../core';
import type { FilterCondition, AttributeFilter } from '../../../../interfaces';
import type { GeoJSONFeatureCollection } from '../GeoJSONBasedAccessor';

export class GeoJSONFilterOperation {
  async execute(
    geojson: GeoJSONFeatureCollection,
    filter: FilterCondition,
    saveGeoJSON: (geojson: GeoJSONFeatureCollection, hint?: string) => Promise<string>,
    extractMetadata: (geojson: GeoJSONFeatureCollection, reference: string) => any
  ): Promise<NativeData> {
    try {
      const filteredFeatures = geojson.features.filter(feature => {
        return this.evaluateCondition(feature.properties, filter);
      });

      const result: GeoJSONFeatureCollection = {
        type: 'FeatureCollection',
        features: filteredFeatures,
        crs: geojson.crs
      };

      // Generate ID first, then use it for filename to ensure consistency
      const resultId = generateId();
      const resultPath = await saveGeoJSON(result, resultId);

      return {
        id: resultId,
        type: 'geojson',
        reference: resultPath,
        metadata: extractMetadata(result, resultPath),
        createdAt: new Date()
      };
    } catch (error) {
      console.error('[GeoJSONFilterOperation] Failed:', error);
      throw error;
    }
  }

  private evaluateCondition(properties: any, condition: FilterCondition): boolean {
    // Handle empty or invalid conditions - return true (include all features)
    if (!condition || Object.keys(condition).length === 0) {
      return true;
    }

    if ('conditions' in condition && condition.conditions && condition.conditions.length > 0) {
      const results = condition.conditions.map((cond: FilterCondition) => 
        this.evaluateCondition(properties, cond)
      );

      const connector = condition.connector || 'AND';
      return connector === 'AND' 
        ? results.every((r: boolean) => r)
        : results.some((r: boolean) => r);
    }

    // Spatial filters not supported for pure GeoJSON without reference data
    if ('type' in condition && condition.type === 'spatial') {
      console.warn('[GeoJSONFilterOperation] Spatial filter requires reference dataset - skipping');
      return true;
    }

    // Check if this is a valid attribute filter
    const attrCond = condition as AttributeFilter;
    if (!attrCond.field || !attrCond.operator) {
      console.warn('[GeoJSONFilterOperation] Invalid attribute filter - missing field or operator, including all features');
      return true;
    }

    return this.evaluateAttributeCondition(properties, attrCond);
  }

  private evaluateAttributeCondition(properties: any, cond: AttributeFilter): boolean {
    const fieldValue = properties?.[cond.field];

    switch (cond.operator) {
      case 'equals':
        return fieldValue === cond.value;
      case 'not_equals':
        return fieldValue !== cond.value;
      case 'contains':
        return String(fieldValue || '').includes(cond.value);
      case 'starts_with':
        return String(fieldValue || '').startsWith(cond.value);
      case 'ends_with':
        return String(fieldValue || '').endsWith(cond.value);
      case 'greater_than':
        return Number(fieldValue) > Number(cond.value);
      case 'less_than':
        return Number(fieldValue) < Number(cond.value);
      case 'greater_equal':
        return Number(fieldValue) >= Number(cond.value);
      case 'less_equal':
        return Number(fieldValue) <= Number(cond.value);
      case 'in':
        return Array.isArray(cond.value) && cond.value.includes(fieldValue);
      case 'between':
        return Number(fieldValue) >= Number(cond.value[0]) &&
               Number(fieldValue) <= Number(cond.value[1]);
      case 'is_null':
        return fieldValue === null || fieldValue === undefined;
      case 'is_not_null':
        return fieldValue !== null && fieldValue !== undefined;
      default:
        console.warn(`[GeoJSONFilterOperation] Unsupported operator: ${cond.operator}, including all features`);
        return true;
    }
  }
}
