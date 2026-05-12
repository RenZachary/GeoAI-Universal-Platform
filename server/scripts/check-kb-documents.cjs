/**
 * Check KB Documents in SQLite
 */

const path = require('path');
const { WorkspaceManagerInstance, SQLiteManagerInstance } = require('../dist/storage');
const { KbDocumentRepository } = require('../dist/knowledge-base/repository/KbDocumentRepository');

function checkDocuments() {
  console.log('=== Check KB Documents ===\n');

  try {
    // Initialize workspace
    const workspaceBase = process.env.WORKSPACE_BASE || path.join(__dirname, '..', 'workspace');
    WorkspaceManagerInstance.init(workspaceBase);
    
    const db = SQLiteManagerInstance.getDatabase();
    const repo = new KbDocumentRepository(db);
    
    // List all documents
    const docs = repo.list();
    
    console.log(`Total documents in SQLite: ${docs.length}\n`);
    
    if (docs.length === 0) {
      console.log('⚠️  No documents found in SQLite database!\n');
      console.log('This explains why search returns 0 results.');
      console.log('The vectors in LanceDB are orphaned data from deleted documents.\n');
      return;
    }
    
    console.log('Documents:');
    docs.forEach((doc, index) => {
      console.log(`${index + 1}. ${doc.name}`);
      console.log(`   ID: ${doc.id}`);
      console.log(`   Status: ${doc.status}`);
      console.log(`   Chunks: ${doc.chunkCount}`);
      console.log(`   Created: ${doc.createdAt}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkDocuments();
