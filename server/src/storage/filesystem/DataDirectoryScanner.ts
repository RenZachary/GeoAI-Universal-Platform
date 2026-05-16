import fs from 'fs';
import path from 'path';
import { DataSourceRepository } from '../../data-access/repositories';
import { DataAccessFacade } from '../../data-access/facade/DataAccessFacade';
import type { DataSourceType } from '../../core';
import { SQLiteManagerInstance } from '..';

/**
 * Scan data directory and register unregistered files
 * 
 * Scans workspace/data/local/ directory on startup and registers any 
 * unregistered files with full metadata extraction.
 * 
 * @param db - Database instance
 * @param workspaceBase - Base workspace directory path
 */
export async function scanAndRegisterDataFiles(
  workspaceBase: string
): Promise<void> {
  deleteUnExistFilesInDb(workspaceBase);
  const dataDir = path.join(workspaceBase, 'data', 'local');
  
  if (!fs.existsSync(dataDir)) {
    console.log('  Data directory does not exist, skipping scan');
    return;
  }
  
  // Get list of supported file extensions
  const supportedExtensions = ['.geojson', '.json', '.shp', '.tif', '.tiff', '.csv'];
  
  // Read all files in directory
  const files = fs.readdirSync(dataDir).filter(file => {
    // const fullPath = path.join(dataDir, file);
    // console.log('  Reading file, full path ', fullPath);
    const ext = path.extname(file).toLowerCase();
    return supportedExtensions.includes(ext);
  });
  
  if (files.length === 0) {
    console.log('  No data files found');
    return;
  }
  
  console.log(`  Found ${files.length} files in data directory`);
  
  // Initialize services
  const dataSourceRepo = new DataSourceRepository(SQLiteManagerInstance.getDatabase());
  const dataAccessFacade = DataAccessFacade.getInstance(workspaceBase);
  
  // Check which files are already registered
  const existingSources = dataSourceRepo.listAll();
  const existingPaths = new Set(existingSources.map(ds => ds.reference));
  
  let registeredCount = 0;
  let skippedCount = 0;
  
  // Register unregistered files
  for (const file of files) {
    const fullPath = path.join(dataDir, file);
    
    // Skip if already registered
    if (existingPaths.has(fullPath)) {
      skippedCount++;
      continue;
    }
    
    try {
      console.log(`    Registering: ${file}`);
      
      // Detect file type
      const type = detectFileType(file);
      
      // Extract basic file info
      const stats = fs.statSync(fullPath);
      const metadata: any = {
        name: path.basename(file),
        format: type,
        fileSize: stats.size,
        originalFileName: file,
        uploadedAt: new Date().toISOString()
      };
      
      // Use DataAccessFacade to extract comprehensive metadata
      try {
        console.log(`    Extracting metadata via DataAccessFacade for ${file}...`);
        const backendMetadata = await dataAccessFacade.getMetadata(type, fullPath);
        
        // Merge backend metadata with basic info
        Object.assign(metadata, backendMetadata);
        
        console.log(`    ✓ Metadata extracted: featureCount=${metadata.featureCount || 'N/A'}, geometryType=${metadata.geometryType || 'N/A'}`);
      } catch (error) {
        console.warn(`    Warning: Could not extract full metadata for ${file}, using basic info only`, error instanceof Error ? error.message : 'Unknown error');
        // Set default values for missing metadata
        if (type === 'geojson' || type === 'shapefile') {
          metadata.featureCount = 0;
        }
      }
      
      // Register in database with the original path
      dataSourceRepo.create(
        path.basename(file, path.extname(file)),
        type,
        fullPath, // Use original path, no renaming
        metadata
      );
      
      registeredCount++;
      console.log(`    ✓ Registered: ${file} (${type})`);
    } catch (error) {
      console.error(`    ✗ Failed to register ${file}:`, error instanceof Error ? error.message : 'Unknown error');
    }
  }
  
  console.log(`  Registration complete: ${registeredCount} new, ${skippedCount} already registered`);
}
function deleteUnExistFilesInDb(workspaceBase: string): void {
  const dataDir = path.join(workspaceBase, 'data', 'local');
  const dataSourceRepo = new DataSourceRepository(SQLiteManagerInstance.getDatabase());
  const existingSources = dataSourceRepo.listAll();
  existingSources.forEach(source => {
    if(source.type === 'postgis') return;
    const fullPath = path.join(dataDir, source.reference);
    if (!fs.existsSync(fullPath)) {
      console.log(`  Deleting unexist file in db: ${fullPath}`);
      dataSourceRepo.delete(source.id);
    }
  });
}
/**
 * Detect file type from filename extension
 */
function detectFileType(filename: string): DataSourceType {
  const ext = path.extname(filename).toLowerCase();
  
  switch (ext) {
    case '.geojson':
    case '.json':
      return 'geojson';
    case '.shp':
      return 'shapefile';
    case '.tif':
    case '.tiff':
      return 'tif';
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}
