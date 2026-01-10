/**
 * Context Budget Manager
 *
 * i[16] Implementation: Addresses Hard Problem #4 from the seed document.
 *
 * "Context window is the hard constraint. Can't dump everything in.
 * Must be selective. What's the injection strategy? How do you decide what's relevant?"
 *
 * This module provides:
 * 1. TokenCounter - Estimate token counts without API calls
 * 2. ContextBudgetManager - Allocate budget across categories
 * 3. FileContentExtractor - Extract key structures instead of dumb truncation
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// Token Counter
// ============================================================================

/**
 * Estimates token count from text without API calls.
 *
 * Claude tokenization rules (approximation):
 * - Average English: ~4 chars per token
 * - Code: ~3.5 chars per token (more tokens due to special chars)
 * - Pure symbols: ~2 chars per token
 *
 * This is deliberately conservative to avoid overflow.
 */
export class TokenCounter {
  /**
   * Estimate token count for text
   */
  static estimate(text: string): number {
    if (!text) return 0;

    // Count different character types
    const alphanumeric = (text.match(/[a-zA-Z0-9]/g) || []).length;
    const whitespace = (text.match(/\s/g) || []).length;
    const symbols = text.length - alphanumeric - whitespace;

    // Weighted calculation (conservative)
    // - Alphanumeric: 4 chars = 1 token
    // - Whitespace: 6 chars = 1 token (often merged)
    // - Symbols: 2 chars = 1 token (often individual tokens)
    const tokens = Math.ceil(alphanumeric / 4) + Math.ceil(whitespace / 6) + Math.ceil(symbols / 2);

    return tokens;
  }

  /**
   * Estimate tokens for code specifically (more conservative)
   */
  static estimateCode(code: string): number {
    if (!code) return 0;

    // Code tends to have more tokens per character
    // Use 3 chars per token as baseline
    return Math.ceil(code.length / 3);
  }

  /**
   * Count newlines (useful for line-based truncation)
   */
  static countLines(text: string): number {
    return (text.match(/\n/g) || []).length + 1;
  }
}

// ============================================================================
// Context Budget Manager
// ============================================================================

/**
 * Budget allocation categories
 */
export interface BudgetAllocation {
  systemPrompt: number;      // Fixed overhead for system prompt
  taskDescription: number;   // Task details and acceptance criteria
  mustReadFiles: number;     // High-priority file contents
  relatedExamples: number;   // Lower-priority example code
  patterns: number;          // Patterns and conventions
  history: number;           // Previous attempts and decisions
  outputBuffer: number;      // Reserved for LLM response
}

/**
 * File with budget allocation
 */
export interface BudgetedFile {
  path: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  originalTokens: number;
  allocatedTokens: number;
  content: string;
  wasExtracted: boolean;
  extractionMethod?: 'full' | 'signatures' | 'truncated' | 'summary' | 'excluded';
}

/**
 * ContextBudgetManager
 *
 * Manages token budget allocation across the ContextPackage.
 *
 * Default budget: 60,000 tokens
 * - System prompt: 2,000
 * - Task description: 3,000
 * - Must-read files: 40,000
 * - Related examples: 8,000
 * - Patterns: 2,000
 * - History: 2,000
 * - Output buffer: 3,000
 */
export class ContextBudgetManager {
  private totalBudget: number;
  private allocation: BudgetAllocation;
  private used: BudgetAllocation;

  constructor(totalBudget: number = 60000) {
    this.totalBudget = totalBudget;

    // Default allocation percentages
    this.allocation = {
      systemPrompt: Math.floor(totalBudget * 0.033),   // ~3.3%
      taskDescription: Math.floor(totalBudget * 0.05),  // 5%
      mustReadFiles: Math.floor(totalBudget * 0.667),   // ~67%
      relatedExamples: Math.floor(totalBudget * 0.133), // ~13%
      patterns: Math.floor(totalBudget * 0.033),        // ~3.3%
      history: Math.floor(totalBudget * 0.033),         // ~3.3%
      outputBuffer: Math.floor(totalBudget * 0.05),     // 5%
    };

    this.used = {
      systemPrompt: 0,
      taskDescription: 0,
      mustReadFiles: 0,
      relatedExamples: 0,
      patterns: 0,
      history: 0,
      outputBuffer: 0,
    };
  }

  /**
   * Get remaining budget for a category
   */
  getRemaining(category: keyof BudgetAllocation): number {
    return this.allocation[category] - this.used[category];
  }

  /**
   * Mark tokens as used in a category
   */
  use(category: keyof BudgetAllocation, tokens: number): boolean {
    const remaining = this.getRemaining(category);
    if (tokens <= remaining) {
      this.used[category] += tokens;
      return true;
    }
    // Partial use - use what we can
    this.used[category] = this.allocation[category];
    return false;
  }

  /**
   * Get budget summary
   */
  getSummary(): {
    total: number;
    allocated: BudgetAllocation;
    used: BudgetAllocation;
    remaining: BudgetAllocation;
  } {
    const remaining: BudgetAllocation = {
      systemPrompt: this.getRemaining('systemPrompt'),
      taskDescription: this.getRemaining('taskDescription'),
      mustReadFiles: this.getRemaining('mustReadFiles'),
      relatedExamples: this.getRemaining('relatedExamples'),
      patterns: this.getRemaining('patterns'),
      history: this.getRemaining('history'),
      outputBuffer: this.getRemaining('outputBuffer'),
    };

    return {
      total: this.totalBudget,
      allocated: { ...this.allocation },
      used: { ...this.used },
      remaining,
    };
  }

  /**
   * Allocate budget across files by priority
   *
   * High-priority files get up to 60% of file budget each
   * Medium-priority files share remaining budget
   * Low-priority files only included if space remains
   */
  allocateFileBudget(
    files: Array<{ path: string; priority: 'high' | 'medium' | 'low'; tokens: number }>
  ): Array<{ path: string; allocatedTokens: number }> {
    const budget = this.allocation.mustReadFiles;
    const results: Array<{ path: string; allocatedTokens: number }> = [];

    // Sort by priority
    const high = files.filter(f => f.priority === 'high');
    const medium = files.filter(f => f.priority === 'medium');
    const low = files.filter(f => f.priority === 'low');

    let remainingBudget = budget;

    // High priority: up to 60% each, but max 80% total for high priority
    const highBudget = Math.floor(budget * 0.8);
    const maxPerHigh = Math.floor(highBudget / Math.max(high.length, 1));
    let highUsed = 0;

    for (const file of high) {
      const allocated = Math.min(file.tokens, maxPerHigh, highBudget - highUsed);
      results.push({ path: file.path, allocatedTokens: allocated });
      highUsed += allocated;
      remainingBudget -= allocated;
    }

    // Medium priority: share remaining budget equally
    if (medium.length > 0 && remainingBudget > 0) {
      const mediumBudget = Math.floor(remainingBudget * 0.8);
      const maxPerMedium = Math.floor(mediumBudget / medium.length);

      for (const file of medium) {
        const allocated = Math.min(file.tokens, maxPerMedium);
        results.push({ path: file.path, allocatedTokens: allocated });
        remainingBudget -= allocated;
      }
    }

    // Low priority: minimal allocation from whatever remains
    if (low.length > 0 && remainingBudget > 500) {
      const maxPerLow = Math.floor(remainingBudget / low.length);

      for (const file of low) {
        const allocated = Math.min(file.tokens, maxPerLow, 1000); // Cap at 1000 tokens
        results.push({ path: file.path, allocatedTokens: allocated });
        remainingBudget -= allocated;
      }
    } else {
      // Mark low priority as excluded
      for (const file of low) {
        results.push({ path: file.path, allocatedTokens: 0 });
      }
    }

    return results;
  }
}

// ============================================================================
// File Content Extractor
// ============================================================================

/**
 * Extraction result for a file
 */
export interface ExtractedContent {
  full: string;           // Original content
  signatures: string;     // Just exports, types, function signatures
  truncated: string;      // Smart truncation keeping key parts
  summary: string;        // Very short summary (for low budget)
  tokensFull: number;
  tokensSignatures: number;
  tokensTruncated: number;
  tokensSummary: number;
}

/**
 * FileContentExtractor
 *
 * Extracts meaningful content from source files instead of dumb truncation.
 *
 * Strategies (in order of information density):
 * 1. Full - Include entire file content
 * 2. Signatures - Extract exports, type definitions, function signatures
 * 3. Truncated - Keep first N tokens with structural awareness
 * 4. Summary - Just the file description and key exports
 */
export class FileContentExtractor {
  /**
   * Extract content at different fidelity levels
   */
  async extract(filePath: string): Promise<ExtractedContent | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const ext = path.extname(filePath).toLowerCase();

      // Generate all extraction levels
      const full = content;
      const signatures = this.extractSignatures(content, ext);
      const truncated = this.smartTruncate(content, 3000); // ~1000 tokens
      const summary = this.generateSummary(content, filePath, ext);

      return {
        full,
        signatures,
        truncated,
        summary,
        tokensFull: TokenCounter.estimateCode(full),
        tokensSignatures: TokenCounter.estimateCode(signatures),
        tokensTruncated: TokenCounter.estimateCode(truncated),
        tokensSummary: TokenCounter.estimate(summary),
      };
    } catch (error) {
      console.warn(`[FileContentExtractor] Could not read ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Extract exports, type definitions, and function signatures from TypeScript/JavaScript
   *
   * i[25] enhancement: Also extract route handlers (app.get, router.post, etc.)
   * for API files. These are critical for edit actions since they contain the
   * code the LLM needs to surgically modify.
   */
  private extractSignatures(content: string, ext: string): string {
    if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      // For non-code files, return first 50 lines
      return content.split('\n').slice(0, 50).join('\n');
    }

    const lines = content.split('\n');
    const signatures: string[] = [];
    let inMultiLineSignature = false;
    let multiLineBuffer = '';
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip empty lines and single-line comments in signature mode
      if (!trimmed || trimmed.startsWith('//')) continue;

      // Handle multi-line signatures (function with params spanning lines)
      if (inMultiLineSignature) {
        multiLineBuffer += '\n' + line;
        braceDepth += (line.match(/{/g) || []).length;
        braceDepth -= (line.match(/}/g) || []).length;

        // Check if signature is complete (has opening brace or ends with ;)
        if (trimmed.includes('{') && braceDepth > 0) {
          // Add just the signature, not the body
          signatures.push(multiLineBuffer.split('{')[0].trim() + ' { ... }');
          inMultiLineSignature = false;
          multiLineBuffer = '';
          braceDepth = 0;
        } else if (trimmed.endsWith(';') || trimmed.endsWith(',')) {
          signatures.push(multiLineBuffer);
          inMultiLineSignature = false;
          multiLineBuffer = '';
        }
        continue;
      }

      // i[25]: Route handlers - include FULL body for surgical edits
      // These are critical for API modifications and are usually small
      if (trimmed.match(/^(app|router)\.(get|post|put|patch|delete|use)\s*\(/)) {
        // Capture the entire route handler
        let routeContent = line;
        let depth = (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
        depth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;

        let j = i + 1;
        while (j < lines.length && depth > 0) {
          routeContent += '\n' + lines[j];
          depth += (lines[j].match(/\(/g) || []).length - (lines[j].match(/\)/g) || []).length;
          depth += (lines[j].match(/{/g) || []).length - (lines[j].match(/}/g) || []).length;
          j++;
        }
        signatures.push('// Route handler:\n' + routeContent);
        i = j - 1;
        continue;
      }

      // Export statements
      if (trimmed.startsWith('export ')) {
        // Type/interface exports
        if (trimmed.match(/^export\s+(type|interface)\s+\w+/)) {
          // For types/interfaces, try to capture the whole definition
          if (trimmed.includes('{') && !trimmed.includes('}')) {
            // Multi-line type, capture until closing brace
            let typeContent = line;
            let depth = 1;
            let j = i + 1;
            while (j < lines.length && depth > 0) {
              typeContent += '\n' + lines[j];
              depth += (lines[j].match(/{/g) || []).length;
              depth -= (lines[j].match(/}/g) || []).length;
              j++;
            }
            signatures.push(typeContent);
            i = j - 1; // Skip processed lines
          } else {
            signatures.push(line);
          }
        }
        // Function exports
        else if (trimmed.match(/^export\s+(async\s+)?function\s+\w+/)) {
          // Get function signature only
          if (trimmed.includes('{')) {
            signatures.push(line.split('{')[0].trim() + ' { ... }');
          } else {
            inMultiLineSignature = true;
            multiLineBuffer = line;
          }
        }
        // Class exports
        else if (trimmed.match(/^export\s+(abstract\s+)?class\s+\w+/)) {
          // Capture class definition with method signatures
          signatures.push(this.extractClassSignature(lines, i));
          // Skip past the class
          let depth = 0;
          for (let j = i; j < lines.length; j++) {
            depth += (lines[j].match(/{/g) || []).length;
            depth -= (lines[j].match(/}/g) || []).length;
            if (depth === 0 && j > i) {
              i = j;
              break;
            }
          }
        }
        // Const/let exports (often objects or arrow functions)
        else if (trimmed.match(/^export\s+(const|let|var)\s+\w+/)) {
          // For arrow functions, capture signature
          if (trimmed.includes('=>')) {
            const arrowIndex = line.indexOf('=>');
            signatures.push(line.slice(0, arrowIndex + 2).trim() + ' { ... }');
          } else if (trimmed.includes('=')) {
            // Simple value export
            signatures.push(line);
          } else {
            inMultiLineSignature = true;
            multiLineBuffer = line;
          }
        }
        // Re-exports
        else if (trimmed.startsWith('export {') || trimmed.startsWith('export *')) {
          signatures.push(line);
        }
      }
      // Non-exported type definitions (might be used internally)
      else if (trimmed.match(/^(type|interface)\s+\w+/)) {
        if (trimmed.includes('{') && !trimmed.includes('}')) {
          let typeContent = line;
          let depth = 1;
          let j = i + 1;
          while (j < lines.length && depth > 0) {
            typeContent += '\n' + lines[j];
            depth += (lines[j].match(/{/g) || []).length;
            depth -= (lines[j].match(/}/g) || []).length;
            j++;
          }
          signatures.push(typeContent);
          i = j - 1;
        } else {
          signatures.push(line);
        }
      }
      // Import statements (useful for understanding dependencies)
      else if (trimmed.startsWith('import ')) {
        signatures.push(line);
      }
      // i[25]: Module-level const/let declarations (often needed for edits)
      // Include things like `const app = express()`, `const PORT = ...`, `const __dirname = ...`
      else if (trimmed.match(/^const\s+\w+\s*=/) || trimmed.match(/^let\s+\w+\s*=/)) {
        // Only single-line declarations, not complex objects/functions
        if (!trimmed.includes('{') || trimmed.includes('}')) {
          signatures.push(line);
        }
      }
    }

    // Add file header comment if present
    let header = '';
    if (content.startsWith('/**')) {
      const endIndex = content.indexOf('*/');
      if (endIndex !== -1 && endIndex < 500) {
        header = content.slice(0, endIndex + 2) + '\n\n';
      }
    }

    return header + signatures.join('\n\n');
  }

  /**
   * Extract class signature with method signatures (no bodies)
   */
  private extractClassSignature(lines: string[], startIndex: number): string {
    const result: string[] = [];
    let depth = 0;
    let inMethod = false;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      depth += (line.match(/{/g) || []).length;
      depth -= (line.match(/}/g) || []).length;

      if (depth === 0 && i > startIndex) {
        result.push('}');
        break;
      }

      // At class level (depth 1), keep everything
      if (depth <= 1) {
        if (inMethod) {
          result.push('  }');
          inMethod = false;
        }

        // Method signature - keep just the signature
        if (trimmed.match(/^(public|private|protected|async|static|\*)?.*\(.*\).*{$/)) {
          result.push(line.replace(/{$/, '{ ... }'));
          inMethod = true;
          // Skip method body
          let methodDepth = 1;
          while (i + 1 < lines.length && methodDepth > 0) {
            i++;
            methodDepth += (lines[i].match(/{/g) || []).length;
            methodDepth -= (lines[i].match(/}/g) || []).length;
          }
        } else {
          result.push(line);
        }
      }
    }

    return result.join('\n');
  }

  /**
   * Smart truncation that preserves structural boundaries
   */
  private smartTruncate(content: string, maxChars: number): string {
    if (content.length <= maxChars) return content;

    // Try to find a good break point (end of function, class, or section)
    const lines = content.split('\n');
    let result = '';
    let lastGoodBreak = '';

    for (const line of lines) {
      const newResult = result + line + '\n';
      if (newResult.length > maxChars) {
        break;
      }
      result = newResult;

      // Track good break points (closing braces at column 0-2)
      if (line.match(/^}\s*$/)) {
        lastGoodBreak = result;
      }
    }

    // Use last good break if it's close to our limit (within 80%)
    if (lastGoodBreak.length > maxChars * 0.8) {
      return lastGoodBreak + '\n// ... (truncated)';
    }

    return result + '\n// ... (truncated)';
  }

  /**
   * Generate a brief summary of the file
   */
  private generateSummary(content: string, filePath: string, ext: string): string {
    const fileName = path.basename(filePath);
    const lines = content.split('\n');

    // Extract file header comment
    let description = '';
    if (content.startsWith('/**')) {
      const endIndex = content.indexOf('*/');
      if (endIndex !== -1 && endIndex < 500) {
        description = content.slice(3, endIndex).trim()
          .replace(/^\s*\*\s*/gm, '')
          .split('\n')[0];
      }
    }

    // Count exports
    const exports = content.match(/^export\s+(const|let|function|class|type|interface)\s+\w+/gm) || [];
    const exportNames = exports.map(e => {
      const match = e.match(/\s(\w+)$/);
      return match ? match[1] : '';
    }).filter(Boolean);

    return `File: ${fileName}
${description ? `Description: ${description}` : ''}
Lines: ${lines.length}
Exports: ${exportNames.slice(0, 10).join(', ')}${exportNames.length > 10 ? ` (+${exportNames.length - 10} more)` : ''}`;
  }

  /**
   * Select the best content level for a given token budget
   */
  selectForBudget(extracted: ExtractedContent, tokenBudget: number): {
    content: string;
    method: 'full' | 'signatures' | 'truncated' | 'summary' | 'excluded';
    actualTokens: number;
  } {
    // Try each level in order of information density
    if (extracted.tokensFull <= tokenBudget) {
      return { content: extracted.full, method: 'full', actualTokens: extracted.tokensFull };
    }
    if (extracted.tokensSignatures <= tokenBudget) {
      return { content: extracted.signatures, method: 'signatures', actualTokens: extracted.tokensSignatures };
    }
    if (extracted.tokensTruncated <= tokenBudget) {
      return { content: extracted.truncated, method: 'truncated', actualTokens: extracted.tokensTruncated };
    }
    if (extracted.tokensSummary <= tokenBudget) {
      return { content: extracted.summary, method: 'summary', actualTokens: extracted.tokensSummary };
    }
    return { content: '', method: 'excluded', actualTokens: 0 };
  }
}

// ============================================================================
// Main Export: processFilesWithBudget
// ============================================================================

/**
 * Process a list of files within a token budget
 *
 * This is the main entry point for context-aware file processing.
 *
 * @param files - Files with paths and priorities
 * @param totalBudget - Total token budget for all files
 * @returns Processed files with content fit to budget
 */
export async function processFilesWithBudget(
  files: Array<{ path: string; reason: string; priority: 'high' | 'medium' | 'low' }>,
  totalBudget: number = 40000
): Promise<{
  files: BudgetedFile[];
  summary: {
    totalFiles: number;
    includedFull: number;
    includedSignatures: number;
    includedTruncated: number;
    excluded: number;
    totalTokensUsed: number;
    budgetRemaining: number;
  };
}> {
  const extractor = new FileContentExtractor();
  const budgetManager = new ContextBudgetManager(totalBudget);

  // First pass: extract and measure all files
  const extracted: Array<{
    file: typeof files[0];
    content: ExtractedContent | null;
  }> = [];

  for (const file of files) {
    const content = await extractor.extract(file.path);
    extracted.push({ file, content });
  }

  // Calculate token counts for budget allocation
  const fileTokenCounts = extracted
    .filter(e => e.content !== null)
    .map(e => ({
      path: e.file.path,
      priority: e.file.priority,
      tokens: e.content!.tokensFull,
    }));

  // Allocate budget
  const allocations = budgetManager.allocateFileBudget(fileTokenCounts);

  // Second pass: select content level based on allocation
  const results: BudgetedFile[] = [];
  let totalTokensUsed = 0;
  let includedFull = 0;
  let includedSignatures = 0;
  let includedTruncated = 0;
  let excluded = 0;

  for (const { file, content } of extracted) {
    const allocation = allocations.find(a => a.path === file.path);
    const allocatedTokens = allocation?.allocatedTokens ?? 0;

    if (!content || allocatedTokens === 0) {
      results.push({
        path: file.path,
        reason: file.reason,
        priority: file.priority,
        originalTokens: content?.tokensFull ?? 0,
        allocatedTokens: 0,
        content: '',
        wasExtracted: false,
        extractionMethod: 'excluded',
      });
      excluded++;
      continue;
    }

    const selection = extractor.selectForBudget(content, allocatedTokens);

    results.push({
      path: file.path,
      reason: file.reason,
      priority: file.priority,
      originalTokens: content.tokensFull,
      allocatedTokens: selection.actualTokens,
      content: selection.content,
      wasExtracted: selection.method !== 'full',
      extractionMethod: selection.method,
    });

    totalTokensUsed += selection.actualTokens;

    switch (selection.method) {
      case 'full': includedFull++; break;
      case 'signatures': includedSignatures++; break;
      case 'truncated': includedTruncated++; break;
      default: excluded++;
    }
  }

  return {
    files: results,
    summary: {
      totalFiles: files.length,
      includedFull,
      includedSignatures,
      includedTruncated,
      excluded,
      totalTokensUsed,
      budgetRemaining: totalBudget - totalTokensUsed,
    },
  };
}

// Factory exports
export function createTokenCounter() {
  return TokenCounter;
}

export function createContextBudgetManager(totalBudget?: number) {
  return new ContextBudgetManager(totalBudget);
}

export function createFileContentExtractor() {
  return new FileContentExtractor();
}
