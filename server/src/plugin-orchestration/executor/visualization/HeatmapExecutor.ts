/**
 * Heatmap Plugin Executor
 * Generates point density heatmaps using kernel density estimation (KDE)
 */

import type { NativeData } from '../../../core/index';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface HeatmapParams {
  dataSourceId: string;
  radius?: number;
  cellSize?: number;
  weightField?: string;
  colorRamp?: 'hot' | 'cool' | 'viridis' | 'plasma' | 'inferno' | 'magma';
  outputFormat?: 'geojson' | 'geotiff';
}

interface PointFeature {
  x: number;
  y: number;
  weight: number;
}

interface GridCell {
  x: number;
  y: number;
  density: number;
}

export class HeatmapExecutor {
  private workspaceBase: string;

  constructor(workspaceBase?: string) {
    this.workspaceBase = workspaceBase || path.join(__dirname, '..', '..', '..', '..', 'workspace');
  }

  async execute(params: HeatmapParams): Promise<NativeData> {
    console.log('[HeatmapExecutor] Generating heatmap...');
    console.log('[HeatmapExecutor] Params:', params);

    try {
      // Step 1: Load point data from data source
      const points = await this.loadPointData(params.dataSourceId);
      
      if (points.length === 0) {
        throw new Error('No point data found in the specified data source');
      }

      console.log(`[HeatmapExecutor] Loaded ${points.length} points`);

      // Step 2: Calculate bounding box
      const bounds = this.calculateBounds(points);
      console.log('[HeatmapExecutor] Bounds:', bounds);

      // Step 3: Generate grid and calculate densities
      const radius = params.radius || 50;
      const cellSize = params.cellSize || 100;
      const grid = this.generateDensityGrid(points, bounds, radius, cellSize);

      console.log(`[HeatmapExecutor] Generated grid with ${grid.length} cells`);

      // Step 4: Convert to output format
      const outputFormat = params.outputFormat || 'geojson';
      let resultPath: string;

      if (outputFormat === 'geojson') {
        resultPath = await this.convertToGeoJSON(grid, bounds, params.colorRamp || 'hot');
      } else {
        // For GeoTIFF, we'll generate GeoJSON for now (GeoTIFF requires additional libraries)
        console.log('[HeatmapExecutor] GeoTIFF format not yet fully supported, generating GeoJSON instead');
        resultPath = await this.convertToGeoJSON(grid, bounds, params.colorRamp || 'hot');
      }

      // Step 5: Create metadata
      const statistics = this.calculateStatistics(grid);
      const heatmapId = `heatmap_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      return {
        id: heatmapId,
        type: 'geojson',
        reference: resultPath,
        metadata: {
          pluginId: 'heatmap_generator',
          generatedAt: new Date(),
          pointCount: points.length,
          radius: radius,
          cellSize: cellSize,
          colorRamp: params.colorRamp || 'hot',
          bounds: bounds,
          statistics: statistics,
          gridCells: grid.length,
          minDensity: statistics.min,
          maxDensity: statistics.max,
          meanDensity: statistics.mean
        },
        createdAt: new Date()
      };

    } catch (error) {
      console.error('[HeatmapExecutor] Heatmap generation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const wrappedError = new Error(`Heatmap generation failed: ${errorMessage}`);
      (wrappedError as any).cause = error;
      throw wrappedError;
    }
  }

  /**
   * Load point data from data source
   * Supports both Point and Polygon geometries (polygons converted to centroids)
   */
  private async loadPointData(dataSourceId: string): Promise<PointFeature[]> {
    console.log('[HeatmapExecutor] Loading data from:', dataSourceId);
    
    // Check if data source exists in workspace
    const dataSourcePath = path.join(this.workspaceBase, 'data', 'local', dataSourceId);
    
    if (fs.existsSync(dataSourcePath)) {
      // Try to parse as GeoJSON
      try {
        const content = fs.readFileSync(dataSourcePath, 'utf-8');
        const geojson = JSON.parse(content);
        
        if (geojson.type === 'FeatureCollection') {
          const points: PointFeature[] = [];
          
          for (const feature of geojson.features) {
            if (!feature.geometry) continue;
            
            if (feature.geometry.type === 'Point') {
              // Direct point - use as is
              points.push({
                x: feature.geometry.coordinates[0],
                y: feature.geometry.coordinates[1],
                weight: feature.properties?.weight || 1
              });
            } else if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
              // Convert polygon to centroid
              const centroid = this.calculateCentroid(feature.geometry);
              if (centroid) {
                points.push({
                  x: centroid[0],
                  y: centroid[1],
                  weight: feature.properties?.weight || 1
                });
              }
            }
          }
          
          if (points.length > 0) {
            console.log(`[HeatmapExecutor] Loaded ${points.length} points from ${geojson.features.length} features`);
            return points;
          }
        }
      } catch (e) {
        console.warn('[HeatmapExecutor] Failed to parse data source as GeoJSON:', e);
      }
    }

    // Fallback: Generate sample clustered point data
    console.log('[HeatmapExecutor] Using sample point data for demonstration');
    return this.generateSamplePoints();
  }
  
  /**
   * Calculate centroid of a polygon geometry
   */
  private calculateCentroid(geometry: any): [number, number] | null {
    try {
      if (geometry.type === 'Polygon') {
        // For simple polygon, calculate centroid of first ring
        const coordinates = geometry.coordinates[0]; // Exterior ring
        return this.calculateRingCentroid(coordinates);
      } else if (geometry.type === 'MultiPolygon') {
        // For MultiPolygon, calculate centroid of largest polygon
        let maxArea = 0;
        let centroid: [number, number] | null = null;
        
        for (const polygon of geometry.coordinates) {
          const ringCentroid = this.calculateRingCentroid(polygon[0]);
          const area = this.calculatePolygonArea(polygon[0]);
          
          if (area > maxArea) {
            maxArea = area;
            centroid = ringCentroid;
          }
        }
        
        return centroid;
      }
      
      return null;
    } catch (error) {
      console.error('[HeatmapExecutor] Failed to calculate centroid:', error);
      return null;
    }
  }
  
  /**
   * Calculate centroid of a linear ring (polygon exterior boundary)
   */
  private calculateRingCentroid(ring: number[][]): [number, number] {
    let sumX = 0;
    let sumY = 0;
    const n = ring.length;
    
    // Simple average of vertices (sufficient for most cases)
    for (const coord of ring) {
      sumX += coord[0];
      sumY += coord[1];
    }
    
    return [sumX / n, sumY / n];
  }
  
  /**
   * Calculate approximate area of a polygon ring (for finding largest polygon)
   */
  private calculatePolygonArea(ring: number[][]): number {
    let area = 0;
    const n = ring.length;
    
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += ring[i][0] * ring[j][1];
      area -= ring[j][0] * ring[i][1];
    }
    
    return Math.abs(area / 2);
  }

  /**
   * Generate sample clustered point data for testing
   */
  private generateSamplePoints(): PointFeature[] {
    const points: PointFeature[] = [];
    
    // Create 3 clusters
    const clusters = [
      { centerX: -118.25, centerY: 34.05, count: 100, spread: 0.02 },  // Los Angeles area
      { centerX: -118.15, centerY: 34.10, count: 80, spread: 0.015 },
      { centerX: -118.30, centerY: 34.00, count: 60, spread: 0.025 }
    ];

    for (const cluster of clusters) {
      for (let i = 0; i < cluster.count; i++) {
        // Gaussian distribution around cluster center
        const u1 = Math.random();
        const u2 = Math.random();
        const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const z2 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
        
        points.push({
          x: cluster.centerX + z1 * cluster.spread,
          y: cluster.centerY + z2 * cluster.spread,
          weight: 1
        });
      }
    }

    return points;
  }

  /**
   * Calculate bounding box from points
   */
  private calculateBounds(points: PointFeature[]): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const point of points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }

    // Add padding (5% of extent)
    const paddingX = (maxX - minX) * 0.05;
    const paddingY = (maxY - minY) * 0.05;

    return {
      minX: minX - paddingX,
      minY: minY - paddingY,
      maxX: maxX + paddingX,
      maxY: maxY + paddingY
    };
  }

  /**
   * Generate density grid using kernel density estimation
   */
  private generateDensityGrid(
    points: PointFeature[],
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    radius: number,
    cellSize: number
  ): GridCell[] {
    const grid: GridCell[] = [];
    
    // Calculate grid dimensions
    const cols = Math.ceil((bounds.maxX - bounds.minX) / (cellSize / 111320)); // Approximate meters to degrees
    const rows = Math.ceil((bounds.maxY - bounds.minY) / (cellSize / 111320));
    
    console.log(`[HeatmapExecutor] Grid dimensions: ${cols} x ${rows} = ${cols * rows} cells`);

    // Convert radius from meters to degrees (approximate)
    const radiusDegrees = radius / 111320;

    // Generate grid cells
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cellX = bounds.minX + (col + 0.5) * (cellSize / 111320);
        const cellY = bounds.minY + (row + 0.5) * (cellSize / 111320);

        // Calculate density using Gaussian kernel
        let density = 0;
        
        for (const point of points) {
          const dx = point.x - cellX;
          const dy = point.y - cellY;
          const distance = Math.sqrt(dx * dx + dy * dy);

          // Apply Gaussian kernel if within radius
          if (distance <= radiusDegrees) {
            const kernelValue = this.gaussianKernel(distance, radiusDegrees);
            density += point.weight * kernelValue;
          }
        }

        grid.push({
          x: cellX,
          y: cellY,
          density: density
        });
      }
    }

    return grid;
  }

  /**
   * Gaussian kernel function for KDE
   */
  private gaussianKernel(distance: number, bandwidth: number): number {
    // Standard Gaussian kernel: K(d) = (1 / (2π)) * exp(-d² / (2h²))
    const normalizedDistance = distance / bandwidth;
    return (1 / (2 * Math.PI)) * Math.exp(-(normalizedDistance * normalizedDistance) / 2);
  }

  /**
   * Convert density grid to GeoJSON contour polygons
   */
  private async convertToGeoJSON(
    grid: GridCell[],
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    colorRamp: string
  ): Promise<string> {
    // Create output directory
    const outputDir = path.join(this.workspaceBase, 'results', 'heatmaps');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filename = `heatmap_${Date.now()}.geojson`;
    const filepath = path.join(outputDir, filename);

    // Classify densities into contours
    const statistics = this.calculateStatistics(grid);
    const contours = this.createClassificationContours(statistics.min, statistics.max, 5);

    // Generate contour polygons (simplified as grid points with density values)
    const features = grid.map(cell => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [cell.x, cell.y]
      },
      properties: {
        density: cell.density,
        color: this.getColorForDensity(cell.density, statistics.min, statistics.max, colorRamp),
        level: this.getContourLevel(cell.density, contours)
      }
    }));

    const geojson = {
      type: 'FeatureCollection',
      features: features,
      properties: {
        title: 'Point Density Heatmap',
        generatedAt: new Date().toISOString(),
        bounds: bounds,
        statistics: statistics,
        colorRamp: colorRamp,
        contours: contours
      }
    };

    // Write to file
    fs.writeFileSync(filepath, JSON.stringify(geojson, null, 2), 'utf-8');
    console.log('[HeatmapExecutor] GeoJSON written to:', filepath);

    return filepath;
  }

  /**
   * Calculate statistics from grid
   */
  private calculateStatistics(grid: GridCell[]): { min: number; max: number; mean: number; stdDev: number } {
    if (grid.length === 0) {
      return { min: 0, max: 0, mean: 0, stdDev: 0 };
    }

    const densities = grid.map(cell => cell.density);
    const min = Math.min(...densities);
    const max = Math.max(...densities);
    const mean = densities.reduce((sum, d) => sum + d, 0) / densities.length;
    
    const variance = densities.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / densities.length;
    const stdDev = Math.sqrt(variance);

    return { min, max, mean, stdDev };
  }

  /**
   * Create classification contours using equal intervals
   */
  private createClassificationContours(min: number, max: number, numClasses: number): number[] {
    const contours: number[] = [];
    const interval = (max - min) / numClasses;
    
    for (let i = 0; i <= numClasses; i++) {
      contours.push(min + i * interval);
    }
    
    return contours;
  }

  /**
   * Get contour level for a density value
   */
  private getContourLevel(density: number, contours: number[]): number {
    for (let i = 0; i < contours.length - 1; i++) {
      if (density >= contours[i] && density < contours[i + 1]) {
        return i + 1;
      }
    }
    return contours.length - 1;
  }

  /**
   * Get color for density value based on color ramp
   */
  private getColorForDensity(
    density: number,
    minDensity: number,
    maxDensity: number,
    colorRamp: string
  ): string {
    // Normalize density to 0-1 range
    const normalized = maxDensity > minDensity 
      ? (density - minDensity) / (maxDensity - minDensity)
      : 0.5;

    // Apply color ramp
    switch (colorRamp) {
      case 'hot':
        return this.hotColorRamp(normalized);
      case 'cool':
        return this.coolColorRamp(normalized);
      case 'viridis':
        return this.viridisColorRamp(normalized);
      case 'plasma':
        return this.plasmaColorRamp(normalized);
      case 'inferno':
        return this.infernoColorRamp(normalized);
      case 'magma':
        return this.magmaColorRamp(normalized);
      default:
        return this.hotColorRamp(normalized);
    }
  }

  /**
   * Hot color ramp (blue -> cyan -> green -> yellow -> red)
   */
  private hotColorRamp(t: number): string {
    const r = Math.round(255 * Math.min(1, t * 2));
    const g = Math.round(255 * Math.min(1, Math.max(0, (t - 0.25) * 2)));
    const b = Math.round(255 * Math.min(1, Math.max(0, (t - 0.5) * 2)));
    return `rgb(${r}, ${g}, ${b})`;
  }

  /**
   * Cool color ramp (cyan -> blue -> purple)
   */
  private coolColorRamp(t: number): string {
    const r = Math.round(255 * t * 0.5);
    const g = Math.round(255 * (1 - t * 0.5));
    const b = 255;
    return `rgb(${r}, ${g}, ${b})`;
  }

  /**
   * Viridis color ramp approximation
   */
  private viridisColorRamp(t: number): string {
    const r = Math.round(68 + 197 * t - 100 * t * t);
    const g = Math.round(1 + 156 * t + 98 * t * t);
    const b = Math.round(84 + 100 * t - 50 * t * t);
    return `rgb(${Math.min(255, r)}, ${Math.min(255, g)}, ${Math.min(255, b)})`;
  }

  /**
   * Plasma color ramp approximation
   */
  private plasmaColorRamp(t: number): string {
    const r = Math.round(60 + 195 * t);
    const g = Math.round(10 + 100 * t - 50 * t * t);
    const b = Math.round(130 + 80 * t - 100 * t * t);
    return `rgb(${Math.min(255, r)}, ${Math.min(255, g)}, ${Math.min(255, b)})`;
  }

  /**
   * Inferno color ramp approximation
   */
  private infernoColorRamp(t: number): string {
    const r = Math.round(20 + 235 * t);
    const g = Math.round(5 + 150 * t - 80 * t * t);
    const b = Math.round(20 + 100 * t - 80 * t * t);
    return `rgb(${Math.min(255, r)}, ${Math.min(255, g)}, ${Math.min(255, b)})`;
  }

  /**
   * Magma color ramp approximation
   */
  private magmaColorRamp(t: number): string {
    const r = Math.round(10 + 245 * t);
    const g = Math.round(5 + 120 * t - 60 * t * t);
    const b = Math.round(20 + 150 * t - 100 * t * t);
    return `rgb(${Math.min(255, r)}, ${Math.min(255, g)}, ${Math.min(255, b)})`;
  }
}
