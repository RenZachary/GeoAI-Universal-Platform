/**
 * SpatialJoinOperation - Join features based on spatial relationships
 */

import * as turf from '@turf/turf';

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: any[];
}

export class SpatialJoinOperation {
  async execute(
    targetGeoJSON: GeoJSONFeatureCollection,
    joinGeoJSON: GeoJSONFeatureCollection,
    operation: string,
    joinType: string = 'inner'
  ): Promise<GeoJSONFeatureCollection> {
    const joinedFeatures: any[] = [];
    
    for (const targetFeature of targetGeoJSON.features) {
      let matched = false;
      
      for (const joinFeature of joinGeoJSON.features) {
        let isMatch = false;
        
        switch (operation.toLowerCase()) {
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
        }
        
        if (isMatch) {
          matched = true;
          const joinedFeature = {
            ...targetFeature,
            properties: {
              ...targetFeature.properties,
              ...joinFeature.properties
            }
          };
          joinedFeatures.push(joinedFeature);
          
          if (joinType === 'inner') {
            break;
          }
        }
      }
      
      if (!matched && joinType === 'left') {
        joinedFeatures.push(targetFeature);
      }
    }
    
    return {
      type: 'FeatureCollection',
      features: joinedFeatures
    };
  }
}
