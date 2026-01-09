/**
 * Execution Report CLI
 *
 * Created by i[6] to close the execution loop.
 *
 * The Problem (from i[5]'s handoff):
 *   ForgeEngine produces ContextPackage → Claude Code executes → ???
 *   Quality Gate and FeedbackRecorder exist but nothing calls them.
 *
 * The Solution:
 *   This CLI provides a simple interface for reporting execution results.
 *   After executing a task, run this to:
 *   1. Validate the execution through Quality Gate
 *   2. Record feedback for future learning via FeedbackRecorder
 *   3. Store completion context to Mandrel
 *
 * Usage:
 *   npx tsx src/report.ts <project-path> <context-package-id> --success --files=<files>
 *
 * Or with JSON file:
 *   npx tsx src/report.ts report.json
 *
 * The ContextPackage is fetched from Mandrel using the provided ID,
 * enabling cross-session execution (different session than ForgeEngine).
 */

import { createQualityGate, ExecutionResult } from './departments/quality-gate.js';
import { createFeedbackRecorder } from './learning.js';
import { mandrel } from './mandrel.js';
import { ContextPackage } from './types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

interface ExecutionReportInput {
  projectPath: string;
  contextPackageId: string;
  taskId?: string;        // Optional - inferred from ContextPackage if not provided
  success: boolean;
  filesCreated: string[];
  filesModified: string[];
  filesRead: string[];
  learnings: string[];
  notes?: string;
}

interface ExecutionReportResult {
  success: boolean;
  qualityGatePassed: boolean;
  recommendation: 'approve' | 'reject' | 'human_review';
  summary: string;
  checksPerformed: number;
  checksPassed: number;
  feedbackStored: boolean;
  contextPackageFound: boolean;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Fetch ContextPackage from Mandrel by ID.
 *
 * ContextPackages are stored by PreparationDepartment with the
 * format "ContextPackage prepared for task <taskId>:
 * <JSON>"
 *
 * Updated by i[6]: Improved search strategy using multiple approaches
 * since semantic search doesn't work well for UUIDs.
 */
async function fetchContextPackage(packageId: string): Promise<ContextPackage | null> {
  console.log(`[ExecutionReport] Fetching ContextPackage ${packageId} from Mandrel...`);

  try {
    // Helper to extract and validate JSON from search results
    const extractPackage = (text: string): ContextPackage | null => {
      // Look for the specific package ID in the text
      const idPattern = `"id": "${packageId}"`;
      const idIndex = text.indexOf(idPattern);

      if (idIndex === -1) {
        // Also try without space after colon
        const altPattern = `"id":"${packageId}"`;
        const altIndex = text.indexOf(altPattern);
        if (altIndex === -1) return null;
      }

      // Find the start of the JSON object (walk backwards to find opening brace)
      const searchStart = text.indexOf(idPattern) !== -1
        ? text.indexOf(idPattern)
        : text.indexOf(`"id":"${packageId}"`);

      let startIdx = searchStart;
      while (startIdx > 0 && text[startIdx] !== '{') {
        startIdx--;
      }

      // Now find the matching closing brace
      let depth = 0;
      let endIdx = startIdx;
      for (let i = startIdx; i < text.length; i++) {
        if (text[i] === '{') depth++;
        if (text[i] === '}') depth--;
        if (depth === 0) {
          endIdx = i + 1;
          break;
        }
      }

      const jsonStr = text.slice(startIdx, endIdx);
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.id === packageId && parsed.projectType) {
          parsed.created = new Date(parsed.created);
          return parsed as ContextPackage;
        }
      } catch (e) {
        console.log('[ExecutionReport] JSON parse failed:', (e as Error).message);
      }

      return null;
    };

    // Strategy 1: Search for context-package with the ID
    console.log('[ExecutionReport] Strategy 1: smart_search for context-package');
    const searchResult = await mandrel.smartSearch(`context-package ${packageId}`);
    if (searchResult) {
      const pkg = extractPackage(searchResult);
      if (pkg) {
        console.log(`[ExecutionReport] Found ContextPackage via smart_search`);
        return pkg;
      }
    }

    // Strategy 2: Search globally with context_search
    console.log('[ExecutionReport] Strategy 2: context_search for package ID');
    const contextResult = await mandrel.searchContext(packageId, 10);
    if (contextResult) {
      const pkg = extractPackage(contextResult);
      if (pkg) {
        console.log(`[ExecutionReport] Found ContextPackage via context_search`);
        return pkg;
      }
    }

    // Strategy 3: Get recent contexts and look for the package
    console.log('[ExecutionReport] Strategy 3: searching recent contexts');
    const recentResult = await mandrel.getRecentContexts(20);
    if (recentResult) {
      const pkg = extractPackage(recentResult);
      if (pkg) {
        console.log(`[ExecutionReport] Found ContextPackage in recent contexts`);
        return pkg;
      }
    }

    console.log('[ExecutionReport] Could not find ContextPackage in Mandrel');
    return null;
  } catch (error) {
    console.error('[ExecutionReport] Error fetching ContextPackage:', error);
    return null;
  }
}

/**
 * Main execution report function.
 *
 * This is the mechanism that closes the loop:
 * ForgeEngine → ContextPackage → Execution → THIS → QualityGate → FeedbackRecorder → Mandrel
 */
export async function reportExecution(input: ExecutionReportInput): Promise<ExecutionReportResult> {
  const instanceId = 'i[6]'; // Current instance

  console.log('═'.repeat(60));
  console.log('EXECUTION REPORT - Closing the Loop');
  console.log('═'.repeat(60));
  console.log(`\nProject: ${input.projectPath}`);
  console.log(`ContextPackage ID: ${input.contextPackageId}`);
  console.log(`Success: ${input.success}`);
  console.log(`Files Modified: ${input.filesModified.length}`);
  console.log(`Learnings: ${input.learnings.length}\n`);

  // Connect to Mandrel
  const connected = await mandrel.ping();
  if (!connected) {
    console.warn('[ExecutionReport] Warning: Could not connect to Mandrel');
    return {
      success: false,
      qualityGatePassed: false,
      recommendation: 'reject',
      summary: 'Could not connect to Mandrel',
      checksPerformed: 0,
      checksPassed: 0,
      feedbackStored: false,
      contextPackageFound: false,
    };
  }

  // Fetch ContextPackage from Mandrel
  const contextPackage = await fetchContextPackage(input.contextPackageId);

  // Build ExecutionResult
  const executionResult: ExecutionResult = {
    taskId: input.taskId || contextPackage?.id || input.contextPackageId,
    contextPackageId: input.contextPackageId,
    success: input.success,
    filesCreated: input.filesCreated,
    filesModified: input.filesModified,
    filesRead: input.filesRead,
    notes: input.notes,
  };

  // Run Quality Gate
  console.log('\n' + '─'.repeat(40));
  console.log('QUALITY GATE');
  console.log('─'.repeat(40));

  const qualityGate = createQualityGate(instanceId);
  const qualityResult = await qualityGate.validate(
    executionResult.taskId,
    input.projectPath,
    executionResult,
    { contextPackage: contextPackage || undefined }
  );

  console.log(`\nQuality Gate: ${qualityResult.passed ? 'PASSED' : 'FAILED'}`);
  console.log(`Recommendation: ${qualityResult.recommendation}`);
  for (const check of qualityResult.checks) {
    const icon = check.passed ? '✓' : '✗';
    const req = check.required ? '[REQ]' : '[OPT]';
    console.log(`  ${icon} ${req} ${check.check}: ${check.message}`);
  }

  // Record Feedback
  console.log('\n' + '─'.repeat(40));
  console.log('FEEDBACK RECORDING');
  console.log('─'.repeat(40));

  const feedbackRecorder = createFeedbackRecorder(instanceId);
  const feedbackResult = await feedbackRecorder.recordFeedback({
    taskId: executionResult.taskId,
    contextPackageId: input.contextPackageId,
    success: input.success && qualityResult.passed,
    filesModified: input.filesModified,
    filesRead: input.filesRead,
    predictedMustRead: contextPackage?.codeContext?.mustRead?.map(f => f.path) || [],
    testsPassed: qualityResult.checks.find(c => c.check === 'Tests')?.passed,
    compilationPassed: qualityResult.checks.find(c => c.check === 'TypeScript Compilation')?.passed ?? true,
    learnings: input.learnings,
  });

  console.log(`Feedback stored: ${feedbackResult.success ? 'YES' : 'NO'}`);

  // Store completion context
  await mandrel.storeContext(
    `ExecutionReport completed:\n` +
    `ContextPackage: ${input.contextPackageId}\n` +
    `Quality Gate: ${qualityResult.passed ? 'PASSED' : 'FAILED'}\n` +
    `Recommendation: ${qualityResult.recommendation}\n` +
    `Files modified: ${input.filesModified.join(', ')}\n` +
    `Learnings:\n${input.learnings.map(l => `  - ${l}`).join('\n')}`,
    'completion',
    ['execution-report', qualityResult.passed ? 'passed' : 'failed', instanceId]
  );

  const result: ExecutionReportResult = {
    success: qualityResult.passed,
    qualityGatePassed: qualityResult.passed,
    recommendation: qualityResult.recommendation,
    summary: qualityResult.summary,
    checksPerformed: qualityResult.checks.length,
    checksPassed: qualityResult.checks.filter(c => c.passed).length,
    feedbackStored: feedbackResult.success,
    contextPackageFound: contextPackage !== null,
  };

  console.log('\n' + '═'.repeat(60));
  console.log('EXECUTION REPORT COMPLETE');
  console.log('═'.repeat(60));
  console.log(JSON.stringify(result, null, 2));

  return result;
}

// ============================================================================
// CLI Interface
// ============================================================================

function printUsage() {
  console.log(`
Execution Report - Closes the Forge execution loop

Usage:
  npx tsx src/report.ts <project-path> <context-package-id> [options]
  npx tsx src/report.ts --json <path-to-report.json>

Options:
  --success          Mark execution as successful (default: false)
  --failed           Mark execution as failed
  --files=<files>    Comma-separated list of modified files
  --created=<files>  Comma-separated list of created files
  --read=<files>     Comma-separated list of read files
  --learning=<text>  Add a learning (can be repeated)
  --notes=<text>     Add notes about the execution
  --json <file>      Read input from JSON file

JSON file format:
  {
    "projectPath": "/path/to/project",
    "contextPackageId": "uuid",
    "success": true,
    "filesCreated": ["file1.ts"],
    "filesModified": ["file2.ts"],
    "filesRead": ["file3.ts"],
    "learnings": ["Learned something"],
    "notes": "Optional notes"
  }

Example:
  npx tsx src/report.ts /workspace/projects/the-forge abc-123 \\
    --success --files=src/index.ts,src/report.ts \\
    --learning="The loop is now closed"
`);
}

async function parseArgs(args: string[]): Promise<ExecutionReportInput | null> {
  // Check for JSON file mode
  const jsonIndex = args.indexOf('--json');
  if (jsonIndex !== -1 && args[jsonIndex + 1]) {
    const jsonPath = args[jsonIndex + 1];
    try {
      const content = await fs.readFile(jsonPath, 'utf-8');
      return JSON.parse(content) as ExecutionReportInput;
    } catch (error) {
      console.error(`Error reading JSON file: ${error}`);
      return null;
    }
  }

  // Check for positional args mode
  if (args.length < 2) {
    return null;
  }

  const [projectPath, contextPackageId, ...options] = args;

  // Parse options
  let success = false;
  const filesModified: string[] = [];
  const filesCreated: string[] = [];
  const filesRead: string[] = [];
  const learnings: string[] = [];
  let notes: string | undefined;

  for (const opt of options) {
    if (opt === '--success') {
      success = true;
    } else if (opt === '--failed') {
      success = false;
    } else if (opt.startsWith('--files=')) {
      filesModified.push(...opt.slice(8).split(',').filter(f => f));
    } else if (opt.startsWith('--created=')) {
      filesCreated.push(...opt.slice(10).split(',').filter(f => f));
    } else if (opt.startsWith('--read=')) {
      filesRead.push(...opt.slice(7).split(',').filter(f => f));
    } else if (opt.startsWith('--learning=')) {
      learnings.push(opt.slice(11));
    } else if (opt.startsWith('--notes=')) {
      notes = opt.slice(8);
    }
  }

  return {
    projectPath,
    contextPackageId,
    success,
    filesCreated,
    filesModified,
    filesRead,
    learnings,
    notes,
  };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
  }

  const input = await parseArgs(args);
  if (!input) {
    printUsage();
    process.exit(1);
  }

  const result = await reportExecution(input);
  process.exit(result.success ? 0 : 1);
}

// Run if called directly (check if this module is the entry point)
const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('report.ts') ||
  process.argv[1]?.endsWith('report.js');

if (isMainModule) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

// Export for programmatic use
export { ExecutionReportInput, ExecutionReportResult };
