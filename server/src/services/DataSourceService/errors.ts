export class DataSourceError extends Error {
  constructor(message: string, public code: string = 'DATA_SOURCE_ERROR') {
    super(message);
    this.name = 'DataSourceError';
  }
}

export class ConnectionError extends DataSourceError {
  constructor(message: string) {
    super(message, 'CONNECTION_ERROR');
    this.name = 'ConnectionError';
  }
}

export class ValidationError extends DataSourceError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}
