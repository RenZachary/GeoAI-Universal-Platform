export class ConversationError extends Error {
  constructor(message: string, public code: string = 'CONVERSATION_ERROR') {
    super(message);
    this.name = 'ConversationError';
  }
}

export class ValidationError extends ConversationError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends ConversationError {
  constructor(message: string) {
    super(message, 'NOT_FOUND_ERROR');
    this.name = 'NotFoundError';
  }
}
