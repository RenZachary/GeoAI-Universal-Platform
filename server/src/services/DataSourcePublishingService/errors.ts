export class PublishingError extends Error {
  constructor(message: string, public code: string = 'PUBLISHING_ERROR') {
    super(message);
    this.name = 'PublishingError';
  }
}

export class ValidationError extends PublishingError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends PublishingError {
  constructor(message: string) {
    super(message, 'NOT_FOUND_ERROR');
    this.name = 'NotFoundError';
  }
}
