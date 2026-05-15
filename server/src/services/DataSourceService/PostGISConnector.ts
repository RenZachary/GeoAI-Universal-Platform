import { DataAccessFacade } from '../../data-access';
import type { PostGISConnectionConfig } from '../../core';
import { ConnectionError } from './errors';

export class PostGISConnector {
  private dataAccess: DataAccessFacade;

  constructor(workspaceBase?: string) {
    this.dataAccess = DataAccessFacade.getInstance(workspaceBase);
  }

  async testConnection(config: PostGISConnectionConfig): Promise<void> {
    console.log(`[PostGISConnector] Testing connection to ${config.host}:${config.port || 5432}/${config.database}`);

    this.dataAccess.configurePostGIS({
      host: config.host,
      port: config.port || 5432,
      database: config.database,
      user: config.user,
      password: config.password,
      schema: config.schema || 'public'
    });

    const postGISBackend = this.dataAccess.getPostGISBackend();
    if (!postGISBackend) {
      throw new ConnectionError('PostGIS backend not configured');
    }
    
    const isConnected = await (postGISBackend as any).testConnection();

    if (!isConnected) {
      throw new ConnectionError('Failed to connect to PostGIS database. Please check credentials.');
    }

    console.log('[PostGISConnector] Connection successful');
  }

  configurePostGIS(config: PostGISConnectionConfig): void {
    this.dataAccess.configurePostGIS(config);
  }

  getPostGISBackend(): any {
    return this.dataAccess.getPostGISBackend();
  }
}
