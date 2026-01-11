// Pattern: Fetch wrapper with type safety
interface RequestConfig {
  baseUrl: string;
  headers?: Record<string, string>;
  timeout?: number;
}

interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

// Pattern: Typed API client class
class ApiClient {
  private config: RequestConfig;

  constructor(config: RequestConfig) {
    this.config = config;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeout = this.config.timeout || 10000;

    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.config.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as T;

      return { data, status: response.status, headers: response.headers };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async get<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', path, body);
  }

  async delete<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path);
  }
}

// Pattern: Request queue for rate limiting
class RequestQueue {
  private queue: Array<() => Promise<unknown>> = [];
  private running = 0;
  private maxConcurrent: number;

  constructor(maxConcurrent = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          resolve(await fn());
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.running++;
    const task = this.queue.shift()!;

    try {
      await task();
    } finally {
      this.running--;
      this.processQueue();
    }
  }
}

// Pattern: Retry logic with jitter
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  jitter: boolean;
}

async function fetchWithRetry<T>(
  url: string,
  options: RequestInit,
  config: RetryConfig
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json() as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < config.maxRetries) {
        const delay = Math.min(
          config.baseDelay * Math.pow(2, attempt),
          config.maxDelay
        );
        const jitter = config.jitter ? Math.random() * delay * 0.1 : 0;
        await new Promise(r => setTimeout(r, delay + jitter));
      }
    }
  }

  throw lastError;
}

// Pattern: Response caching
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class ResponseCache {
  private cache = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.data as T;
  }

  set<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, { data, timestamp: Date.now(), ttl });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

// Pattern: Request deduplication
class RequestDeduplicator {
  private pending = new Map<string, Promise<unknown>>();

  async dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = fn().finally(() => {
      this.pending.delete(key);
    });

    this.pending.set(key, promise);
    return promise;
  }
}

// Pattern: Polling with backoff
async function pollUntil<T>(
  fn: () => Promise<T>,
  predicate: (result: T) => boolean,
  options: { interval: number; timeout: number; backoff?: number }
): Promise<T> {
  const startTime = Date.now();
  let currentInterval = options.interval;

  while (Date.now() - startTime < options.timeout) {
    const result = await fn();
    if (predicate(result)) {
      return result;
    }

    await new Promise(r => setTimeout(r, currentInterval));

    if (options.backoff) {
      currentInterval = Math.min(currentInterval * options.backoff, options.timeout / 2);
    }
  }

  throw new Error('Polling timeout exceeded');
}

export {
  ApiClient,
  RequestQueue,
  ResponseCache,
  RequestDeduplicator,
  fetchWithRetry,
  pollUntil,
  type RequestConfig,
  type ApiResponse,
  type RetryConfig,
};
