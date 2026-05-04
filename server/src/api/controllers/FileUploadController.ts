/**
 * File Upload Controller - HTTP Layer for File Upload Management
 * 
 * Responsibilities:
 * - HTTP request/response handling
 * - Multer middleware integration
 * - Response formatting
 * - Error handling (HTTP status codes)
 * 
 * Note: All business logic delegated to FileUploadService
 */

import type { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import type { FileUploadService } from '../../services';
import { FileUploadError, ValidationError, FormatError } from '../../services/FileUploadService';

// ============================================================================
// Multer Configuration
// ============================================================================

// Middleware to handle UTF-8 encoding for filenames
const handleMultipartEncoding = (req: Request, res: Response, next: any) => {
  // Set charset to utf-8 for proper handling of non-ASCII filenames
  // This must be done before multer processes the request
  if (req.headers['content-type']?.includes('multipart/form-data')) {
    const contentType = req.headers['content-type'];
    if (!contentType.includes('charset')) {
      req.headers['content-type'] = contentType + '; charset=utf-8';
    }
  }
  next();
};

// ============================================================================
// Multer Configuration
// ============================================================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Store files in workspace/data/local directory
    const uploadDir = path.join(process.cwd(), '..', 'workspace', 'data', 'local');
    
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Decode filename to handle UTF-8 characters (Chinese, etc.)
    let originalName = file.originalname;
      
    // Try multiple decoding strategies
    let decoded = false;
      
    // Strategy 1: If it looks like latin-1 encoded UTF-8 bytes (common issue)
    const rawBytes = Buffer.from(originalName, 'binary');
    const hasHighBytes = rawBytes.some(b => b > 127);
      
    if (hasHighBytes) {
      try {
        const utf8Str = rawBytes.toString('utf-8');
        if (!utf8Str.includes('\ufffd')) {
          originalName = utf8Str;
          decoded = true;
        }
      } catch (e) {
        console.warn('[FileUploadController] Binary to UTF-8 conversion failed', e);
      }
    }
      
    // Strategy 2: Try decodeURIComponent if not yet decoded
    if (!decoded) {
      try {
        originalName = decodeURIComponent(originalName);
        decoded = true;
      } catch (e) {
        console.warn('[FileUploadController] decodeURIComponent failed', e);
      }
    }
    
    // Use original filename without timestamp
    cb(null, originalName);
  }
});

// File filter to accept only GIS formats
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedExtensions = [
    '.shp', '.shx', '.dbf', '.prj',  // Shapefile components
    '.geojson', '.json',              // GeoJSON
    '.tif', '.tiff',                  // GeoTIFF
    '.csv'                            // CSV with coordinates
  ];
  
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file format: ${ext}. Supported formats: ${allowedExtensions.join(', ')}`));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
    files: 50 // Max 50 files per upload (for shapefile multi-file)
  }
});

// Export the encoding middleware
export { handleMultipartEncoding };

// ============================================================================
// Controller Implementation
// ============================================================================

export class FileUploadController {
  private fileUploadService: FileUploadService;

  constructor(fileUploadService: FileUploadService) {
    this.fileUploadService = fileUploadService;
  }

  /**
   * Handle single file upload (GeoJSON, TIF, etc.)
   * POST /api/upload/single
   */
  async uploadSingleFile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
        return;
      }

      console.log(`[FileUploadController] Received file: ${req.file.originalname} (${req.file.size} bytes)`);

      // Delegate to service
      const result = await this.fileUploadService.processSingleFile({
        originalname: req.file.originalname,
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size,
        mimetype: req.file.mimetype
      });

      console.log(`[FileUploadController] Successfully registered data source: ${result.id}`);

      res.status(201).json({
        success: true,
        data: {
          id: result.id,
          name: result.name,
          type: result.type,
          size: result.size,
          uploadedAt: result.uploadedAt
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Handle multiple file upload (for shapefile components)
   * POST /api/upload/multiple
   */
  async uploadMultipleFiles(req: Request, res: Response): Promise<void> {
    try {
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        res.status(400).json({
          success: false,
          error: 'No files uploaded'
        });
        return;
      }

      const files = req.files as Express.Multer.File[];
      console.log(`[FileUploadController] Received ${files.length} files`);

      // Check if this is a shapefile upload
      const hasShpFile = files.some(f => f.originalname.toLowerCase().endsWith('.shp'));
      
      if (hasShpFile) {
        // Delegate shapefile processing to service
        const uploadedFiles = files.map(f => ({
          originalname: f.originalname,
          filename: f.filename,
          path: f.path,
          size: f.size,
          mimetype: f.mimetype
        }));

        const result = await this.fileUploadService.processShapefile(uploadedFiles);

        console.log(`[FileUploadController] Successfully registered shapefile: ${result.id}`);

        res.status(201).json({
          success: true,
          data: {
            id: result.id,
            name: result.name,
            type: result.type,
            size: result.size,
            uploadedAt: result.uploadedAt
          }
        });
      } else {
        // Multiple individual files - process each one
        const results = [];
        
        for (const file of files) {
          try {
            const result = await this.fileUploadService.processSingleFile({
              originalname: file.originalname,
              filename: file.filename,
              path: file.path,
              size: file.size,
              mimetype: file.mimetype
            });
            results.push(result);
          } catch (error) {
            console.error(`[FileUploadController] Failed to process ${file.originalname}:`, error);
            // Continue with other files
          }
        }

        res.status(201).json({
          success: true,
          count: results.length,
          data: results.map(r => ({
            id: r.id,
            name: r.name,
            type: r.type,
            size: r.size,
            uploadedAt: r.uploadedAt
          }))
        });
      }
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get upload directory information
   * GET /api/upload/info
   */
  async getUploadInfo(req: Request, res: Response): Promise<void> {
    try {
      const uploadDir = this.fileUploadService.getUploadDir();
      
      res.json({
        success: true,
        uploadDirectory: uploadDir,
        maxFileSize: '100MB',
        supportedFormats: ['.geojson', '.json', '.shp', '.shx', '.dbf', '.prj', '.tif', '.tiff', '.csv']
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // ==========================================================================
  // Private Methods - Error Handling
  // ==========================================================================

  /**
   * Unified error handler for all controller methods
   * Maps service errors to appropriate HTTP status codes
   */
  private handleError(res: Response, error: unknown): void {
    console.error('[FileUploadController] Error:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({
        success: false,
        error: error.message,
        code: error.code
      });
    } else if (error instanceof FormatError) {
      res.status(415).json({
        success: false,
        error: error.message,
        code: error.code
      });
    } else if (error instanceof FileUploadError) {
      res.status(400).json({
        success: false,
        error: error.message,
        code: error.code
      });
    } else {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed'
      });
    }
  }
}
