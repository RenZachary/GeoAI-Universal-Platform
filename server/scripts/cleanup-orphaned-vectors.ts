/**
 * Cleanup Orphaned Vector Data
 * 
 * This script scans LanceDB for vector chunks whose documentId no longer exists
 * in the SQLite database, and removes them to free up space and prevent orphaned
 * search results.
 * 
 * Usage: npx ts-node scripts/cleanup-orphaned-vectors.ts
 */

import path from 'path';
import fs from 'fs';
import { WorkspaceManagerInstance, SQLiteManagerInstance } from '../src/storage';
import { LanceDBAdapter } from '../src/knowledge-base/vector-store/LanceDBAdapter';
import { KbDocumentRepository } from '../src/knowledge-base/repository/KbDocumentRepository';

async function cleanupOrphanedVectors(): Promise<void> {
  console.log('=== Cleanup Orphaned Vector Data ===\n');

  try {
    // Initialize workspace and database
    const workspaceBase = process.env.WORKSPACE_BASE || path.join(__dirname, '..', 'workspace');
    WorkspaceManagerInstance.init(workspaceBase);
    
    const db = SQLiteManagerInstance.getDatabase();
    const repo = new KbDocumentRepository(db);
    
    // Get all existing document IDs from SQLite
    const existingDocs = repo.list();
    const existingDocIds = new Set(existingDocs.map(doc => doc.id));
    
    console.log(`Found ${existingDocs.length} documents in SQLite database`);
    console.log(`Existing document IDs:`, Array.from(existingDocIds).slice(0, 5), '...\n');

    // Initialize LanceDB
    const lancedbPath = WorkspaceManagerInstance.getDirectoryPath('KB_LANCEDB');
    const vectorStore = new LanceDBAdapter(lancedbPath);
    await vectorStore.initialize();
    
    console.log('LanceDB initialized\n');

    // Query all unique documentIds from LanceDB
    console.log('Scanning LanceDB for all document IDs...');
    const allChunks = await vectorStore.search(
      new Array(1536).fill(0), // Dummy embedding for scanning
      100000, // Get all chunks (adjust if you have more)
      undefined
    );
    
    const lanceDocIds = new Set(allChunks.map(chunk => chunk.documentId));
    console.log(`Found ${lanceDocIds.size} unique document IDs in LanceDB\n`);

    // Find orphaned document IDs
    const orphanedIds = Array.from(lanceDocIds).filter(id => !existingDocIds.has(id));
    
    if (orphanedIds.length === 0) {
      console.log('✅ No orphaned vectors found. Database is clean!');
      return;
    }

    console.log(`⚠️  Found ${orphanedIds.length} orphaned document IDs:`);
    console.log(orphanedIds.slice(0, 10).map(id => `  - ${id}`).join('\n'));
    if (orphanedIds.length > 10) {
      console.log(`  ... and ${orphanedIds.length - 10} more\n`);
    } else {
      console.log('');
    }

    // Delete orphaned vectors
    console.log('Deleting orphaned vectors from LanceDB...');
    let deletedCount = 0;
    
    for (const docId of orphanedIds) {
      try {
        await vectorStore.deleteByDocumentId(docId);
        deletedCount++;
        console.log(`  ✓ Deleted vectors for document: ${docId.substring(0, 8)}...`);
      } catch (error) {
        console.error(`  ✗ Failed to delete ${docId}:`, error instanceof Error ? error.message : error);
      }
    }

    console.log(`\n✅ Cleanup complete!`);
    console.log(`   - Orphaned documents removed: ${deletedCount}`);
    console.log(`   - Remaining documents in LanceDB: ${lanceDocIds.size - deletedCount}`);
    console.log(`   - Documents in SQLite: ${existingDocs.length}`);
    
    console.log('\nNote: LanceDB uses append-only storage. Deleted data is marked but');
    console.log('may not immediately free disk space. Consider rebuilding the table');
    console.log('if you need to reclaim storage.\n');

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    throw error;
  }
}

// Run the cleanup
cleanupOrphanedVectors().catch(console.error);
