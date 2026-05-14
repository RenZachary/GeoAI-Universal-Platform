/**
 * Geometry Utilities
 * Helper functions for geometric calculations and operations
 */

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param coord1 - First coordinate [longitude, latitude]
 * @param coord2 - Second coordinate [longitude, latitude]
 * @returns Distance in meters
 */
export function calculateDistance(coord1: [number, number], coord2: [number, number]): number {
  const R = 6371e3 // Earth's radius in meters
  const φ1 = coord1[1] * Math.PI / 180
  const φ2 = coord2[1] * Math.PI / 180
  const Δφ = (coord2[1] - coord1[1]) * Math.PI / 180
  const Δλ = (coord2[0] - coord1[0]) * Math.PI / 180

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c // Distance in meters
}

/**
 * Create circle geometry from center and radius
 * @param center - Center coordinate [longitude, latitude]
 * @param radiusMeters - Radius in meters
 * @param points - Number of vertices (default: 64)
 * @returns GeoJSON Polygon geometry
 */
export function createCircleGeometry(
  center: [number, number],
  radiusMeters: number,
  points: number = 64
): GeoJSON.Polygon {
  const earthRadius = 6378137 // WGS84 major axis in meters
  const lat = center[1] * Math.PI / 180
  const lon = center[0] * Math.PI / 180
  const radiusRad = radiusMeters / earthRadius

  const coordinates: [number, number][] = []

  for (let i = 0; i <= points; i++) {
    const bearing = (i / points) * 2 * Math.PI
    
    const lat2 = Math.asin(
      Math.sin(lat) * Math.cos(radiusRad) +
      Math.cos(lat) * Math.sin(radiusRad) * Math.cos(bearing)
    )
    
    const lon2 = lon + Math.atan2(
      Math.sin(bearing) * Math.sin(radiusRad) * Math.cos(lat),
      Math.cos(radiusRad) - Math.sin(lat) * Math.sin(lat2)
    )

    coordinates.push([lon2 * 180 / Math.PI, lat2 * 180 / Math.PI])
  }

  return {
    type: 'Polygon',
    coordinates: [coordinates]
  }
}

/**
 * Check if current coordinate is near first point (for closing polygon/line)
 * @param current - Current coordinate
 * @param first - First coordinate
 * @param map - MapLibre map instance
 * @param threshold - Pixel threshold (default: 15)
 * @returns True if coordinates are within threshold
 */
export function isNearFirstPoint(
  current: [number, number],
  first: [number, number],
  map: any,
  threshold: number = 15
): boolean {
  const currentPoint = map.project(current)
  const firstPoint = map.project(first)
  
  const distance = Math.sqrt(
    Math.pow(currentPoint.x - firstPoint.x, 2) +
    Math.pow(currentPoint.y - firstPoint.y, 2)
  )
  
  return distance < threshold
}

/**
 * Ensure polygon is closed (first and last coordinates match)
 * @param coordinates - Array of coordinates
 * @returns Closed coordinate array
 */
export function ensurePolygonClosed(coordinates: [number, number][]): [number, number][] {
  if (coordinates.length === 0) return coordinates
  
  const first = coordinates[0]
  const last = coordinates[coordinates.length - 1]
  
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return [...coordinates, first]
  }
  
  return coordinates
}

/**
 * Generate unique ID for drawing
 * @param prefix - ID prefix (default: 'drawing')
 * @returns Unique ID string
 */
export function generateDrawingId(prefix: string = 'drawing'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Create a debounced function that delays invoking func until after wait milliseconds have elapsed
 * @param func - Function to debounce
 * @param wait - Wait time in milliseconds (default: 16ms for ~60fps)
 * @returns Debounced function
 */
export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number = 16
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null

  return function executedFunction(...args: Parameters<T>): void {
    const later = () => {
      timeout = null
      func(...args)
    }

    if (timeout !== null) {
      clearTimeout(timeout)
    }

    timeout = setTimeout(later, wait)
  }
}
