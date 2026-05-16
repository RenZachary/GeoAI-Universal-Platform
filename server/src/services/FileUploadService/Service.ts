import type { DataSourceRepository } from '../../data-access/repositories';
import type { DataSourceType } from '../../core';
import { FileUploadValidator } from './Validator';
import { MetadataExtractor } from './MetadataExtractor';
import { FileCleanupManager } from './FileCleanupManager';
import { FilenameDecoder } from './FilenameDecoder';
import type { UploadedFile, UploadResult } from './interface';
import path from 'path';
import fs from 'fs';

export class FileUploadService {
  private dataSourceRepo: DataSourceRepository;
  private validator: FileUploadValidator;
  private metadataExtractor: MetadataExtractor;
  private cleanupManager: FileCleanupManager;
  private filenameDecoder: FilenameDecoder;
  private uploadDir: string;

  constructor(dataSourceRepo: DataSourceRepository, workspaceBase?: string) {
    this.dataSourceRepo = dataSourceRepo;
    this.validator = new FileUploadValidator();
    this.metadataExtractor = new MetadataExtractor(workspaceBase);
    this.cleanupManager = new FileCleanupManager();
    this.filenameDecoder = new FilenameDecoder();

    this.uploadDir = workspaceBase
      ? path.join(workspaceBase, 'data', 'local')
      : path.join(process.cwd(), '..', 'workspace', 'data', 'local');

    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async processSingleFile(file: UploadedFile): Promise<UploadResult> {
    const originalFileName = file.originalname;
    const fileSize = file.size;

    let finalFilePath: string = '';
    let tempFilePath: string = '';

    try {
      const type: DataSourceType = this.validator.detectDataSourceType(originalFileName);

      tempFilePath = path.join(this.uploadDir, originalFileName);
      const decodedFileName = this.filenameDecoder.decodeFilename(originalFileName);
      finalFilePath = path.join(this.uploadDir, decodedFileName);

      if (fs.existsSync(tempFilePath) && tempFilePath !== finalFilePath) {
        if (fs.existsSync(finalFilePath)) {
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
          fs.renameSync(tempFilePath, finalFilePath);
        }
      } else if (fs.existsSync(finalFilePath) && tempFilePath === finalFilePath) {
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

      await this.validateFile(finalFilePath, type);

      const nativeData = await this.metadataExtractor.extractMetadata(finalFilePath, type);

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
      if (finalFilePath && fs.existsSync(finalFilePath)) {
        this.cleanupManager.cleanupFile(finalFilePath);
      }
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        this.cleanupManager.cleanupFile(tempFilePath);
      }

      throw error;
    }
  }

  async processShapefile(files: UploadedFile[]): Promise<UploadResult> {
    console.log(`[FileUploadService] Processing shapefile with ${files.length} components`);

    try {
      const componentPaths = this.validator.validateShapefileComponents(files);

      const shpFile = files.find(f => f.originalname.toLowerCase().endsWith('.shp'));
      if (!shpFile) {
        throw new Error('Shapefile is missing required .shp file');
      }

      const decodedShpName = this.filenameDecoder.decodeFilename(shpFile.originalname);

      const finalPaths: Record<string, string> = {};
      for (const [ext, filePath] of Object.entries(componentPaths)) {
        const originalFile = files.find(f => f.path === filePath);
        if (!originalFile) continue;

        const decodedName = this.filenameDecoder.decodeFilename(originalFile.originalname);
        const tempPath = path.join(this.uploadDir, originalFile.originalname);
        let finalPath = path.join(this.uploadDir, decodedName);

        if (fs.existsSync(tempPath) && tempPath !== finalPath) {
          if (fs.existsSync(finalPath)) {
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
          } else {
            fs.renameSync(tempPath, finalPath);
          }
        } else if (fs.existsSync(finalPath) && tempPath === finalPath) {
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

      await this.validateFile(filePath, 'shapefile');

      const nativeData = await this.metadataExtractor.extractMetadata(filePath, 'shapefile');

      const baseName = path.basename(decodedShpName, '.shp');
      const dataSource = this.dataSourceRepo.create(
        baseName,
        'shapefile',
        filePath,
        {
          ...nativeData.metadata,
          originalFileName: decodedShpName,
          fileSize,
          components: Object.keys(componentPaths),
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
      files.forEach(file => this.cleanupManager.cleanupFile(file.path));
      throw error;
    }
  }

  getUploadDir(): string {
    return this.uploadDir;
  }

  private async validateFile(filePath: string, type: string): Promise<void> {
    if (type === 'shapefile') {
      this.validator.validateShapefileComplete(filePath);
      return;
    }

    if (type === 'geojson') {
      const content = fs.readFileSync(filePath, 'utf-8');
      this.validator.validateGeoJSON(content);
      console.log(`[FileUploadService] GeoJSON validation successful`);
      return;
    }

    if (type === 'tif') {
      const buffer = fs.readFileSync(filePath);
      this.validator.validateGeoTIFF(buffer);
      console.log(`[FileUploadService] GeoTIFF validation successful`);
      return;
    }

    console.warn(`[FileUploadService] Basic validation passed for type: ${type}`);
  }
}
