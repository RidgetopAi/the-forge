/**
 * HTTP utilities - depends on helpers
 * Dependency: http → helpers
 */
import { logRequest, buildQueryString } from './helpers';

export interface HttpConfig {
  baseUrl: string;
  timeout: number;
  headers?: Record<string, string>;
}

export interface HttpResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

export class HttpClient {
  private config: HttpConfig;

  constructor(config: HttpConfig) {
    this.config = config;
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<HttpResponse<T>> {
    const url = this.buildUrl(path, params);
    logRequest(`GET ${url}`);

    // Simulated response
    return {
      data: {} as T,
      status: 200,
      headers: {},
    };
  }

  async post<T>(path: string, body: unknown): Promise<HttpResponse<T>> {
    const url = this.buildUrl(path);
    logRequest(`POST ${url}`);

    // Simulated response
    return {
      data: {} as T,
      status: 201,
      headers: {},
    };
  }

  setAuthHeader(token: string): void {
    this.config.headers = {
      ...this.config.headers,
      Authorization: `Bearer ${token}`,
    };
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    let url = `${this.config.baseUrl}${path}`;
    if (params && Object.keys(params).length > 0) {
      url += `?${buildQueryString(params)}`;
    }
    return url;
  }
}
