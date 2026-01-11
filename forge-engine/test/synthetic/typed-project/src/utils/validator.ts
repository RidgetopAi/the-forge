export interface ValidationError {
  field: string;
  message: string;
  code: ValidationErrorCode;
}

export type ValidationErrorCode =
  | 'REQUIRED'
  | 'MIN_LENGTH'
  | 'MAX_LENGTH'
  | 'INVALID_FORMAT'
  | 'OUT_OF_RANGE'
  | 'INVALID_CHARACTERS';

export type ValidationResult<T> =
  | { valid: true; value: T; errors: never[] }
  | { valid: false; value?: undefined; errors: ValidationError[] };

export function validateEmail(email: string): ValidationResult<string> {
  if (!email || email.length === 0) {
    return {
      valid: false,
      errors: [{ field: 'email', message: 'Email is required', code: 'REQUIRED' }],
    };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return {
      valid: false,
      errors: [{ field: 'email', message: 'Invalid email format', code: 'INVALID_FORMAT' }],
    };
  }

  return { valid: true, value: email, errors: [] };
}

export function validateAge(age: number): ValidationResult<number> {
  if (!Number.isInteger(age)) {
    return {
      valid: false,
      errors: [{ field: 'age', message: 'Age must be an integer', code: 'INVALID_FORMAT' }],
    };
  }

  if (age < 0 || age > 150) {
    return {
      valid: false,
      errors: [{ field: 'age', message: 'Age must be between 0 and 150', code: 'OUT_OF_RANGE' }],
    };
  }

  return { valid: true, value: age, errors: [] };
}

export function validateUsername(username: string): ValidationResult<string> {
  if (!username || username.length === 0) {
    return {
      valid: false,
      errors: [{ field: 'username', message: 'Username is required', code: 'REQUIRED' }],
    };
  }

  if (username.length < 3) {
    return {
      valid: false,
      errors: [{ field: 'username', message: 'Username must be at least 3 characters', code: 'MIN_LENGTH' }],
    };
  }

  if (username.length > 20) {
    return {
      valid: false,
      errors: [{ field: 'username', message: 'Username must not exceed 20 characters', code: 'MAX_LENGTH' }],
    };
  }

  const validChars = /^[a-zA-Z0-9_]+$/;
  if (!validChars.test(username)) {
    return {
      valid: false,
      errors: [{ field: 'username', message: 'Username can only contain letters, numbers, and underscores', code: 'INVALID_CHARACTERS' }],
    };
  }

  return { valid: true, value: username, errors: [] };
}
