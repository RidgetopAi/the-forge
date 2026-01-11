// Pattern: Custom Error Types
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public readonly fields: Record<string, string[]>) {
    super(message, 'VALIDATION_ERROR', 400, { fields });
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} with id '${id}' not found`, 'NOT_FOUND', 404, { resource, id });
    this.name = 'NotFoundError';
  }
}

// Pattern: Result type (Railway-oriented programming)
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// Pattern: Result utilities
function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (result.ok) {
    return ok(fn(result.value));
  }
  return result;
}

async function tryCatchAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    const value = await fn();
    return ok(value);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

// Pattern: Error boundary helper for sync functions
function tryCatch<T>(fn: () => T): Result<T, Error> {
  try {
    return ok(fn());
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

// Pattern: Exhaustive error handling with type narrowing
type ApiError =
  | { type: 'network'; message: string }
  | { type: 'validation'; fields: Record<string, string> }
  | { type: 'auth'; reason: 'expired' | 'invalid' }
  | { type: 'server'; statusCode: number };

function handleApiError(error: ApiError): string {
  switch (error.type) {
    case 'network':
      return `Network error: ${error.message}`;
    case 'validation':
      return `Validation failed: ${Object.keys(error.fields).join(', ')}`;
    case 'auth':
      return error.reason === 'expired' ? 'Session expired' : 'Invalid credentials';
    case 'server':
      return `Server error (${error.statusCode})`;
    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = error;
      return _exhaustive;
  }
}

// Pattern: Error aggregation
class ErrorAggregator {
  private errors: Error[] = [];

  add(error: Error): void {
    this.errors.push(error);
  }

  addIf(condition: boolean, error: Error): void {
    if (condition) {
      this.errors.push(error);
    }
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  getErrors(): Error[] {
    return [...this.errors];
  }

  throwIfErrors(): void {
    if (this.hasErrors()) {
      throw new AggregateError(this.errors, `${this.errors.length} errors occurred`);
    }
  }
}

// Pattern: Retry with exponential backoff
interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  shouldRetry?: (error: Error) => boolean;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxAttempts, baseDelay, maxDelay, shouldRetry = () => true } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts || !shouldRetry(lastError)) {
        throw lastError;
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export {
  Result,
  ok,
  err,
  mapResult,
  tryCatch,
  tryCatchAsync,
  handleApiError,
  ErrorAggregator,
  withRetry,
  type ApiError,
  type RetryOptions,
};
