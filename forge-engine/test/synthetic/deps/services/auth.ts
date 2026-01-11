/**
 * Auth Service - depends on helpers
 * Dependency: auth → helpers
 */
import { logRequest, delay } from '../utils/helpers';

export interface AuthCredentials {
  username: string;
  password: string;
}

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class AuthService {
  private token: AuthToken | null = null;

  async login(username: string, password: string): Promise<string> {
    logRequest(`Authenticating user: ${username}`);

    // Simulate API delay
    await delay(100);

    // Mock authentication
    this.token = {
      accessToken: `mock-token-${Date.now()}`,
      refreshToken: `mock-refresh-${Date.now()}`,
      expiresAt: Date.now() + 3600000,
    };

    return this.token.accessToken;
  }

  async logout(): Promise<void> {
    logRequest('Logging out');
    this.token = null;
  }

  getToken(): string | null {
    if (!this.token) return null;

    // Check if expired
    if (Date.now() > this.token.expiresAt) {
      this.token = null;
      return null;
    }

    return this.token.accessToken;
  }

  isAuthenticated(): boolean {
    return this.getToken() !== null;
  }

  async refreshToken(): Promise<string | null> {
    if (!this.token?.refreshToken) return null;

    logRequest('Refreshing token');
    await delay(50);

    this.token = {
      ...this.token,
      accessToken: `refreshed-token-${Date.now()}`,
      expiresAt: Date.now() + 3600000,
    };

    return this.token.accessToken;
  }
}
