/**
 * Cleanup Scheduler - Manages automatic cleanup of temporary files and expired services
 * Runs periodic cleanup jobs to prevent disk space exhaustion
 */

import { WorkspaceManagerInstance } from './WorkspaceManager.js';
import { MVTPublisher } from '../../utils/publishers/MVTPublisher.js';
import { WMSPublisher } from '../../utils/publishers/WMSPublisher.js';
import type Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { SQLiteManagerInstance } from '../database/SQLiteManager.js';

export interface CleanupConfig {
  tempFileMaxAge: number;        // Max age for temp files in milliseconds (default: 24 hours)
  mvtServiceMaxAge: number;      // Max age for MVT services in milliseconds (default: 7 days)
  wmsServiceMaxAge: number;      // Max age for WMS services in milliseconds (default: 7 days)
  uploadFileMaxAge: number;      // Max age for uploaded files in milliseconds (default: 30 days)
  interval: number;              // Cleanup interval in milliseconds (default: 1 hour)
  enableAutoCleanup: boolean;    // Enable automatic cleanup (default: true)
}

export interface CleanupResult {
  tempFilesDeleted: number;
  mvtServicesDeleted: number;
  wmsServicesDeleted: number;
  uploadFilesDeleted: number;
  totalSpaceFreed: number;  // In bytes
  executedAt: Date;
  duration: number;  // In milliseconds
  errors: Array<{ component: string; error: string }>;
}

export class CleanupScheduler {
  private mvtPublisher: MVTPublisher;
  private wmsPublisher: WMSPublisher;
  private db?: Database.Database;
  private config: CleanupConfig;
  private intervalId?: NodeJS.Timeout;
  private isRunning: boolean = false;

  constructor(
    workspaceBase: string,
    config?: Partial<CleanupConfig>
  ) {
    this.mvtPublisher = new MVTPublisher(workspaceBase, SQLiteManagerInstance.getDatabase());
    this.wmsPublisher = new WMSPublisher(workspaceBase, SQLiteManagerInstance.getDatabase());
    
    // Default configuration
    this.config = {
      tempFileMaxAge: 24 * 60 * 60 * 1000,           // 24 hours
      mvtServiceMaxAge: 7 * 24 * 60 * 60 * 1000,     // 7 days
      wmsServiceMaxAge: 7 * 24 * 60 * 60 * 1000,     // 7 days
      uploadFileMaxAge: 30 * 24 * 60 * 60 * 1000,    // 30 days
      interval: 60 * 60 * 1000,                       // 1 hour
      enableAutoCleanup: true,
      ...config
    };

    console.log('[Cleanup Scheduler] Initialized with config:', {
      tempFileMaxAge: this.formatDuration(this.config.tempFileMaxAge),
      mvtServiceMaxAge: this.formatDuration(this.config.mvtServiceMaxAge),
      wmsServiceMaxAge: this.formatDuration(this.config.wmsServiceMaxAge),
      interval: this.formatDuration(this.config.interval),
      enableAutoCleanup: this.config.enableAutoCleanup
    });
  }

  /**
   * Start the automatic cleanup scheduler
   */
  start(): void {
    if (!this.config.enableAutoCleanup) {
      console.log('[Cleanup Scheduler] Auto-cleanup is disabled');
      return;
    }

    if (this.intervalId) {
      console.warn('[Cleanup Scheduler] Scheduler is already running');
      return;
    }

    console.log(`[Cleanup Scheduler] Starting automatic cleanup (interval: ${this.formatDuration(this.config.interval)})`);
    
    // Run initial cleanup immediately
    this.executeCleanup().catch(error => {
      console.error('[Cleanup Scheduler] Initial cleanup failed:', error);
    });

    // Schedule periodic cleanup
    this.intervalId = setInterval(() => {
      this.executeCleanup().catch(error => {
        console.error('[Cleanup Scheduler] Scheduled cleanup failed:', error);
      });
    }, this.config.interval);
  }

  /**
   * Stop the automatic cleanup scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      console.log('[Cleanup Scheduler] Stopped');
    }
  }

  /**
   * Execute cleanup manually (can be called via API)
   */
  async executeCleanup(): Promise<CleanupResult> {
    if (this.isRunning) {
      console.warn('[Cleanup Scheduler] Cleanup already in progress, skipping');
      return {
        tempFilesDeleted: 0,
        mvtServicesDeleted: 0,
        wmsServicesDeleted: 0,
        uploadFilesDeleted: 0,
        totalSpaceFreed: 0,
        executedAt: new Date(),
        duration: 0,
        errors: [{ component: 'scheduler', error: 'Cleanup already in progress' }]
      };
    }

    this.isRunning = true;
    const startTime = Date.now();
    console.log('[Cleanup Scheduler] Starting cleanup job...');

    const result: CleanupResult = {
      tempFilesDeleted: 0,
      mvtServicesDeleted: 0,
      wmsServicesDeleted: 0,
      uploadFilesDeleted: 0,
      totalSpaceFreed: 0,
      executedAt: new Date(),
      duration: 0,
      errors: []
    };

    try {
      // 1. Clean up temporary files
      const tempResult = await this.cleanupTempFiles();
      result.tempFilesDeleted = tempResult.deletedCount;
      result.totalSpaceFreed += tempResult.spaceFreed;

      // 2. Clean up expired MVT services
      const mvtResult = await this.cleanupMVTServices();
      result.mvtServicesDeleted = mvtResult.deletedCount;
      result.totalSpaceFreed += mvtResult.spaceFreed;

      // 3. Clean up expired WMS services
      const wmsResult = await this.cleanupWMSServices();
      result.wmsServicesDeleted = wmsResult.deletedCount;
      result.totalSpaceFreed += wmsResult.spaceFreed;

      // 4. Clean up old uploaded files
      const uploadResult = await this.cleanupUploadFiles();
      result.uploadFilesDeleted = uploadResult.deletedCount;
      result.totalSpaceFreed += uploadResult.spaceFreed;

      const endTime = Date.now();
      result.duration = endTime - startTime;

      console.log('[Cleanup Scheduler] Cleanup completed:', {
        tempFilesDeleted: result.tempFilesDeleted,
        mvtServicesDeleted: result.mvtServicesDeleted,
        wmsServicesDeleted: result.wmsServicesDeleted,
        uploadFilesDeleted: result.uploadFilesDeleted,
        totalSpaceFreed: this.formatBytes(result.totalSpaceFreed),
        duration: `${result.duration}ms`,
        errors: result.errors.length
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push({ component: 'scheduler', error: errorMessage });
      console.error('[Cleanup Scheduler] Cleanup failed:', error);
      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Clean up temporary files older than configured max age
   */
  private async cleanupTempFiles(): Promise<{ deletedCount: number; spaceFreed: number }> {
    console.log('[Cleanup Scheduler] Cleaning temp files...');
    
    const tempDir = WorkspaceManagerInstance.getDirectoryPath('TEMP');
    
    if (!fs.existsSync(tempDir)) {
      console.log('[Cleanup Scheduler] Temp directory does not exist');
      return { deletedCount: 0, spaceFreed: 0 };
    }

    let deletedCount = 0;
    let spaceFreed = 0;
    const cutoffTime = Date.now() - this.config.tempFileMaxAge;

    try {
      const items = fs.readdirSync(tempDir, { withFileTypes: true });

      for (const item of items) {
        const itemPath = path.join(tempDir, item.name);
        
        try {
          const stats = fs.statSync(itemPath);
          
          // Check if file/directory is older than max age
          if (stats.mtimeMs < cutoffTime) {
            const size = this.getDirectorySize(itemPath);
            
            if (item.isDirectory()) {
              fs.rmSync(itemPath, { recursive: true, force: true });
            } else {
              fs.unlinkSync(itemPath);
            }
            
            deletedCount++;
            spaceFreed += size;
            console.log(`[Cleanup Scheduler] Deleted temp file: ${item.name} (${this.formatBytes(size)})`);
          }
        } catch (error) {
          console.warn(`[Cleanup Scheduler] Failed to process temp file: ${item.name}`, error);
        }
      }

      console.log(`[Cleanup Scheduler] Temp files cleanup: ${deletedCount} deleted, ${this.formatBytes(spaceFreed)} freed`);
      return { deletedCount, spaceFreed };

    } catch (error) {
      console.error('[Cleanup Scheduler] Temp files cleanup failed:', error);
      return { deletedCount, spaceFreed };
    }
  }

  /**
   * Clean up expired MVT tilesets
   */
  private async cleanupMVTServices(): Promise<{ deletedCount: number; spaceFreed: number }> {
    console.log('[Cleanup Scheduler] Cleaning expired MVT services...');
    
    const daysOld = Math.ceil(this.config.mvtServiceMaxAge / (24 * 60 * 60 * 1000));
    
    try {
      const deletedCount = this.mvtPublisher.cleanupExpiredTilesets(daysOld);
      
      // Estimate space freed (not exact, but good enough)
      const spaceFreed = deletedCount * 1024 * 1024; // Assume ~1MB per tileset
      
      console.log(`[Cleanup Scheduler] MVT services cleanup: ${deletedCount} deleted`);
      return { deletedCount, spaceFreed };

    } catch (error) {
      console.error('[Cleanup Scheduler] MVT services cleanup failed:', error);
      return { deletedCount: 0, spaceFreed: 0 };
    }
  }

  /**
   * Clean up expired WMS services
   */
  private async cleanupWMSServices(): Promise<{ deletedCount: number; spaceFreed: number }> {
    console.log('[Cleanup Scheduler] Cleaning expired WMS services...');
    
    const cutoffTime = Date.now() - this.config.wmsServiceMaxAge;
    let deletedCount = 0;
    let spaceFreed = 0;

    try {
      const services = this.wmsPublisher.listServices();

      for (const service of services) {
        try {
          const generatedAt = new Date(service.metadata.generatedAt).getTime();
          
          if (generatedAt < cutoffTime) {
            const serviceDir = path.join(
              WorkspaceManagerInstance.getDirectoryPath('RESULTS_WMS'),
              service.id
            );
            
            const size = this.getDirectorySize(serviceDir);
            
            if (this.wmsPublisher.deleteService(service.id)) {
              deletedCount++;
              spaceFreed += size;
              console.log(`[Cleanup Scheduler] Deleted WMS service: ${service.id} (${this.formatBytes(size)})`);
            }
          }
        } catch (error) {
          console.warn(`[Cleanup Scheduler] Failed to process WMS service: ${service.id}`, error);
        }
      }

      console.log(`[Cleanup Scheduler] WMS services cleanup: ${deletedCount} deleted, ${this.formatBytes(spaceFreed)} freed`);
      return { deletedCount, spaceFreed };

    } catch (error) {
      console.error('[Cleanup Scheduler] WMS services cleanup failed:', error);
      return { deletedCount: 0, spaceFreed: 0 };
    }
  }

  /**
   * Clean up old uploaded files
   * NOTE: This is disabled because data/local is the user's workspace directory
   * and should never be automatically cleaned up.
   */
  private async cleanupUploadFiles(): Promise<{ deletedCount: number; spaceFreed: number }> {
    console.log('[Cleanup Scheduler] Skipping uploaded files cleanup (user workspace directory)');
    
    // Disabled: data/local is the user's workspace and should not be auto-cleaned
    return { deletedCount: 0, spaceFreed: 0 };
  }

  /**
   * Get directory size recursively
   */
  private getDirectorySize(dirPath: string): number {
    let size = 0;
    
    try {
      if (!fs.existsSync(dirPath)) {
        return 0;
      }

      const stats = fs.statSync(dirPath);
      
      if (stats.isFile()) {
        return stats.size;
      }

      const items = fs.readdirSync(dirPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        size += this.getDirectorySize(itemPath);
      }
    } catch (error) {
      console.warn(`[Cleanup Scheduler] Failed to calculate directory size: ${dirPath}`, error);
    }
    
    return size;
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format milliseconds to human-readable duration
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }

  /**
   * Get cleanup statistics
   */
  getStats(): {
    tempDirSize: number;
    mvtServiceCount: number;
    wmsServiceCount: number;
    dataLocalSize: number;
  } {
    const tempDir = WorkspaceManagerInstance.getDirectoryPath('TEMP');
    const dataLocalDir = WorkspaceManagerInstance.getDirectoryPath('DATA_LOCAL');
    const mvtDir = WorkspaceManagerInstance.getDirectoryPath('RESULTS_MVT');
    const wmsDir = WorkspaceManagerInstance.getDirectoryPath('RESULTS_WMS');

    return {
      tempDirSize: this.getDirectorySize(tempDir),
      mvtServiceCount: this.mvtPublisher.listTilesets().length,
      wmsServiceCount: this.wmsPublisher.listServices().length,
      dataLocalSize: this.getDirectorySize(dataLocalDir)
    };
  }
}

