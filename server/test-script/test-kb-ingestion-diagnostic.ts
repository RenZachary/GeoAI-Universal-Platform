/**
 * Diagnostic script to test knowledge base ingestion
 */

import path from 'path';
import fs from 'fs';
import { WorkspaceManagerInstance } from '../src/storage/filesystem/WorkspaceManager';
import { SQLiteManagerInstance } from '../src/storage/database/SQLiteManager';
import { DocumentIngestionService } from '../src/knowledge-base/services/DocumentIngestionService';

async function diagnose() {
  console.log('=== Knowledge Base Ingestion Diagnostic ===\n');

  try {
    // Step 1: Initialize workspace
    console.log('Step 1: Initializing workspace...');
    const workspaceDir = path.join(process.cwd(), '..', 'workspace');
    WorkspaceManagerInstance.init(workspaceDir);
    WorkspaceManagerInstance.initialize();
    
    const workspaceInfo = WorkspaceManagerInstance.getWorkspaceInfo();
    console.log(`   ✓ Workspace: ${workspaceInfo.baseDir}`);
    console.log(`   ✓ KB LanceDB path: ${workspaceInfo.directories.kbLancedb}\n`);

    // Step 2: Initialize database
    console.log('Step 2: Initializing database...');
    SQLiteManagerInstance.init(workspaceInfo.directories.database);
    SQLiteManagerInstance.initialize();
    console.log('   ✓ Database ready\n');

    // Step 3: Create ingestion service
    console.log('Step 3: Creating ingestion service...');
    const dbPath = workspaceInfo.directories.kbLancedb;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (SQLiteManagerInstance as any).db;
    
    const service = new DocumentIngestionService({
      dbPath,
      db,
      apiKey: process.env.DASHSCOPE_API_KEY || 'mock-key-for-testing'
    });

    await service.initialize();
    console.log('   ✓ Ingestion service ready\n');

    // Step 4: Check if test document exists
    const testDocPath = path.join(__dirname, 'test-kb-diagnostic.md');
    const testContent = `# Test Document for KB Diagnostic

This is a test document to verify the knowledge base ingestion pipeline.

## Section 1
Testing basic text parsing and chunking functionality.

## Section 2
Verifying embedding generation works correctly.

## Conclusion
If this document ingests successfully, the KB system is working properly.
`;

    console.log('Step 4: Creating test document...');
    await fs.promises.writeFile(testDocPath, testContent, 'utf-8');
    console.log(`   ✓ Test document created: ${testDocPath}\n`);

    // Step 5: Try to ingest
    console.log('Step 5: Attempting ingestion...');
    console.log('   (This may take a few seconds for embedding generation)\n');
    
    const result = await service.ingestDocument(testDocPath, 'Diagnostic Test Document');
    
    console.log('\n📊 Ingestion Result:');
    console.log(`   Document ID: ${result.documentId}`);
    console.log(`   Chunks: ${result.chunkCount}`);
    console.log(`   Status: ${result.status}`);
    if (result.errorMessage) {
      console.log(`   ❌ Error: ${result.errorMessage}`);
    } else {
      console.log('   ✅ Success!');
    }
    console.log();

    // Step 6: Check database status
    console.log('Step 6: Checking database status...');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new (await import('../src/knowledge-base/repository/KbDocumentRepository')).KbDocumentRepository(db as any);
    const doc = repo.getById(result.documentId);
    if (doc) {
      console.log(`   Database status: ${doc.status}`);
      console.log(`   Chunk count: ${doc.chunkCount}`);
      if (doc.errorMessage) {
        console.log(`   Error message: ${doc.errorMessage}`);
      }
    } else {
      console.log('   ❌ Document not found in database!');
    }
    console.log();

    // Step 7: Cleanup
    console.log('Step 7: Cleaning up...');
    try {
      await fs.promises.unlink(testDocPath);
      console.log('   ✓ Test document removed');
      
      // Delete from database
      repo.delete(result.documentId);
      console.log('   ✓ Database record removed');
    } catch (e) {
      console.log('   ⚠ Cleanup warning:', e instanceof Error ? e.message : String(e));
    }

    console.log('\n=== Diagnostic Complete ===');
    
    if (result.status === 'ready') {
      console.log('\n✅ KNOWLEDGE BASE IS WORKING CORRECTLY');
      console.log('\nIf documents are still showing "processing" in the UI, the issue is likely:');
      console.log('1. The frontend is not refreshing the document list');
      console.log('2. There was a previous failed ingestion that needs manual cleanup');
      console.log('3. The scanner is running but encountering errors');
    } else {
      console.log('\n❌ KNOWLEDGE BASE HAS ISSUES');
      console.log('\nPlease check the error message above and fix accordingly.');
    }

  } catch (error) {
    console.error('\n❌ DIAGNOSTIC FAILED:');
    console.error(error instanceof Error ? error.message : String(error));
    console.error('\nStack trace:');
    console.error(error instanceof Error ? error.stack : 'No stack trace');
  }
}

diagnose().catch(console.error);
