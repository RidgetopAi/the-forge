/**
 * Entry point - imports from both utils and services
 * Dependency chain: index → services → utils
 */
import { formatResponse, logRequest } from './utils/helpers';
import { HttpClient } from './utils/http';
import { ApiService } from './services/api';
import { AuthService } from './services/auth';

// Initialize HTTP client
const httpClient = new HttpClient({
  baseUrl: 'https://api.example.com',
  timeout: 5000,
});

// Initialize services with dependencies
const authService = new AuthService();
const apiService = new ApiService(httpClient, authService);

async function main(): Promise<void> {
  logRequest('Starting application');

  try {
    // Authenticate
    const token = await authService.login('user', 'pass');
    console.log('Authenticated:', formatResponse({ token }));

    // Make API call
    const users = await apiService.getUsers();
    console.log('Users:', formatResponse({ count: users.length }));
  } catch (error) {
    console.error('Error:', error);
  }
}

main();

export { apiService, authService, httpClient };
