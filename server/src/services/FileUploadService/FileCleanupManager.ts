import fs from 'fs';

export class FileCleanupManager {
  cleanupFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[FileCleanupManager] Cleaned up file: ${filePath}`);
      }
    } catch (error) {
      console.error(`[FileCleanupManager] Failed to cleanup file ${filePath}:`, error);
    }
  }

  cleanupFiles(filePaths: string[]): void {
    filePaths.forEach(path => this.cleanupFile(path));
  }
}
