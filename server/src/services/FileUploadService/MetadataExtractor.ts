import { DataAccessFacade } from '../../data-access';
import type { NativeData } from '../../core';
import { FileUploadError } from './errors';

export class MetadataExtractor {
  private dataAccess: DataAccessFacade;

  constructor(workspaceBase?: string) {
    this.dataAccess = DataAccessFacade.getInstance(workspaceBase);
  }

  async extractMetadata(filePath: string, type: string): Promise<NativeData> {
    try {
      const nativeData = await this.dataAccess.read(type, filePath);
      
      nativeData.reference = filePath;
      
      // console.log(`[MetadataExtractor] Metadata extracted: ${JSON.stringify(nativeData.metadata)}`);
      return nativeData;
    } catch (error) {
      throw new FileUploadError(`Failed to extract metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
