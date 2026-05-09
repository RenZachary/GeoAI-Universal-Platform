/**
 * AggregateOperation - Statistical aggregation (MAX, MIN, AVG, SUM, COUNT)
 */

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: any[];
}

export class AggregateOperation {
  async execute(
    geojson: GeoJSONFeatureCollection,
    aggFunc: string,
    field: string,
    returnFeature?: boolean
  ): Promise<GeoJSONFeatureCollection> {
    const values: number[] = [];
    let targetFeature: any = null;
    
    for (const feature of geojson.features) {
      const value = feature.properties?.[field];
      if (value !== undefined && value !== null && typeof value === 'number') {
        values.push(value);
        
        if (returnFeature && (aggFunc === 'MAX' || aggFunc === 'MIN')) {
          if (aggFunc === 'MAX' && (!targetFeature || value > (targetFeature.properties?.[field] || 0))) {
            targetFeature = feature;
          }
          if (aggFunc === 'MIN' && (!targetFeature || value < (targetFeature.properties?.[field] || Infinity))) {
            targetFeature = feature;
          }
        }
      }
    }
    
    if (returnFeature && targetFeature) {
      return {
        type: 'FeatureCollection',
        features: [targetFeature]
      };
    }
    
    // Return empty collection with metadata in properties
    return {
      type: 'FeatureCollection',
      features: []
    };
  }
}
