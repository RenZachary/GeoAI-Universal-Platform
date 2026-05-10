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
    
    // First, try direct matching with lowercase and underscore handling
    const lowerType = type.trim().toLowerCase();
    
    // Handle common variations including PostGIS ST_ prefix
    const variations: Record<string, GeometryType> = {
      'point': 'Point',
      'st_point': 'Point',
      'multipoint': 'MultiPoint',
      'st_multipoint': 'MultiPoint',
      'linestring': 'LineString',
      'st_linestring': 'LineString',
      'multilinestring': 'MultiLineString',
      'st_multilinestring': 'MultiLineString',
      'polygon': 'Polygon',
      'st_polygon': 'Polygon',
      'multipolygon': 'MultiPolygon',
      'st_multipolygon': 'MultiPolygon',
      'geometrycollection': 'GeometryCollection',
      'st_geomcollection': 'GeometryCollection'
    };
    
    // Try direct match first (handles st_polygon, polygon, etc.)
    if (variations[lowerType]) {
      return variations[lowerType];
    }
    
    // Fallback: Normalize by removing underscores and spaces
    const normalized = lowerType.replace(/[_\s]/g, '');
    if (variations[normalized]) {
      return variations[normalized];
    }
    
    console.warn(`Unknown geometry type: "${type}". Defaulting to Polygon.`);
    return 'Polygon';
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
