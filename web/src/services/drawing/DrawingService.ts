/**
 * Drawing Service Interface
 * Defines the contract for all drawing service implementations
 */

export interface DrawingService {
  /**
   * Start drawing mode on the map
   * @param map - MapLibre map instance
   */
  startDrawing(map: any): void;

  /**
   * Stop current drawing operation
   */
  stopDrawing(): void;

  /**
   * Cleanup resources and event listeners
   */
  cleanup(): void;

  /**
   * Get current drawing mode
   */
  getMode(): 'polygon' | 'circle' | 'line' | 'rectangle' | null;

  /**
   * Set completion callback
   * @param callback - Function to call when drawing is complete
   */
  setCompletionCallback(callback: (result: DrawingResult) => void): void;
}

export interface DrawingResult {
  geometry: GeoJSON.Geometry;
  type: 'polygon' | 'circle' | 'line' | 'rectangle';
  properties?: Record<string, any>;
}

export interface DrawingEventHandler {
  (event: any): void;
}
