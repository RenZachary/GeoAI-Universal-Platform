/**
 * ProximityOperation - Calculate distances and find nearest features using Turf.js
 * 
 * Supports:
 * - Pairwise distance calculation
 * - K-nearest neighbor search
 * - Distance-based filtering
 */

import * as turf from '@turf/turf';
import type { PlatformFeatureCollection } from '../../../../core';
import type { DistanceResult, NearestNeighborResult } from '../../DataBackend';

export class ProximityOperation {
  /**
   * Calculate pairwise distances between two feature collections
   */
  async calculateDistance(
    geojson1: PlatformFeatureCollection,
    geojson2: PlatformFeatureCollection,
    options?: {
      unit?: 'meters' | 'kilometers' | 'feet' | 'miles' | 'degrees';
      maxPairs?: number;
    }
  ): Promise<DistanceResult[]> {
    const unit = options?.unit || 'meters';
    const maxPairs = options?.maxPairs || 10000; // Safety limit
    
    const results: DistanceResult[] = [];
    let pairCount = 0;
    
    // Calculate pairwise distances
    for (const feature1 of geojson1.features) {
      if (pairCount >= maxPairs) {
        console.warn(`[ProximityOperation] Distance calculation limited to ${maxPairs} pairs`);
        break;
      }
      
      for (const feature2 of geojson2.features) {
        if (pairCount >= maxPairs) break;
        
        try {
          const distance = (turf as any).distance(
            feature1.geometry,
            feature2.geometry,
            { units: this.mapUnitToTurf(unit) }
          );
          
          results.push({
            sourceId: this.extractId(feature1, results.length),
            targetId: this.extractId(feature2, results.length),
            distance: Number(distance.toFixed(6)),
            unit
          });
          
          pairCount++;
        } catch (error) {
          console.warn('[ProximityOperation] Failed to calculate distance:', error);
        }
      }
    }
    
    return results;
  }
  
  /**
   * Find k-nearest neighbors for each source feature
   */
  async findNearestNeighbors(
    sourceGeoJSON: PlatformFeatureCollection,
    targetGeoJSON: PlatformFeatureCollection,
    limit: number,
    options?: {
      unit?: 'meters' | 'kilometers' | 'feet' | 'miles' | 'degrees';
    }
  ): Promise<NearestNeighborResult[]> {
    const unit = options?.unit || 'meters';
    
    const results: NearestNeighborResult[] = [];
    
    // For each source feature, find k nearest targets
    for (let i = 0; i < sourceGeoJSON.features.length; i++) {
      const sourceFeature = sourceGeoJSON.features[i];
      const distances: Array<{ targetId: string | number; distance: number }> = [];
      
      // Calculate distance to all target features
      for (const targetFeature of targetGeoJSON.features) {
        try {
          const distance = (turf as any).distance(
            sourceFeature.geometry,
            targetFeature.geometry,
            { units: this.mapUnitToTurf(unit) }
          );
          
          distances.push({
            targetId: this.extractId(targetFeature, distances.length),
            distance: Number(distance.toFixed(6))
          });
        } catch (error) {
          console.warn('[ProximityOperation] Failed to calculate distance:', error);
        }
      }
      
      // Sort by distance and take top k
      distances.sort((a, b) => a.distance - b.distance);
      const nearest = distances.slice(0, limit);
      
      // Add to results with rank
      nearest.forEach((item, rank) => {
        results.push({
          sourceId: this.extractId(sourceFeature, i),
          nearestTargetId: item.targetId,
          distance: item.distance,
          unit,
          rank: rank + 1
        });
      });
    }
    
    return results;
  }
  
  /**
   * Filter features within a distance threshold from center geometry
   */
  filterByDistance(
    geojson: PlatformFeatureCollection,
    centerFeature: any, // GeoJSON Feature
    distance: number,
    options?: {
      unit?: 'meters' | 'kilometers' | 'feet' | 'miles' | 'degrees';
    }
  ): PlatformFeatureCollection {
    const unit = options?.unit || 'meters';
    
    // Create a buffer around the center
    const bufferRadius = this.convertToDegrees(distance, unit);
    const buffered = turf.buffer(centerFeature, bufferRadius, { units: 'degrees' });
    
    // Filter features that intersect with the buffer
    const filteredFeatures = geojson.features.filter(feature => {
      try {
        return (turf as any).booleanIntersects(feature, buffered);
      } catch (error) {
        console.warn('[ProximityOperation] Intersection check failed:', error);
        return false;
      }
    });
    
    return {
      type: 'FeatureCollection',
      features: filteredFeatures
    };
  }
  
  /**
   * Extract ID from feature properties or use index
   */
  private extractId(feature: any, fallbackIndex: number): string | number {
    return feature.properties?.id ?? 
           feature.properties?.ID ?? 
           feature.properties?.fid ??
           fallbackIndex;
  }
  
  /**
   * Convert distance unit to Turf.js compatible unit
   */
  private mapUnitToTurf(unit: string): string {
    const mapping: Record<string, string> = {
      'meters': 'meters',
      'kilometers': 'kilometers',
      'feet': 'feet',
      'miles': 'miles',
      'degrees': 'degrees'
    };
    return mapping[unit] || 'meters';
  }
  
  /**
   * Convert distance to degrees for buffering (approximate)
   * Note: This is a rough approximation, accurate only near equator
   */
  private convertToDegrees(distance: number, unit: string): number {
    let meters: number;
    
    switch (unit) {
      case 'meters':
        meters = distance;
        break;
      case 'kilometers':
        meters = distance * 1000;
        break;
      case 'feet':
        meters = distance * 0.3048;
        break;
      case 'miles':
        meters = distance * 1609.34;
        break;
      case 'degrees':
        return distance;
      default:
        meters = distance;
    }
    
    // Approximate: 1 degree ≈ 111,320 meters at equator
    return meters / 111320;
  }
}
