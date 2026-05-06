import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { DataSourceRepository } from '../data-access/repositories';
import { DataAccessorFactory } from '../data-access';
import type { DataSourceType } from '../core';
import { SQLiteManagerInstance } from '../storage';

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
  const dataDir = path.join(workspaceBase, 'data', 'local');
  
  if (!fs.existsSync(dataDir)) {
    console.log('  Data directory does not exist, skipping scan');
    return;
  }
  
  // Get list of supported file extensions
  const supportedExtensions = ['.geojson', '.json', '.shp', '.tif', '.tiff', '.csv'];
  
  // Read all files in directory
  const files = fs.readdirSync(dataDir).filter(file => {
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
  const accessorFactory = new DataAccessorFactory(workspaceBase);
  
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
      
      // Get accessor for this type
      const accessor = accessorFactory.createAccessor(type);
      
      // Extract metadata directly from the file (no copying)
      const metadata = await accessor.getMetadata(fullPath);
      
      // Register in database with the original path
      const dataSourceId = uuidv4();
      dataSourceRepo.create(
        path.basename(file, path.extname(file)),
        type,
        fullPath, // Use original path, no renaming
        {
          ...metadata,
          originalFileName: file,
          fileSize: metadata.fileSize,
          uploadedAt: new Date().toISOString()
        }
      );
      
      registeredCount++;
      console.log(`    ✓ Registered: ${file} (${type})`);
    } catch (error) {
      console.error(`    ✗ Failed to register ${file}:`, error instanceof Error ? error.message : 'Unknown error');
    }
  }
  
  console.log(`  Registration complete: ${registeredCount} new, ${skippedCount} already registered`);
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
