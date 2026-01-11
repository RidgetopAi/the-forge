/**
 * Pure utility functions - no external dependencies
 * These are leaf nodes in the dependency graph
 */

export function formatResponse(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function logRequest(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

export function parseQueryString(query: string): Record<string, string> {
  const params: Record<string, string> = {};
  const pairs = query.replace(/^\?/, '').split('&');

  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key) {
      params[decodeURIComponent(key)] = decodeURIComponent(value || '');
    }
  }

  return params;
}

export function buildQueryString(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
