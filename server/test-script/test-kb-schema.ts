/**
 * Test script for Knowledge Base database schema
 * 
 * Verifies that KB tables are created correctly in SQLite.
 */

import { WorkspaceManagerInstance } from '../src/storage/filesystem/WorkspaceManager.js';
import { SQLiteManagerInstance } from '../src/storage/database/SQLiteManager.js';
import { KbDocumentRepository } from '../src/knowledge-base/repository/KbDocumentRepository.js';

async function testKbSchema() {
  console.log('=== Testing Knowledge Base Database Schema ===\n');

  try {
    // Step 1: Initialize workspace
    console.log('1. Initializing workspace...');
    const path = await import('path');
    const workspaceDir = path.join(process.cwd(), '..', 'workspace');
    WorkspaceManagerInstance.init(workspaceDir);
    WorkspaceManagerInstance.initialize();
    const workspaceInfo = WorkspaceManagerInstance.getWorkspaceInfo();
    console.log(`   Workspace base directory: ${workspaceInfo.baseDir}`);
    console.log(`   KB ChromaDB dir: ${workspaceInfo.directories.kbChromadb}`);
    console.log(`   KB Documents dir: ${workspaceInfo.directories.kbDocuments}`);
    console.log('   ✓ Workspace initialized\n');

    // Step 2: Initialize database
    console.log('2. Initializing database...');
    SQLiteManagerInstance.init(workspaceInfo.directories.database);
    SQLiteManagerInstance.initialize();
    console.log('   ✓ Database initialized\n');

    // Step 3: Verify KB tables exist
    console.log('3. Verifying KB tables...');
    const db = SQLiteManagerInstance.getDatabase();
    
    const tables = [
      'kb_documents',
      'kb_document_metadata',
      'kb_chunks'
    ];

    for (const tableName of tables) {
      const stmt = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`);
      const table = stmt.get(tableName) as { name: string } | undefined;
      
      if (table) {
        console.log(`   ✓ Table '${tableName}' exists`);
      } else {
        console.error(`   ✗ Table '${tableName}' NOT FOUND`);
        throw new Error(`Table ${tableName} not found`);
      }
    }
    console.log();

    // Step 4: Verify indexes
    console.log('4. Verifying KB indexes...');
    const indexStmt = db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_kb_%'`);
    const indexes = indexStmt.all() as Array<{ name: string }>;
    
    console.log(`   Found ${indexes.length} KB indexes:`);
    for (const idx of indexes) {
      console.log(`     - ${idx.name}`);
    }
    console.log('   ✓ Indexes verified\n');

    // Step 5: Test CRUD operations
    console.log('5. Testing CRUD operations...');
    const repo = new KbDocumentRepository(db);

    // Create a test document
    console.log('   Creating test document...');
    const doc = repo.create(
      'test-policy.pdf',
      'pdf',
      '/path/to/test-policy.pdf',
      1024000
    );
    console.log(`   ✓ Document created: ${doc.id}`);
    console.log(`     Name: ${doc.name}`);
    console.log(`     Status: ${doc.status}`);
    console.log();

    // Add metadata
    console.log('   Adding metadata...');
    repo.setMetadata(doc.id, 'category', 'policy');
    repo.setMetadata(doc.id, 'location', { province: 'Beijing', city: 'Beijing' });
    console.log('   ✓ Metadata added');

    // Retrieve metadata
    const metadata = repo.getMetadata(doc.id);
    console.log(`   Retrieved metadata:`, metadata);
    console.log();

    // Update status
    console.log('   Updating document status to "ready"...');
    repo.updateStatus(doc.id, 'ready');
    const updatedDoc = repo.getById(doc.id);
    console.log(`   ✓ Status updated: ${updatedDoc?.status}`);
    console.log();

    // Create chunks
    console.log('   Creating test chunks...');
    repo.createChunks([
      {
        documentId: doc.id,
        chunkIndex: 0,
        contentPreview: 'This is the first chunk...',
        chromaId: 'chroma-001'
      },
      {
        documentId: doc.id,
        chunkIndex: 1,
        contentPreview: 'This is the second chunk...',
        chromaId: 'chroma-002'
      }
    ]);
    repo.updateChunkCount(doc.id, 2);
    console.log('   ✓ Chunks created');

    // Retrieve chunks
    const chunks = repo.getChunksByDocument(doc.id);
    console.log(`   Retrieved ${chunks.length} chunks`);
    for (const chunk of chunks) {
      console.log(`     - Chunk ${chunk.chunkIndex}: ${chunk.contentPreview.substring(0, 30)}...`);
    }
    console.log();

    // List documents
    console.log('   Listing all documents...');
    const docs = repo.list({ status: 'ready' });
    console.log(`   Found ${docs.length} ready documents`);
    console.log();

    // Count documents
    const count = repo.count();
    console.log(`   Total document count: ${count}`);
    console.log();

    // Clean up test data
    console.log('6. Cleaning up test data...');
    repo.delete(doc.id);
    const remainingDocs = repo.list();
    console.log(`   Remaining documents: ${remainingDocs.length}`);
    console.log('   ✓ Cleanup complete\n');

    console.log('=== All Tests Passed! ===');
    process.exit(0);

  } catch (error) {
    console.error('\n✗ Test failed:', error);
    process.exit(1);
  }
}

// Run test
testKbSchema().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
