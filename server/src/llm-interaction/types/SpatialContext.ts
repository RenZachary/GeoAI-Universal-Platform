/**
 * Spatial Context Types - Shared between frontend and backend
 */

export interface SpatialContext {
  viewportBbox?: [number, number, number, number]; // [minX, minY, maxX, maxY]
  selectedFeature?: SelectedFeature;
  drawnGeometries?: DrawnGeometry[];
}

export interface SelectedFeature extends GeoJSON.Feature {
  datasetId: string;
  featureId: string;
  geometry: GeoJSON.Geometry;
}

export interface DrawnGeometry extends GeoJSON.Feature {
  id: string;
  geometry: GeoJSON.Geometry;
}
