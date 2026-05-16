import fs from 'fs';
import path from 'path';

export class FilenameDecoder {
  decodeFilename(filename: string): string {
    let decoded = filename;
    let success = false;

    const rawBytes = Buffer.from(filename, 'binary');
    const hasHighBytes = rawBytes.some(b => b > 127);

    if (hasHighBytes) {
      try {
        const utf8Str = rawBytes.toString('utf-8');
        if (!utf8Str.includes('\ufffd')) {
          decoded = utf8Str;
          success = true;
        }
      } catch (e) {
        console.warn('[FilenameDecoder] Binary to UTF-8 conversion failed', e);
      }
    }

    if (!success) {
      try {
        decoded = decodeURIComponent(filename);
        success = true;
      } catch (e) {
        console.warn('[FilenameDecoder] decodeURIComponent failed', e);
      }
    }

    return decoded;
  }

  handleDuplicateFile(uploadDir: string, decodedFileName: string, tempFilePath: string): string {
    let finalFilePath = path.join(uploadDir, decodedFileName);

    if (fs.existsSync(tempFilePath) && tempFilePath !== finalFilePath) {
      if (fs.existsSync(finalFilePath)) {
        finalFilePath = this.findAvailablePath(uploadDir, decodedFileName);
        fs.renameSync(tempFilePath, finalFilePath);
      } else {
        fs.renameSync(tempFilePath, finalFilePath);
      }
    } else if (fs.existsSync(finalFilePath) && tempFilePath === finalFilePath) {
      finalFilePath = this.findAvailablePath(uploadDir, decodedFileName);
      fs.renameSync(finalFilePath, finalFilePath.replace(path.basename(finalFilePath), path.basename(finalFilePath)));
    }

    return finalFilePath;
  }

  private findAvailablePath(uploadDir: string, fileName: string): string {
    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);
    let counter = 1;
    let newFilePath = path.join(uploadDir, fileName);

    while (fs.existsSync(newFilePath)) {
      newFilePath = path.join(uploadDir, `${baseName}(${counter})${ext}`);
      counter++;
    }

    return newFilePath;
  }
}
