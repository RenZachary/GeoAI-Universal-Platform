/**
 * Reset Knowledge Base Vector Store
 * 
 * This script drops and recreates the LanceDB table, removing all orphaned vectors.
 * Use this when you want to start fresh or clean up after deleting all documents.
 * 
 * WARNING: This will delete ALL vector data!
 * 
 * Usage: node scripts/reset-kb-vectors.js
 */

const path = require('path');
const { WorkspaceManagerInstance } = require('../dist/storage');
const lancedb = require('@lancedb/lancedb');
const { KB_CONFIG } = require('../dist/knowledge-base/config');

async function resetVectorStore() {
  console.log('=== Reset Knowledge Base Vector Store ===\n');
  console.log('⚠️  WARNING: This will delete ALL vector data!\n');

  try {
    // Initialize workspace
    const workspaceBase = process.env.WORKSPACE_BASE || path.join(__dirname, '..', 'workspace');
    console.log(`Workspace: ${workspaceBase}`);
    WorkspaceManagerInstance.init(workspaceBase);
    
    const lancedbPath = WorkspaceManagerInstance.getDirectoryPath('KB_LANCEDB');
    console.log(`LanceDB path: ${lancedbPath}\n`);

    // Connect to LanceDB
    console.log('Connecting to LanceDB...');
    const connection = await lancedb.connect(lancedbPath);
    
    // Check if table exists
    const tableNames = await connection.tableNames();
    console.log(`Existing tables: ${tableNames.join(', ') || '(none)'}\n`);

    if (tableNames.includes(KB_CONFIG.COLLECTION_NAME)) {
      console.log(`Dropping table '${KB_CONFIG.COLLECTION_NAME}'...`);
      await connection.dropTable(KB_CONFIG.COLLECTION_NAME);
      console.log('✅ Table dropped\n');
    } else {
      console.log(`Table '${KB_CONFIG.COLLECTION_NAME}' does not exist\n`);
    }

    // Recreate empty table
    console.log('Creating new empty table...');
    const emptyData = [
      {
        id: '',
        text: '',
        embedding: new Array(KB_CONFIG.EMBEDDING_DIMENSIONS).fill(0),
        documentId: '',
        chunkIndex: 0,
        documentName: '',
        documentType: '',
        totalChunks: 0,
        pageNumber: -1,
        section: '',
        createdAt: ''
      }
    ];

    const table = await connection.createTable(
      KB_CONFIG.COLLECTION_NAME,
      emptyData,
      { mode: 'create' }
    );

    // Remove dummy row
    await table.delete("id = ''");
    
    console.log('✅ New empty table created\n');
    console.log('=== Reset Complete ===');
    console.log('The vector store is now clean. You can re-upload documents.\n');

  } catch (error) {
    console.error('❌ Reset failed:', error);
    throw error;
  }
}

resetVectorStore().catch(console.error);
