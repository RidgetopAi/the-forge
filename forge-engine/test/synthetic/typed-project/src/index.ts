import { validateEmail, validateAge, validateUsername, ValidationResult } from './utils/validator';

interface UserInput {
  username: string;
  email: string;
  age: number;
}

function validateUserInput(input: UserInput): ValidationResult<UserInput> {
  const usernameResult = validateUsername(input.username);
  if (!usernameResult.valid) {
    return usernameResult as ValidationResult<UserInput>;
  }

  const emailResult = validateEmail(input.email);
  if (!emailResult.valid) {
    return emailResult as ValidationResult<UserInput>;
  }

  const ageResult = validateAge(input.age);
  if (!ageResult.valid) {
    return ageResult as ValidationResult<UserInput>;
  }

  return {
    valid: true,
    value: input,
    errors: [],
  };
}

// Example usage
const testInput: UserInput = {
  username: 'john_doe',
  email: 'john@example.com',
  age: 25,
};

const result = validateUserInput(testInput);

if (result.valid) {
  console.log('Valid user:', result.value);
} else {
  console.error('Validation errors:', result.errors);
}

export { validateUserInput, type UserInput };
