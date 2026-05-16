export class FileUploadError extends Error {
  constructor(message: string, public code: string = 'FILE_UPLOAD_ERROR') {
    super(message);
    this.name = 'FileUploadError';
  }
}

export class ValidationError extends FileUploadError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class FormatError extends FileUploadError {
  constructor(message: string) {
    super(message, 'FORMAT_ERROR');
    this.name = 'FormatError';
  }
}
