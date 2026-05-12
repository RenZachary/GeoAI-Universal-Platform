/**
 * Knowledge Base API Routes
 */

import { Router } from 'express';
import { KnowledgeBaseController, upload } from '../controllers/KnowledgeBaseController';
import { WorkspaceManagerInstance, SQLiteManagerInstance } from '../../storage';
import { LLMConfigManagerInstance } from '../../services/LLMConfigService';

/**
 * Create KB router with proper initialization
 * This should be called after database and workspace are initialized
 */
export function createKnowledgeBaseRouter(): Router {
  const router = Router();
  
  // Initialize controller with dependencies
  const dbPath = WorkspaceManagerInstance.getDirectoryPath('KB_LANCEDB');
  const db = SQLiteManagerInstance.getDatabase();
  
  // Load LLM configuration to get API key
  const llmConfig = LLMConfigManagerInstance.loadConfig();
  console.log(`[KB Router] Using LLM provider: ${llmConfig.provider}, hasApiKey: ${!!llmConfig.apiKey}`);
  
  // Only OpenAI and Qwen support embeddings
  const embeddingProvider = (llmConfig.provider === 'openai' || llmConfig.provider === 'qwen') 
    ? llmConfig.provider 
    : 'qwen'; // Default to qwen if provider doesn't support embeddings
  
  const kbController = new KnowledgeBaseController({ 
    dbPath, 
    db,
    apiKey: llmConfig.apiKey,
    embeddingProvider
  });

  // Document Management
  router.post('/documents/upload', upload.single('file'), (req, res) => {
    void kbController.uploadDocument(req, res);
  });

  router.get('/documents', (req, res) => {
    void kbController.listDocuments(req, res);
  });

  router.get('/documents/:id', (req, res) => {
    void kbController.getDocument(req, res);
  });

  router.delete('/documents/:id', (req, res) => {
    void kbController.deleteDocument(req, res);
  });

  // Statistics
  router.get('/stats', (req, res) => {
    void kbController.getStatistics(req, res);
  });

  // Search
  router.post('/search', (req, res) => {
    void kbController.search(req, res);
  });

  router.post('/search/document/:id', (req, res) => {
    void kbController.searchInDocument(req, res);
  });

  return router;
}
