/**
 * Geometry Adapter (Frontend Version)
 * Maps geometry types from service metadata to Mapbox layer types
 */

export type GeometryType = 
  | 'Point'
  | 'MultiPoint'
  | 'LineString'
  | 'MultiLineString'
  | 'Polygon'
  | 'MultiPolygon'
  | 'GeometryCollection';

export type MapboxLayerType = 'circle' | 'line' | 'fill';

/**
 * Mapping from geometry types to Mapbox GL JS layer types
 */
const GEOMETRY_TO_MAPBOX_LAYER: Record<string, MapboxLayerType> = {
  'Point': 'circle',
  'MultiPoint': 'circle',
  'LineString': 'line',
  'MultiLineString': 'line',
  'Polygon': 'fill',
  'MultiPolygon': 'fill',
  'GeometryCollection': 'fill' // Default to fill for collections
};

export class GeometryAdapter {
  /**
   * Map geometry type to appropriate Mapbox GL JS layer type
   * @param geometryType - The geometry type
   * @returns Mapbox layer type ('circle', 'line', or 'fill')
   */
  static getMapboxLayerType(geometryType: GeometryType): MapboxLayerType {
    return GEOMETRY_TO_MAPBOX_LAYER[geometryType] || 'fill';
  }
  
  /**
   * Normalize geometry type string to standard format
   * Handles variations like 'polygon', 'POLYGON', 'Multi_Polygon', etc.
   * @param type - Raw geometry type string
   * @returns Normalized geometry type
   */
  static normalizeGeometryType(type: string): GeometryType {
    if (!type || typeof type !== 'string') {
      throw new Error('Geometry type must be a non-empty string');
    }
    
    // Normalize to title case and remove underscores/spaces
    const normalized = type.trim()
      .toLowerCase()
      .replace(/[_\s]/g, '')
      .replace(/^./, c => c.toUpperCase())
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
    
    // Handle common variations
    const variations: Record<string, GeometryType> = {
      'point': 'Point',
      'multipoint': 'MultiPoint',
      'linestring': 'LineString',
      'multilinestring': 'MultiLineString',
      'polygon': 'Polygon',
      'multipolygon': 'MultiPolygon',
      'geometrycollection': 'GeometryCollection',
      'geomcollection': 'GeometryCollection'
    };
    
    const result = variations[normalized.toLowerCase()];
    
    if (!result) {
      console.warn(`Unknown geometry type: "${type}". Defaulting to Polygon.`);
      return 'Polygon';
    }
    
    return result;
  }
  
  /**
   * Check if a geometry type is valid
   */
  static isValidGeometryType(type: string): boolean {
    try {
      const normalized = this.normalizeGeometryType(type);
      return normalized in GEOMETRY_TO_MAPBOX_LAYER;
    } catch {
      return false;
    }
  }
  
  /**
   * Get all supported geometry types
   */
  static getSupportedGeometryTypes(): GeometryType[] {
    return Object.keys(GEOMETRY_TO_MAPBOX_LAYER) as GeometryType[];
  }
}
