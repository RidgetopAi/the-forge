/**
 * Worker Tools - Production-grade tool definitions and execution
 *
 * Workers use these tools to explore codebases autonomously rather than
 * receiving pre-gathered context dumps.
 *
 * Tools:
 * - glob: Find files matching a pattern
 * - read: Read file contents
 * - grep: Search for patterns in files
 */

import * as fs from 'fs';
import * as path from 'path';
import { globSync } from 'glob';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';

// ============================================================================
// Tool Definitions (Anthropic tool_use format)
// ============================================================================

export const WORKER_TOOLS: Tool[] = [
  {
    name: 'glob',
    description: 'Find files matching a glob pattern. Returns a list of relative file paths.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description: 'Glob pattern like "**/*.ts", "src/routes/*.ts", or "*.json"'
        }
      },
      required: ['pattern']
    }
  },
  {
    name: 'read',
    description: 'Read the contents of a file. Returns the file content as text.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the file from project root'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'grep',
    description: 'Search for a pattern in files. Returns matching lines with file paths and line numbers.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description: 'Regular expression pattern to search for'
        },
        path: {
          type: 'string',
          description: 'Optional: file or directory to search in (defaults to entire project)'
        }
      },
      required: ['pattern']
    }
  },
  {
    name: 'submit_result',
    description: 'Submit your final findings. Call this when you have finished exploring and are ready to return your structured results. This must be your final action.',
    input_schema: {
      type: 'object' as const,
      properties: {
        result: {
          type: 'object',
          description: 'Your structured findings in the format specified by your task instructions'
        },
        confidence: {
          type: 'number',
          description: 'Your confidence level from 0-100 in the completeness and accuracy of your findings'
        }
      },
      required: ['result', 'confidence']
    }
  }
];

// ============================================================================
// Tool Execution
// ============================================================================

export interface ToolInput {
  pattern?: string;
  path?: string;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * Execute a tool and return the result
 */
export function executeTool(
  name: string,
  input: ToolInput,
  projectRoot: string
): ToolResult {
  try {
    switch (name) {
      case 'glob':
        return executeGlob(input.pattern!, projectRoot);

      case 'read':
        return executeRead(input.path!, projectRoot);

      case 'grep':
        return executeGrep(input.pattern!, projectRoot, input.path);

      default:
        return {
          success: false,
          output: '',
          error: `Unknown tool: ${name}`
        };
    }
  } catch (err) {
    return {
      success: false,
      output: '',
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

/**
 * Find files matching a glob pattern
 */
function executeGlob(pattern: string, projectRoot: string): ToolResult {
  const matches = globSync(pattern, {
    cwd: projectRoot,
    nodir: true,
    ignore: ['**/node_modules/**', '**/.git/**', '**/ground-truth.json']
  });

  if (matches.length === 0) {
    return {
      success: true,
      output: 'No files found matching pattern.'
    };
  }

  // Limit results to avoid overwhelming context
  const maxResults = 100;
  const truncated = matches.length > maxResults;
  const resultList = matches.slice(0, maxResults);

  let output = resultList.join('\n');
  if (truncated) {
    output += `\n\n(Showing ${maxResults} of ${matches.length} matches. Refine your pattern for more specific results.)`;
  }

  return {
    success: true,
    output
  };
}

/**
 * Read file contents
 */
function executeRead(filePath: string, projectRoot: string): ToolResult {
  // Security: Ensure path is within project root
  const absolutePath = path.resolve(projectRoot, filePath);
  if (!absolutePath.startsWith(projectRoot)) {
    return {
      success: false,
      output: '',
      error: 'Access denied: Path is outside project root'
    };
  }

  // Block access to test ground truth (prevent data leakage)
  if (filePath.includes('ground-truth.json')) {
    return {
      success: false,
      output: '',
      error: 'Access denied: Test data files are not accessible'
    };
  }

  if (!fs.existsSync(absolutePath)) {
    return {
      success: false,
      output: '',
      error: `File not found: ${filePath}`
    };
  }

  const stats = fs.statSync(absolutePath);
  if (stats.isDirectory()) {
    return {
      success: false,
      output: '',
      error: `Path is a directory, not a file: ${filePath}`
    };
  }

  // Check file size - limit to 100KB to avoid overwhelming context
  const maxSize = 100 * 1024;
  if (stats.size > maxSize) {
    const content = fs.readFileSync(absolutePath, 'utf-8').slice(0, maxSize);
    return {
      success: true,
      output: content + `\n\n[File truncated at ${maxSize} bytes. Total size: ${stats.size} bytes]`
    };
  }

  const content = fs.readFileSync(absolutePath, 'utf-8');
  return {
    success: true,
    output: content
  };
}

/**
 * Search for pattern in files
 */
function executeGrep(
  pattern: string,
  projectRoot: string,
  searchPath?: string
): ToolResult {
  const searchRoot = searchPath
    ? path.resolve(projectRoot, searchPath)
    : projectRoot;

  // Security check
  if (!searchRoot.startsWith(projectRoot)) {
    return {
      success: false,
      output: '',
      error: 'Access denied: Search path is outside project root'
    };
  }

  // If searchPath is a file, search just that file
  if (searchPath && fs.existsSync(searchRoot) && fs.statSync(searchRoot).isFile()) {
    return grepFile(searchRoot, pattern, projectRoot);
  }

  // Otherwise, search directory recursively
  const files = globSync('**/*.{ts,tsx,js,jsx,json,md}', {
    cwd: searchRoot,
    nodir: true,
    ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**']
  });

  const results: string[] = [];
  const maxMatches = 50;
  let totalMatches = 0;

  for (const file of files) {
    if (totalMatches >= maxMatches) break;

    const absolutePath = path.join(searchRoot, file);
    const relativePath = path.relative(projectRoot, absolutePath);

    try {
      const content = fs.readFileSync(absolutePath, 'utf-8');
      const lines = content.split('\n');
      const regex = new RegExp(pattern, 'gi');

      for (let i = 0; i < lines.length && totalMatches < maxMatches; i++) {
        if (regex.test(lines[i])) {
          results.push(`${relativePath}:${i + 1}: ${lines[i].trim()}`);
          totalMatches++;
        }
        // Reset regex lastIndex for global flag
        regex.lastIndex = 0;
      }
    } catch {
      // Skip files that can't be read (binary, etc.)
      continue;
    }
  }

  if (results.length === 0) {
    return {
      success: true,
      output: 'No matches found.'
    };
  }

  let output = results.join('\n');
  if (totalMatches >= maxMatches) {
    output += `\n\n(Showing first ${maxMatches} matches. Refine your pattern for more specific results.)`;
  }

  return {
    success: true,
    output
  };
}

/**
 * Grep a single file
 */
function grepFile(
  absolutePath: string,
  pattern: string,
  projectRoot: string
): ToolResult {
  const relativePath = path.relative(projectRoot, absolutePath);

  try {
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const lines = content.split('\n');
    const regex = new RegExp(pattern, 'gi');
    const results: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        results.push(`${relativePath}:${i + 1}: ${lines[i].trim()}`);
      }
      regex.lastIndex = 0;
    }

    if (results.length === 0) {
      return {
        success: true,
        output: 'No matches found.'
      };
    }

    return {
      success: true,
      output: results.join('\n')
    };
  } catch (err) {
    return {
      success: false,
      output: '',
      error: `Error reading file: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}

// ============================================================================
// Context Building Utilities
// ============================================================================

/**
 * Build minimal context for a worker - just enough to get started
 */
export function buildMinimalContext(projectRoot: string): string {
  // Get high-level file tree (just top-level structure)
  const topLevel = fs.readdirSync(projectRoot, { withFileTypes: true })
    .filter(entry => !entry.name.startsWith('.') && entry.name !== 'node_modules')
    .map(entry => entry.isDirectory() ? `${entry.name}/` : entry.name)
    .sort();

  return `PROJECT STRUCTURE (top-level):
${topLevel.join('\n')}

You have access to tools for exploring this codebase:
- glob(pattern): Find files matching a glob pattern (e.g., "**/*.ts", "src/**/*.tsx")
- read(path): Read the contents of a file
- grep(pattern, path?): Search for text patterns in files

Use these tools to gather the information you need to complete the task.`;
}

/**
 * Get a summary of the project for initial context
 */
export function getProjectSummary(projectRoot: string): string {
  const parts: string[] = [];

  // Check for package.json
  const pkgPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      parts.push(`Project: ${pkg.name || 'Unknown'}`);
      if (pkg.description) parts.push(`Description: ${pkg.description}`);

      const deps = Object.keys(pkg.dependencies || {});
      if (deps.length > 0) {
        parts.push(`Key dependencies: ${deps.slice(0, 10).join(', ')}${deps.length > 10 ? '...' : ''}`);
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Count files by type
  const allFiles = globSync('**/*.{ts,tsx,js,jsx}', {
    cwd: projectRoot,
    nodir: true,
    ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**']
  });

  const byExt: Record<string, number> = {};
  for (const file of allFiles) {
    const ext = path.extname(file);
    byExt[ext] = (byExt[ext] || 0) + 1;
  }

  if (Object.keys(byExt).length > 0) {
    const counts = Object.entries(byExt)
      .map(([ext, count]) => `${ext}: ${count}`)
      .join(', ');
    parts.push(`File counts: ${counts}`);
  }

  return parts.join('\n');
}
