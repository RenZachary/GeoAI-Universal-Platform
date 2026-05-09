/**
 * SpatialOperator Controller - REST API for Spatial Operators
 * 
 * Provides complete REST API for managing and executing SpatialOperators.
 * This is the primary controller in v2.0 architecture.
 * 
 * Endpoints:
 * - GET    /api/operators              - List all operators with metadata
 * - GET    /api/operators/:id          - Get operator details and schema
 * - POST   /api/operators/:id/execute  - Execute an operator with input validation
 * - GET    /api/operators/categories   - List available categories
 * - GET    /api/operators/search       - Search operators by capability/category
 */

import type { Request, Response } from 'express';
import { SpatialOperatorRegistryInstance, registerAllOperators } from '../../spatial-operators';
import { SQLiteManagerInstance } from '../../storage';
import { ToolRegistryInstance } from '../../llm-interaction/tools/ToolRegistry';

export interface OperatorListResponse {
  success: boolean;
  count: number;
  operators: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    version: string;
    capabilities: string[];
  }>;
}

export interface OperatorDetailResponse {
  success: boolean;
  operator: {
    id: string;
    name: string;
    description: string;
    category: string;
    version: string;
    capabilities: string[];
    inputSchema: any;
    outputSchema: any;
    examples?: Array<{
      description: string;
      input: Record<string, any>;
    }>;
  };
}

export interface OperatorExecuteRequest {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface OperatorExecuteResponse {
  success: boolean;
  result?: any;
  error?: string;
  executedAt?: string;
  duration?: number;
}

export class SpatialOperatorController {
  private workspaceBase: string;
  private initialized: boolean = false;

  constructor(workspaceBase: string) {
    this.workspaceBase = workspaceBase;
  }

  /**
   * Initialize spatial operators registry
   * Should be called once during application startup
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[SpatialOperator Controller] Already initialized');
      return;
    }

    console.log('[SpatialOperator Controller] Initializing spatial operators...');
    const db = SQLiteManagerInstance.getDatabase();
    registerAllOperators(db, this.workspaceBase);
    
    const count = SpatialOperatorRegistryInstance.getOperatorCount();
    console.log(`[SpatialOperator Controller] Registered ${count} operators`);
    
    // Sync operators with ToolRegistry for LLM execution
    console.log('[SpatialOperator Controller] Syncing with ToolRegistry...');
    await ToolRegistryInstance.registerAllFromRegistry();
    
    this.initialized = true;
  }

  /**
   * GET /api/operators - List all available operators
   * Optional query params: ?category=analysis&capability=buffer
   */
  async listOperators(req: Request, res: Response): Promise<void> {
    try {
      const { category, capability } = req.query;

      let operators = SpatialOperatorRegistryInstance.listOperators();

      // Convert to full operator instances for filtering
      const operatorInstances = operators
        .map(info => SpatialOperatorRegistryInstance.getOperator(info.operatorId))
        .filter((op): op is NonNullable<typeof op> => op !== undefined);

      // Filter by category if provided
      if (category && typeof category === 'string') {
        operators = operatorInstances
          .filter(op => op.category === category)
          .map(op => ({
            operatorId: op.operatorId,
            name: op.name,
            description: op.description,
            category: op.category
          }));
      }

      // Filter by capability if provided
      if (capability && typeof capability === 'string') {
        operators = operators.filter(op => {
          const opMetadata = SpatialOperatorRegistryInstance.getOperator(op.operatorId)?.getMetadata();
          return opMetadata?.capabilities?.includes(capability);
        });
      }

      const response: OperatorListResponse = {
        success: true,
        count: operators.length,
        operators: operators.map(opInfo => {
          const op = SpatialOperatorRegistryInstance.getOperator(opInfo.operatorId);
          const metadata = op?.getMetadata();
          
          return {
            id: opInfo.operatorId,
            name: opInfo.name,
            description: opInfo.description,
            category: opInfo.category,
            version: metadata?.version || '1.0.0',
            capabilities: metadata?.capabilities || []
          };
        })
      };

      res.json(response);

    } catch (error) {
      console.error('[SpatialOperator Controller] Error listing operators:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/operators/:id - Get detailed operator information including schemas
   */
  async getOperatorDetail(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const operatorId = Array.isArray(id) ? id[0] : id;
      
      const operator = SpatialOperatorRegistryInstance.getOperator(operatorId);

      if (!operator) {
        res.status(404).json({
          success: false,
          error: `Operator not found: ${operatorId}`
        });
        return;
      }

      const metadata = operator.getMetadata();

      const response: OperatorDetailResponse = {
        success: true,
        operator: {
          id: metadata.operatorId,
          name: metadata.name,
          description: metadata.description,
          category: metadata.category,
          version: metadata.version || '1.0.0',
          capabilities: metadata.capabilities || [],
          inputSchema: metadata.inputSchema,
          outputSchema: metadata.outputSchema,
          examples: [] // Examples can be added to metadata in the future
        }
      };

      res.json(response);

    } catch (error) {
      console.error('[SpatialOperator Controller] Error getting operator detail:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * POST /api/operators/:id/execute - Execute an operator with validated input
   * Body should match the operator's inputSchema (Zod validation)
   */
  async executeOperator(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const operatorId = Array.isArray(id) ? id[0] : id;
      const input: OperatorExecuteRequest = req.body;

      const operator = SpatialOperatorRegistryInstance.getOperator(operatorId);

      if (!operator) {
        res.status(404).json({
          success: false,
          error: `Operator not found: ${operatorId}`
        });
        return;
      }

      // Validate input
      if (!input || Object.keys(input).length === 0) {
        res.status(400).json({
          success: false,
          error: 'Request body is required. Please provide input parameters.'
        });
        return;
      }

      console.log(`[SpatialOperator Controller] Executing operator: ${operatorId}`);
      console.log(`[SpatialOperator Controller] Input:`, JSON.stringify(input, null, 2));

      const startTime = Date.now();

      // Execute operator (Zod validation happens inside operator.execute())
      const result = await operator.execute(input);

      const duration = Date.now() - startTime;

      console.log(`[SpatialOperator Controller] Execution completed in ${duration}ms`);

      const response: OperatorExecuteResponse = {
        success: true,
        result,
        executedAt: new Date().toISOString(),
        duration
      };

      res.json(response);

    } catch (error) {
      console.error('[SpatialOperator Controller] Execution error:', error);
      
      // Determine error type
      let statusCode = 500;
      let errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Zod validation errors are client errors (400)
      if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
        statusCode = 400;
      }

      res.status(statusCode).json({
        success: false,
        error: errorMessage,
        executedAt: new Date().toISOString()
      });
    }
  }

  /**
   * GET /api/operators/categories - List all available operator categories
   */
  async listCategories(req: Request, res: Response): Promise<void> {
    try {
      const operators = SpatialOperatorRegistryInstance.listOperators();
      
      const categories = new Set<string>();
      operators.forEach(op => {
        if (op.category) {
          categories.add(op.category);
        }
      });

      res.json({
        success: true,
        count: categories.size,
        categories: Array.from(categories).sort()
      });

    } catch (error) {
      console.error('[SpatialOperator Controller] Error listing categories:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/operators/search - Search operators by keyword
   * Query params: ?q=buffer&category=analysis
   */
  async searchOperators(req: Request, res: Response): Promise<void> {
    try {
      const { q, category } = req.query;

      if (!q || typeof q !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Search query parameter "q" is required'
        });
        return;
      }

      const operators = SpatialOperatorRegistryInstance.listOperators();
      const operatorInstances = operators
        .map(info => SpatialOperatorRegistryInstance.getOperator(info.operatorId))
        .filter((op): op is NonNullable<typeof op> => op !== undefined);
      
      const searchTerm = q.toLowerCase();

      const filtered = operatorInstances.filter(op => {
        // Search in name, description, and operatorId
        const matchesSearch = 
          op.name.toLowerCase().includes(searchTerm) ||
          op.description.toLowerCase().includes(searchTerm) ||
          op.operatorId.toLowerCase().includes(searchTerm);

        // Filter by category if provided
        const matchesCategory = !category || 
          (typeof category === 'string' && op.category === category);

        return matchesSearch && matchesCategory;
      });

      res.json({
        success: true,
        query: q,
        count: filtered.length,
        operators: filtered.map(op => {
          const metadata = op.getMetadata();
          return {
            id: metadata.operatorId,
            name: metadata.name,
            description: metadata.description,
            category: metadata.category
          };
        })
      });

    } catch (error) {
      console.error('[SpatialOperator Controller] Search error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/operators/health - Health check endpoint
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const operatorCount = SpatialOperatorRegistryInstance.getOperatorCount();
      
      res.json({
        success: true,
        status: 'healthy',
        operatorCount,
        initialized: this.initialized,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('[SpatialOperator Controller] Health check failed:', error);
      res.status(500).json({
        success: false,
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
