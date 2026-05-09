/**
 * Tool Controller - Manages spatial operators via API
 * 
 * DEPRECATED: This controller will be replaced by SpatialOperatorController in v2.1
 */

import type { Request, Response } from 'express';
import { SpatialOperatorRegistryInstance, registerAllOperators } from '../../spatial-operators';
import { SQLiteManagerInstance } from '../../storage';

export class ToolController {
  private workspaceBase: string;

  constructor(workspaceBase?: string) {
    this.workspaceBase = workspaceBase || process.cwd();
  }

  /**
   * Initialize spatial operators
   */
  async initialize(): Promise<void> {
    console.log('[Tool Controller] Initializing spatial operators...');
    const db = SQLiteManagerInstance.getDatabase();
    registerAllOperators(db, this.workspaceBase);
    console.log(`[Tool Controller] Registered ${SpatialOperatorRegistryInstance.getOperatorCount()} operators`);
  }

  /**
   * GET /api/tools - List all available operators
   */
  async listTools(req: Request, res: Response): Promise<void> {
    try {
      const operators = SpatialOperatorRegistryInstance.listOperators();

      res.json({
        success: true,
        count: operators.length,
        tools: operators.map(op => ({
          id: op.operatorId,
          name: op.name,
          description: op.description,
          category: op.category
        }))
      });

    } catch (error) {
      console.error('[Tool Controller] Error listing operators:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/tools/:id - Get specific operator details
   */
  async getTool(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const operatorId = Array.isArray(id) ? id[0] : id;
      const operator = SpatialOperatorRegistryInstance.getOperator(operatorId);

      if (!operator) {
        res.status(404).json({
          success: false,
          error: `Operator not found: ${id}`
        });
        return;
      }

      const metadata = operator.getMetadata();

      res.json({
        success: true,
        tool: {
          id: metadata.operatorId,
          name: metadata.name,
          description: metadata.description,
          category: metadata.category,
          inputSchema: metadata.inputSchema,
          outputSchema: metadata.outputSchema
        }
      });

    } catch (error) {
      console.error('[Tool Controller] Error getting operator:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * POST /api/tools/:id/execute - Execute an operator manually
   */
  async executeTool(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const operatorId = Array.isArray(id) ? id[0] : id;
      const parameters = req.body;

      const operator = SpatialOperatorRegistryInstance.getOperator(operatorId);

      if (!operator) {
        res.status(404).json({
          success: false,
          error: `Operator not found: ${id}`
        });
        return;
      }

      console.log(`[Tool Controller] Executing operator: ${id}`);

      // Execute the operator
      const result = await operator.execute(parameters, {
        db: SQLiteManagerInstance.getDatabase(),
        workspaceBase: this.workspaceBase
      });

      res.json({
        success: result.success,
        toolId: operatorId,
        result: result.data || result.error
      });

    } catch (error) {
      console.error('[Tool Controller] Error executing operator:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * POST /api/tools/register - Register a custom operator (placeholder)
   */
  async registerTool(req: Request, res: Response): Promise<void> {
    try {
      res.status(501).json({
        success: false,
        error: 'Custom operator registration not yet implemented in v2.0. Use SpatialOperator pattern.'
      });

    } catch (error) {
      console.error('[Tool Controller] Error registering operator:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * DELETE /api/tools/:id - Unregister an operator (placeholder)
   */
  async unregisterTool(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const operatorId = Array.isArray(id) ? id[0] : id;

      if (!SpatialOperatorRegistryInstance.hasOperator(operatorId)) {
        res.status(404).json({
          success: false,
          error: `Operator not found: ${id}`
        });
        return;
      }

      SpatialOperatorRegistryInstance.unregister(operatorId);

      res.json({
        success: true,
        message: `Operator unregistered: ${operatorId}`
      });

    } catch (error) {
      console.error('[Tool Controller] Error unregistering operator:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
