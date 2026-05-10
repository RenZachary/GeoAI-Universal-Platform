/**
 * File Upload Service - Business Logic for File Upload and Registration
 * 
 * Responsibilities:
 * - File format detection and validation
 * - Metadata extraction from uploaded files
 * - Data source registration
 * - File cleanup on validation failure
 */

import type { DataSourceRepository } from '../data-access/repositories';
import { DataAccessFacade } from '../data-access';
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
  private dataAccess: DataAccessFacade;
  private uploadDir: string;

  constructor(dataSourceRepo: DataSourceRepository, workspaceBase?: string) {
    this.dataSourceRepo = dataSourceRepo;
    this.dataAccess = DataAccessFacade.getInstance(workspaceBase);

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
  // Private Helper Methods
  // ==========================================================================

  /**
   * Decode filename to handle UTF-8 characters (Chinese, etc.)
   * Tries multiple strategies to properly decode the filename
   */
  private decodeFilename(filename: string): string {
    let decoded = filename;
    let success = false;

    // Strategy 1: If it looks like latin-1 encoded UTF-8 bytes (common issue)
    const rawBytes = Buffer.from(filename, 'binary');
    const hasHighBytes = rawBytes.some(b => b > 127);

    if (hasHighBytes) {
      try {
        const utf8Str = rawBytes.toString('utf-8');
        if (!utf8Str.includes('\ufffd')) {
          decoded = utf8Str;
          success = true;
        }
      } catch (e) {
        console.warn('[FileUploadService] Binary to UTF-8 conversion failed', e);
      }
    }

    // Strategy 2: Try decodeURIComponent if not yet decoded
    if (!success) {
      try {
        decoded = decodeURIComponent(filename);
        success = true;
      } catch (e) {
        // decodeURIComponent failed
        console.warn('[FileUploadService] decodeURIComponent failed', e);
      }
    }

    return decoded;
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
    const originalFileName = file.originalname;
    const tempFilePath = file.path;
    const fileSize = file.size;

    let finalFilePath: string = '';

    try {
      // Step 1: Detect data source type
      const type = this.detectDataSourceType(originalFileName);

      // Step 2: File is already saved by multer to upload directory
      // Multer saves with the raw filename from the request (may be encoded)
      const tempFilePath = path.join(this.uploadDir, originalFileName);

      // Decode filename to handle UTF-8 characters (Chinese, etc.)
      const decodedFileName = this.decodeFilename(originalFileName);
      finalFilePath = path.join(this.uploadDir, decodedFileName);

      // Handle file naming:
      // 1. If multer saved with encoded name, rename to decoded name
      // 2. If decoded name already exists, add counter suffix
      if (fs.existsSync(tempFilePath) && tempFilePath !== finalFilePath) {
        // Multer saved with encoded/different name, need to rename
        if (fs.existsSync(finalFilePath)) {
          // Decoded name already exists, find available name with counter
          const ext = path.extname(decodedFileName);
          const baseName = path.basename(decodedFileName, ext);
          let counter = 1;
          let newFilePath = finalFilePath;

          while (fs.existsSync(newFilePath)) {
            newFilePath = path.join(this.uploadDir, `${baseName}(${counter})${ext}`);
            counter++;
          }

          fs.renameSync(tempFilePath, newFilePath);
          finalFilePath = newFilePath;
        } else {
          // Decoded name doesn't exist, just rename to decoded name
          fs.renameSync(tempFilePath, finalFilePath);
        }
      } else if (fs.existsSync(finalFilePath) && tempFilePath === finalFilePath) {
        // File already saved with correct decoded name, but it's a duplicate upload
        // Add counter suffix
        const ext = path.extname(decodedFileName);
        const baseName = path.basename(decodedFileName, ext);
        let counter = 1;
        let newFilePath = finalFilePath;

        while (fs.existsSync(newFilePath)) {
          newFilePath = path.join(this.uploadDir, `${baseName}(${counter})${ext}`);
          counter++;
        }

        fs.renameSync(finalFilePath, newFilePath);
        finalFilePath = newFilePath;
      }

      // Step 3: Validate file based on type
      await this.validateFile(finalFilePath, type);

      // Step 4: Extract metadata using appropriate accessor
      const nativeData = await this.extractMetadata(finalFilePath, type);

      // Step 5: Register data source in database
      const dataSource = this.dataSourceRepo.create(
        path.basename(decodedFileName, path.extname(decodedFileName)),
        type,
        finalFilePath,
        {
          ...nativeData.metadata,
          originalFileName: decodedFileName,
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
      // Clean up files if processing fails
      if (finalFilePath && fs.existsSync(finalFilePath)) {
        this.cleanupFile(finalFilePath);
      }
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        this.cleanupFile(tempFilePath);
      }

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
      const shpFile = files && files.find(f => f.originalname.toLowerCase().endsWith('.shp'));
      if (!shpFile)
        throw new ValidationError('Shapefile is missing required .shp file');
      // Decode filename to handle UTF-8 characters
      const decodedShpName = this.decodeFilename(shpFile.originalname);

      // Build final file paths for all components
      const finalPaths: Record<string, string> = {};
      for (const [ext, file] of Object.entries(components)) {
        const decodedName = this.decodeFilename(file.originalname);
        const tempPath = path.join(this.uploadDir, file.originalname);
        let finalPath = path.join(this.uploadDir, decodedName);

        // Handle file naming similar to single file upload
        if (fs.existsSync(tempPath) && tempPath !== finalPath) {
          // Multer saved with encoded/different name
          if (fs.existsSync(finalPath)) {
            // Decoded name already exists, find available name with counter
            const ext = path.extname(decodedName);
            const baseName = path.basename(decodedName, ext);
            let counter = 1;
            let newFilePath = finalPath;

            while (fs.existsSync(newFilePath)) {
              newFilePath = path.join(this.uploadDir, `${baseName}(${counter})${ext}`);
              counter++;
            }

            fs.renameSync(tempPath, newFilePath);
            finalPath = newFilePath;
            console.log(`[FileUploadService] Shapefile component renamed from ${path.basename(tempPath)} to ${path.basename(newFilePath)}`);
          } else {
            // Just rename to decoded name
            fs.renameSync(tempPath, finalPath);
            console.log(`[FileUploadService] Shapefile component renamed from ${path.basename(tempPath)} to ${path.basename(finalPath)}`);
          }
        } else if (fs.existsSync(finalPath) && tempPath === finalPath) {
          // File already has correct name but it's a duplicate
          const ext = path.extname(decodedName);
          const baseName = path.basename(decodedName, ext);
          let counter = 1;
          let newFilePath = finalPath;

          while (fs.existsSync(newFilePath)) {
            newFilePath = path.join(this.uploadDir, `${baseName}(${counter})${ext}`);
            counter++;
          }

          fs.renameSync(finalPath, newFilePath);
          finalPath = newFilePath;
        }

        finalPaths[ext] = finalPath;
      }

      const filePath = finalPaths['shp'];
      const fileSize = files.reduce((sum, f) => sum + f.size, 0);

      // Step 3: Validate shapefile
      await this.validateFile(filePath, 'shapefile');

      // Step 4: Extract metadata
      const nativeData = await this.extractMetadata(filePath, 'shapefile');

      // Step 5: Register data source
      const baseName = path.basename(decodedShpName, '.shp');
      const dataSource = this.dataSourceRepo.create(
        baseName,
        'shapefile',
        filePath,
        {
          ...nativeData.metadata,
          originalFileName: decodedShpName,
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
   * Validate uploaded file using appropriate Backend
   */
  private async validateFile(filePath: string, type: DataSourceType): Promise<void> {
    try {
      // For shapefile, validate all components exist
      if (type === 'shapefile') {
        await this.validateShapefileComplete(filePath);
        return;
      }

      // For GeoJSON, validate JSON structure
      if (type === 'geojson') {
        const content = fs.readFileSync(filePath, 'utf-8');
        const geojson = JSON.parse(content);
        
        if (!geojson.type || !['Feature', 'FeatureCollection'].includes(geojson.type)) {
          throw new ValidationError('Invalid GeoJSON: missing or invalid type field');
        }
        
        if (geojson.type === 'Feature' && !geojson.geometry) {
          throw new ValidationError('Invalid GeoJSON Feature: missing geometry');
        }
        
        console.log(`[FileUploadService] GeoJSON validation successful`);
        return;
      }

      // For GeoTIFF, validate file header
      if (type === 'tif') {
        const buffer = fs.readFileSync(filePath);
        // Check for TIFF magic numbers (little-endian: 0x4949, big-endian: 0x4D4D)
        if (buffer.length < 4) {
          throw new ValidationError('Invalid TIFF file: file too small');
        }
        
        const isLittleEndian = buffer[0] === 0x49 && buffer[1] === 0x49;
        const isBigEndian = buffer[0] === 0x4D && buffer[1] === 0x4D;
        
        if (!isLittleEndian && !isBigEndian) {
          throw new ValidationError('Invalid TIFF file: incorrect magic number');
        }
        
        console.log(`[FileUploadService] GeoTIFF validation successful`);
        return;
      }

      console.warn(`[FileUploadService] Basic validation passed for type: ${type}`);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(`File validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract metadata from file using appropriate Backend
   */
  private async extractMetadata(filePath: string, type: DataSourceType): Promise<NativeData> {
    try {
      // Use DataAccessFacade to read and extract metadata via Accessor layer
      const nativeData = await this.dataAccess.read(type, filePath);
      
      // Ensure the reference points to the uploaded file path
      nativeData.reference = filePath;
      
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
