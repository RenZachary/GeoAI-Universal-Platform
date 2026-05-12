/**
 * Knowledge Base Directory Scanner
 * 
 * Scans workspace/knowledge-base/documents/ directory on startup and 
 * automatically ingests any unregistered documents into the knowledge base.
 * 
 * This ensures that documents placed in the KB directory before server start
 * are automatically processed and made available for semantic search.
 */

import fs from 'fs';
import path from 'path';
import { DocumentIngestionService } from '../services/DocumentIngestionService';
import { KbDocumentRepository } from '../repository/KbDocumentRepository';
import { LLMConfigManagerInstance } from '../../services/LLMConfigService';
import type { KbDocument } from '../types';

/**
 * Scan knowledge base directory and ingest unregistered documents
 * 
 * @param workspaceBase - Base workspace directory path
 * @param dbPath - Path to LanceDB storage
 * @param db - SQLite database instance
 */
export async function scanAndIngestKBDocuments(
  workspaceBase: string,
  dbPath: string,
  db: any // better-sqlite3 Database instance
): Promise<void> {
  const kbDocumentsDir = path.join(workspaceBase, 'knowledge-base', 'documents');
  
  if (!fs.existsSync(kbDocumentsDir)) {
    console.log('  [KB Scanner] Knowledge base documents directory does not exist, skipping scan');
    return;
  }
  
  // Get list of supported file extensions
  const supportedExtensions = ['.pdf', '.docx', '.md', '.markdown'];
  
  // Read all files in directory (non-recursive for now)
  const files = fs.readdirSync(kbDocumentsDir).filter(file => {
    const ext = path.extname(file).toLowerCase();
    return supportedExtensions.includes(ext);
  });
  
  if (files.length === 0) {
    console.log('  [KB Scanner] No knowledge base documents found');
    return;
  }
  
  console.log(`  [KB Scanner] Found ${files.length} documents in KB directory`);
  
  // Load LLM configuration to get API key
  const llmConfig = LLMConfigManagerInstance.loadConfig();
  console.log(`  [KB Scanner] Using LLM provider: ${llmConfig.provider}, hasApiKey: ${!!llmConfig.apiKey}`);
  
  // Initialize services
  const kbRepo = new KbDocumentRepository(db);
  const ingestionService = new DocumentIngestionService({
    dbPath,
    db,
    apiKey: llmConfig.apiKey
  });
  
  // Wait for LanceDB initialization to complete
  console.log('  [KB Scanner] Initializing document ingestion service...');
  await ingestionService.initialize();
  console.log('  [KB Scanner] Document ingestion service ready');
  
  // Check which documents are already registered
  const existingDocs = kbRepo.list();
  const existingFileNames = new Set(existingDocs.map(doc => doc.name));
  
  let ingestedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  
  // Ingest unregistered documents
  for (const file of files) {
    const fullPath = path.join(kbDocumentsDir, file);
    
    // Skip if already registered
    if (existingFileNames.has(file)) {
      skippedCount++;
      console.log(`    ⊘ Skipped (already registered): ${file}`);
      continue;
    }
    
    try {
      console.log(`    Ingesting: ${file}`);
      
      // Get file stats
      const stats = fs.statSync(fullPath);
      
      // Validate file size (max 50MB)
      const maxSize = 50 * 1024 * 1024;
      if (stats.size > maxSize) {
        console.warn(`    ⚠ Skipping ${file}: File too large (${formatFileSize(stats.size)})`);
        skippedCount++;
        continue;
      }
      
      // Ingest document using the ingestion service
      const result = await ingestionService.ingestDocument(fullPath, file);
      
      ingestedCount++;
      console.log(`    ✓ Ingested: ${file} (${result.chunkCount} chunks)`);
      
    } catch (error) {
      failedCount++;
      console.error(`    ✗ Failed to ingest ${file}:`, error instanceof Error ? error.message : 'Unknown error');
      
      // Try to mark as error in database if document was partially created
      try {
        const existingDoc = kbRepo.list().find(doc => doc.name === file);
        if (existingDoc) {
          kbRepo.updateStatus(existingDoc.id, 'error');
          kbRepo.setMetadata(existingDoc.id, 'error_message', error instanceof Error ? error.message : 'Unknown error');
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
  
  console.log(`  [KB Scanner] Ingestion complete: ${ingestedCount} new, ${skippedCount} skipped, ${failedCount} failed`);
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
