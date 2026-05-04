/**
 * File Upload Service - Business Logic for File Upload and Registration
 * 
 * Responsibilities:
 * - File format detection and validation
 * - Metadata extraction from uploaded files
 * - Data source registration
 * - File cleanup on validation failure
 */

import type Database from 'better-sqlite3';
import type { DataSourceRepository } from '../data-access/repositories';
import { DataAccessorFactory } from '../data-access/factories/DataAccessorFactory.js';
import { v4 as uuidv4 } from 'uuid';
import type { DataSourceType, NativeData } from '../core';
import path from 'path';
import fs from 'fs';

// ============================================================================
// Type Definitions
// ============================================================================

export interface UploadedFile {
  originalname: string;
  filename: string;
  path: string;
  size: number;
  mimetype: string;
}

export interface UploadResult {
  id: string;
  name: string;
  type: DataSourceType;
  size: number;
  metadata: any;
  uploadedAt: Date;
}

export interface ShapefileComponents {
  shp: string;
  shx?: string;
  dbf?: string;
  prj?: string;
}

// ============================================================================
// Custom Error Classes
// ============================================================================

export class FileUploadError extends Error {
  constructor(message: string, public code: string = 'FILE_UPLOAD_ERROR') {
    super(message);
    this.name = 'FileUploadError';
  }
}

export class ValidationError extends FileUploadError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class FormatError extends FileUploadError {
  constructor(message: string) {
    super(message, 'FORMAT_ERROR');
    this.name = 'FormatError';
  }
}

// ============================================================================
// Service Implementation
// ============================================================================

export class FileUploadService {
  private dataSourceRepo: DataSourceRepository;
  private accessorFactory: DataAccessorFactory;
  private uploadDir: string;

  constructor(dataSourceRepo: DataSourceRepository, workspaceBase?: string) {
    this.dataSourceRepo = dataSourceRepo;
    this.accessorFactory = new DataAccessorFactory();
    
    // Configure upload directory
    this.uploadDir = workspaceBase 
      ? path.join(workspaceBase, 'data', 'local')
      : path.join(process.cwd(), '..', 'workspace', 'data', 'local');
    
    // Ensure directory exists
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  // ==========================================================================
  // Public API - File Upload Operations
  // ==========================================================================

  /**
   * Process single file upload (GeoJSON, TIF, etc.)
   * 
   * @param file - Uploaded file information
   * @returns Upload result with data source info
   * @throws ValidationError if file is invalid
   * @throws FormatError if format is unsupported
   */
  async processSingleFile(file: UploadedFile): Promise<UploadResult> {
    const fileName = file.originalname;
    const filePath = file.path;
    const fileSize = file.size;
    
    console.log(`[FileUploadService] Processing file: ${fileName} (${fileSize} bytes)`);

    try {
      // Step 1: Detect data source type
      const type = this.detectDataSourceType(fileName);
      
      // Step 2: Validate file based on type
      await this.validateFile(filePath, type);
      
      // Step 3: Extract metadata using appropriate accessor
      const nativeData = await this.extractMetadata(filePath, type);
      
      // Step 4: Register data source in database
      const dataSourceId = uuidv4();
      const dataSource = this.dataSourceRepo.create(
        path.basename(fileName, path.extname(fileName)),
        type,
        filePath,
        {
          ...nativeData.metadata,
          originalFileName: fileName,
          fileSize,
          uploadedAt: new Date().toISOString()
        }
      );

      console.log(`[FileUploadService] Successfully registered data source: ${dataSource.id}`);

      return {
        id: dataSource.id,
        name: dataSource.name,
        type: dataSource.type,
        size: fileSize,
        metadata: dataSource.metadata,
        uploadedAt: dataSource.createdAt
      };
    } catch (error) {
      // Clean up uploaded file if processing fails
      this.cleanupFile(filePath);
      
      if (error instanceof FileUploadError) {
        throw error;
      }
      throw new FileUploadError(`Failed to process file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process shapefile upload (multiple component files)
   * 
   * @param files - Array of uploaded shapefile component files
   * @returns Upload result with data source info
   * @throws ValidationError if components are incomplete
   */
  async processShapefile(files: UploadedFile[]): Promise<UploadResult> {
    console.log(`[FileUploadService] Processing shapefile with ${files.length} components`);

    try {
      // Step 1: Validate shapefile components
      const components = this.validateShapefileComponents(files);
      
      // Step 2: Use .shp file as primary reference
      const shpFile = files.find(f => f.originalname.toLowerCase().endsWith('.shp'))!;
      const filePath = shpFile.path;
      const fileSize = files.reduce((sum, f) => sum + f.size, 0);
      
      // Step 3: Validate shapefile
      await this.validateFile(filePath, 'shapefile');
      
      // Step 4: Extract metadata
      const nativeData = await this.extractMetadata(filePath, 'shapefile');
      
      // Step 5: Register data source
      const dataSourceId = uuidv4();
      const baseName = path.basename(shpFile.originalname, '.shp');
      const dataSource = this.dataSourceRepo.create(
        baseName,
        'shapefile',
        filePath,
        {
          ...nativeData.metadata,
          originalFileName: shpFile.originalname,
          fileSize,
          components: Object.keys(components),
          uploadedAt: new Date().toISOString()
        }
      );

      console.log(`[FileUploadService] Successfully registered shapefile: ${dataSource.id}`);

      return {
        id: dataSource.id,
        name: dataSource.name,
        type: dataSource.type,
        size: fileSize,
        metadata: dataSource.metadata,
        uploadedAt: dataSource.createdAt
      };
    } catch (error) {
      // Clean up all uploaded files if processing fails
      files.forEach(file => this.cleanupFile(file.path));
      
      if (error instanceof FileUploadError) {
        throw error;
      }
      throw new FileUploadError(`Failed to process shapefile: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get upload directory path
   */
  getUploadDir(): string {
    return this.uploadDir;
  }

  // ==========================================================================
  // Private Methods - Business Logic
  // ==========================================================================

  /**
   * Detect data source type from file extension
   */
  private detectDataSourceType(fileName: string): DataSourceType {
    const ext = path.extname(fileName).toLowerCase();
    
    switch (ext) {
      case '.geojson':
      case '.json':
        return 'geojson';
      case '.shp':
        return 'shapefile';
      case '.tif':
      case '.tiff':
        return 'tif';
      case '.csv':
        return 'geojson'; // CSV will be converted to GeoJSON
      default:
        throw new FormatError(`Unsupported file format: ${ext}. Supported formats: .geojson, .shp, .tif, .csv`);
    }
  }

  /**
   * Validate uploaded file
   */
  private async validateFile(filePath: string, type: DataSourceType): Promise<void> {
    try {
      const accessor = this.accessorFactory.createAccessor(type);
      
      // For shapefile, validate all components exist
      if (type === 'shapefile') {
        await this.validateShapefileComplete(filePath);
        return;
      }
      
      // Test reading the file to ensure it's valid
      await accessor.read(filePath);
      
      console.log(`[FileUploadService] File validation successful: ${type}`);
    } catch (error) {
      throw new ValidationError(`File validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract metadata from file using appropriate accessor
   */
  private async extractMetadata(filePath: string, type: DataSourceType): Promise<NativeData> {
    try {
      const accessor = this.accessorFactory.createAccessor(type);
      const nativeData = await accessor.read(filePath);
      
      console.log(`[FileUploadService] Metadata extracted: ${JSON.stringify(nativeData.metadata)}`);
      
      return nativeData;
    } catch (error) {
      throw new FileUploadError(`Failed to extract metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate shapefile has all required components
   */
  private async validateShapefileComplete(shpPath: string): Promise<void> {
    const baseName = shpPath.replace(/\.shp$/i, '');
    const requiredFiles = [
      `${baseName}.shp`,
      `${baseName}.shx`,
      `${baseName}.dbf`
    ];

    const missingFiles = requiredFiles.filter(file => !fs.existsSync(file));
    
    if (missingFiles.length > 0) {
      throw new ValidationError(`Incomplete shapefile. Missing components: ${missingFiles.map(f => path.basename(f)).join(', ')}`);
    }

    console.log('[FileUploadService] Shapefile validation successful');
  }

  /**
   * Validate and organize shapefile components
   */
  private validateShapefileComponents(files: UploadedFile[]): ShapefileComponents {
    const components: ShapefileComponents = { shp: '' };
    
    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase();
      
      switch (ext) {
        case '.shp':
          components.shp = file.path;
          break;
        case '.shx':
          components.shx = file.path;
          break;
        case '.dbf':
          components.dbf = file.path;
          break;
        case '.prj':
          components.prj = file.path;
          break;
      }
    }

    if (!components.shp) {
      throw new ValidationError('Shapefile upload must include .shp file');
    }

    return components;
  }

  /**
   * Clean up uploaded file on error
   */
  private cleanupFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[FileUploadService] Cleaned up file: ${filePath}`);
      }
    } catch (error) {
      console.error(`[FileUploadService] Failed to cleanup file ${filePath}:`, error);
    }
  }
}
