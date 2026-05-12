/**
 * Test script for Document Ingestion Service
 * 
 * Tests the complete pipeline: Parse → Chunk → Embed → Store
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { WorkspaceManagerInstance } from '../src/storage/filesystem/WorkspaceManager.js';
import { SQLiteManagerInstance } from '../src/storage/database/SQLiteManager.js';
import { DocumentIngestionService } from '../src/knowledge-base/services/DocumentIngestionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testIngestionService() {
  console.log('=== Testing Document Ingestion Service ===\n');

  // Step 1: Initialize workspace
  console.log('Step 1: Initializing workspace...');
  const workspaceDir = path.join(process.cwd(), '..', 'workspace');
  WorkspaceManagerInstance.init(workspaceDir);
  WorkspaceManagerInstance.initialize();
  
  const workspaceInfo = WorkspaceManagerInstance.getWorkspaceInfo();
  console.log(`   Workspace: ${workspaceInfo.baseDir}\n`);

  // Step 2: Initialize database
  console.log('Step 2: Initializing database...');
  SQLiteManagerInstance.init(workspaceInfo.directories.database);
  SQLiteManagerInstance.initialize();
  console.log('   Database ready\n');

  // Step 3: Create ingestion service
  console.log('Step 3: Creating ingestion service...');
  const chromaPath = workspaceInfo.directories.kbChromadb;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (SQLiteManagerInstance as any).db;
  
  const service = new DocumentIngestionService({
    chromaPath,
    db,
    apiKey: process.env.DASHSCOPE_API_KEY // Will use mock mode if not set
  });

  await service.initialize();
  console.log('   Ingestion service ready\n');

  // Step 4: Create a test markdown file
  console.log('Step 4: Creating test document...');
  const testDocPath = path.join(__dirname, 'test-kb-document.md');
  const testContent = `# GeoAI-UP Knowledge Base Test

## Introduction
GeoAI-UP is a powerful geospatial AI platform that combines geographic information systems with artificial intelligence.

## Features
- Spatial analysis and processing
- Machine learning integration
- Vector and raster data support
- Plugin-based architecture

## Architecture
The platform uses a modular design with separate components for:
1. Data management
2. Spatial operators
3. LLM interaction
4. Visualization services

## Conclusion
GeoAI-UP provides a comprehensive solution for geospatial AI applications.
`;

  await fs.writeFile(testDocPath, testContent, 'utf-8');
  console.log(`   Test document created: ${testDocPath}\n`);

  // Step 5: Ingest the document
  console.log('Step 5: Ingesting document...');
  try {
    const result = await service.ingestDocument(testDocPath, 'Test KB Document');
    
    console.log('\n📊 Ingestion Result:');
    console.log(`   Document ID: ${result.documentId}`);
    console.log(`   Chunks: ${result.chunkCount}`);
    console.log(`   Status: ${result.status}`);
    if (result.errorMessage) {
      console.log(`   Error: ${result.errorMessage}`);
    }
    console.log();

    if (result.status === 'ready') {
      console.log('✅ Ingestion successful!');
    } else {
      console.log('❌ Ingestion failed');
    }

  } catch (error) {
    console.error('❌ Ingestion error:', error);
  }

  // Step 6: Cleanup test file
  console.log('\nStep 6: Cleaning up...');
  try {
    await fs.unlink(testDocPath);
    console.log('   Test document removed');
  } catch {
    // Ignore cleanup errors
  }

  console.log('\n=== Test Complete ===');
}

testIngestionService().catch(console.error);
