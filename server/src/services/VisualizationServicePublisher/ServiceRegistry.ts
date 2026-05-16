import type Database from 'better-sqlite3';
import type { VisualizationServiceInfo, ServiceRegistry, ServiceType } from './interface';

export class InMemoryServiceRegistry implements ServiceRegistry {
  private services: Map<string, VisualizationServiceInfo> = new Map();
  private db?: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db;
    if (db) {
      this.initializeDatabase();
    }
  }

  private initializeDatabase(): void {
    if (!this.db) {
      console.warn('[InMemoryServiceRegistry] Database is not initialized');
      return;
    }
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS visualization_services (
          service_id TEXT PRIMARY KEY,
          service_type TEXT NOT NULL,
          url TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME,
          ttl INTEGER,
          last_accessed_at DATETIME,
          access_count INTEGER DEFAULT 0,
          metadata_json TEXT
        )
      `);

      // Load existing services from database
      this.loadFromDatabase();
    } catch (error) {
      console.error('[InMemoryServiceRegistry] Failed to initialize database:', error);
    }
  }

  private loadFromDatabase(): void {
    try {
      if (!this.db) {
        console.warn('[InMemoryServiceRegistry] Database is not initialized');
        return;
      }
      const rows = this.db.prepare('SELECT * FROM visualization_services').all() as any[];
      for (const row of rows) {
        const metadata: VisualizationServiceInfo = {
          id: row.service_id,
          type: row.service_type,
          url: row.url,
          createdAt: new Date(row.created_at),
          expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
          ttl: row.ttl,
          lastAccessedAt: row.last_accessed_at ? new Date(row.last_accessed_at) : undefined,
          accessCount: row.access_count || 0,
          metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined
        };
        this.services.set(metadata.id, metadata);
      }
      console.log(`[InMemoryServiceRegistry] Loaded ${this.services.size} services from database`);
    } catch (error) {
      console.error('[InMemoryServiceRegistry] Failed to load services from database:', error);
    }
  }

  get(serviceId: string): VisualizationServiceInfo | null {
    const service = this.services.get(serviceId);
    if (service) {
      // Update access tracking
      service.lastAccessedAt = new Date();
      service.accessCount = (service.accessCount || 0) + 1;

      // Persist to database if available
      if (this.db) {
        this.persistToDatabase(service);
      }
    }
    return service || null;
  }

  list(type?: ServiceType): VisualizationServiceInfo[] {
    const services = Array.from(this.services.values());
    return type ? services.filter(s => s.type === type) : services;
  }

  register(metadata: VisualizationServiceInfo): void {
    this.services.set(metadata.id, metadata);

    // Persist to database if available
    if (this.db) {
      this.persistToDatabase(metadata);
    }
  }

  unregister(serviceId: string): void {
    this.services.delete(serviceId);

    // Remove from database if available
    if (this.db) {
      try {
        this.db.prepare('DELETE FROM visualization_services WHERE service_id = ?').run(serviceId);
      } catch (error) {
        console.error('[InMemoryServiceRegistry] Failed to delete service from database:', error);
      }
    }
  }

  updateLastAccessed(serviceId: string): void {
    const service = this.services.get(serviceId);
    if (service) {
      service.lastAccessedAt = new Date();
      service.accessCount = (service.accessCount || 0) + 1;

      if (this.db) {
        this.persistToDatabase(service);
      }
    }
  }

  private persistToDatabase(metadata: VisualizationServiceInfo): void {
    try {
      if (!this.db) {
        console.warn('[InMemoryServiceRegistry] Database is not initialized');
        return;
      }
      this.db.prepare(`
        INSERT OR REPLACE INTO visualization_services 
        (service_id, service_type, url, created_at, expires_at, ttl, last_accessed_at, access_count, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        metadata.id,
        metadata.type,
        metadata.url,
        metadata.createdAt.toISOString(),
        metadata.expiresAt?.toISOString(),
        metadata.ttl,
        metadata.lastAccessedAt?.toISOString(),
        metadata.accessCount,
        metadata.metadata ? JSON.stringify(metadata.metadata) : null
      );
    } catch (error) {
      console.error('[InMemoryServiceRegistry] Failed to persist service to database:', error);
    }
  }

  /**
   * Get expired services for cleanup
   */
  getExpiredServices(): VisualizationServiceInfo[] {
    const now = new Date();
    return Array.from(this.services.values()).filter(service => {
      if (service.expiresAt && service.expiresAt < now) {
        return true;
      }
      return false;
    });
  }

  /**
   * Clear all services (for testing)
   */
  clear(): void {
    this.services.clear();
    if (this.db) {
      try {
        this.db.exec('DELETE FROM visualization_services');
      } catch (error) {
        console.error('[InMemoryServiceRegistry] Failed to clear database:', error);
      }
    }
  }
}
