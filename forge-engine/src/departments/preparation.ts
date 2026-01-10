/**
 * Preparation Department
 *
 * The critical one. Produces ContextPackage for execution.
 *
 * Structure:
 * - Foreman (Sonnet-tier): Coordinates workers, synthesizes results, gates quality
 * - Workers (Haiku-tier): Specialized tasks - file discovery, pattern extraction, etc.
 *
 * This prototype implements the 7-phase protocol from SIRK Pass #1.
 */

import { ContextPackage, ProjectType, HistoricalContext } from '../types.js';
import { taskManager } from '../state.js';
import { mandrel } from '../mandrel.js';
import { createLearningRetriever, LearningRetriever } from '../learning.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

// ============================================================================
// Task Type Detection & Content Generation (i[10] contribution)
// ============================================================================

/**
 * Task types for content-aware preparation.
 *
 * i[10] contribution: Previous passes made file discovery task-type-aware (i[9]),
 * but content generation (acceptance criteria, constraints, patterns) was still
 * code-centric for all tasks. This led to nonsensical preparations like:
 * - "add a README" → acceptance: "TypeScript compilation must pass"
 *
 * This enum enables task-type-aware CONTENT generation, not just file discovery.
 */
type TaskContentType = 'documentation' | 'testing' | 'configuration' | 'code';

/**
 * Generated content for a task type.
 */
interface TaskTypeContent {
  taskType: TaskContentType;
  acceptanceCriteria: string[];
  qualityConstraints: string[];
  patterns: {
    conventions: string;
    organization: string;
    quality: string;
  };
}

/**
 * TaskTypeContentGenerator
 *
 * i[10] contribution: Generates task-type-appropriate content for ContextPackages.
 *
 * This fixes the problem identified by i[9]: the LLM quality evaluation scored
 * 45/100 for a README task because acceptance criteria said "Code compiles"
 * and constraints said "TypeScript compilation must pass".
 *
 * Now:
 * - Documentation tasks → Markdown patterns, readability criteria
 * - Testing tasks → Test coverage, assertion patterns
 * - Configuration tasks → Validation, compatibility criteria
 * - Code tasks → Compilation, type safety (the previous default)
 */
class TaskTypeContentGenerator {
  /**
   * Detect the task type from the request description.
   *
   * Reuses detection patterns from FileDiscoveryWorker (i[9]) for consistency.
   */
  detectTaskType(taskDescription: string): TaskContentType {
    const lower = taskDescription.toLowerCase();

    // Documentation detection
    if (lower.includes('readme') ||
        lower.includes('documentation') ||
        lower.includes('docs') ||
        lower.includes('comment') ||
        lower.includes('document') ||
        lower.includes('api docs') ||
        lower.includes('jsdoc') ||
        lower.includes('tsdoc')) {
      return 'documentation';
    }

    // Testing detection
    if (lower.includes('test') ||
        lower.includes('spec') ||
        lower.includes('coverage') ||
        lower.includes('unit test') ||
        lower.includes('integration test') ||
        lower.includes('e2e')) {
      return 'testing';
    }

    // Configuration detection
    if (lower.includes('config') ||
        lower.includes('setting') ||
        lower.includes('setup') ||
        lower.includes('environment') ||
        lower.includes('env') ||
        lower.includes('.json') ||
        lower.includes('.yaml') ||
        lower.includes('.yml') ||
        lower.includes('tsconfig') ||
        lower.includes('eslint') ||
        lower.includes('prettier')) {
      return 'configuration';
    }

    // Default to code
    return 'code';
  }

  /**
   * Generate task-type-appropriate content.
   */
  generate(taskDescription: string): TaskTypeContent {
    const taskType = this.detectTaskType(taskDescription);

    switch (taskType) {
      case 'documentation':
        return this.generateDocumentationContent(taskDescription);
      case 'testing':
        return this.generateTestingContent(taskDescription);
      case 'configuration':
        return this.generateConfigurationContent(taskDescription);
      case 'code':
      default:
        return this.generateCodeContent(taskDescription);
    }
  }

  /**
   * Documentation task content (README, docs, comments)
   */
  private generateDocumentationContent(taskDescription: string): TaskTypeContent {
    const lower = taskDescription.toLowerCase();
    const criteria: string[] = [];

    // Base documentation criteria
    if (lower.includes('readme')) {
      criteria.push('README.md file exists');
      criteria.push('README has required sections (description, usage, installation)');
    } else {
      criteria.push('Documentation file(s) created or updated');
    }

    criteria.push('Documentation is clear and readable');
    criteria.push('All links are valid (no broken links)');
    criteria.push('Code examples are accurate and runnable');

    return {
      taskType: 'documentation',
      acceptanceCriteria: criteria,
      qualityConstraints: [
        'Valid Markdown syntax',
        'Consistent heading hierarchy (h1 → h2 → h3)',
        'Accurate and up-to-date information',
        'No spelling or grammar errors',
      ],
      patterns: {
        conventions: 'Markdown formatting conventions',
        organization: 'Logical section ordering (overview → details → examples)',
        quality: 'Clear, concise writing with code examples where appropriate',
      },
    };
  }

  /**
   * Testing task content (tests, specs, coverage)
   */
  private generateTestingContent(taskDescription: string): TaskTypeContent {
    const lower = taskDescription.toLowerCase();
    const criteria: string[] = [];

    criteria.push('All tests pass');
    criteria.push('Test coverage maintained or improved');

    if (lower.includes('new test') || lower.includes('add test')) {
      criteria.push('New test file(s) created in correct location');
      criteria.push('Tests follow project naming conventions');
    }

    if (lower.includes('fix') || lower.includes('broken')) {
      criteria.push('Previously failing test now passes');
    }

    criteria.push('No flaky tests introduced');

    return {
      taskType: 'testing',
      acceptanceCriteria: criteria,
      qualityConstraints: [
        'Use project test framework (Jest/Vitest/Mocha)',
        'Follow Arrange-Act-Assert pattern',
        'Tests are isolated (no shared state)',
        'Descriptive test names explaining expected behavior',
      ],
      patterns: {
        conventions: 'describe/it blocks with clear naming (*.test.ts or *.spec.ts)',
        organization: 'Tests co-located with source or in __tests__ directory',
        quality: 'Fast, deterministic, independent tests',
      },
    };
  }

  /**
   * Configuration task content (config files, settings)
   */
  private generateConfigurationContent(taskDescription: string): TaskTypeContent {
    const criteria: string[] = [];

    criteria.push('Configuration file is valid (parseable JSON/YAML/etc)');
    criteria.push('Application starts successfully with new configuration');
    criteria.push('Configuration changes take effect as expected');

    return {
      taskType: 'configuration',
      acceptanceCriteria: criteria,
      qualityConstraints: [
        'Backward compatible (existing workflows not broken)',
        'New options documented (inline comments or README)',
        'Sensible defaults for optional settings',
        'Validation for required settings',
      ],
      patterns: {
        conventions: 'Match existing config file format and structure',
        organization: 'Group related settings, use comments for sections',
        quality: 'Environment-specific overrides where appropriate',
      },
    };
  }

  /**
   * Code task content (features, bugfixes, refactors) - the original default
   */
  private generateCodeContent(taskDescription: string): TaskTypeContent {
    const lower = taskDescription.toLowerCase();
    const criteria: string[] = [];

    // Base code criteria
    criteria.push('Code compiles without errors');
    criteria.push('Functionality works as described');

    if (lower.includes('test')) {
      criteria.push('Tests pass');
    }

    if (lower.includes('error') || lower.includes('bug')) {
      criteria.push('Error no longer occurs');
    }

    return {
      taskType: 'code',
      acceptanceCriteria: criteria,
      qualityConstraints: [
        'TypeScript compilation must pass',
        'Existing tests must pass',
        'No new linting errors',
      ],
      patterns: {
        conventions: 'camelCase (TypeScript default)',
        organization: 'ES Modules with clear imports/exports',
        quality: 'Type-safe, error handling, follows existing patterns',
      },
    };
  }
}

// ============================================================================
// Worker Results (what workers produce)
// ============================================================================

interface FileDiscoveryResult {
  relevantFiles: Array<{
    path: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  directoryStructure: string;
}

interface PatternExtractionResult {
  namingConventions: string;
  fileOrganization: string;
  testingApproach: string;
  errorHandling: string;
  codeStyle: string[];
}

interface ArchitectureAnalysisResult {
  overview: string;
  components: Array<{
    name: string;
    purpose: string;
    location: string;
    entryPoints?: string[];
  }>;
  dependencies: string[];
  dataFlow?: string;
}

// ============================================================================
// Workers (specialized task agents)
// ============================================================================

/**
 * i[9] fix: Task-type-aware file discovery
 * i[11] enhancement: Explicit reference extraction
 *
 * The original implementation searched file CONTENTS for ALL keywords,
 * which caused noise: "add a simple README" matched llm.ts because it
 * contains the word "simple".
 *
 * New approach (4 strategies, ordered by priority):
 * 0. Explicit reference extraction (i[11]) - files/types/classes explicitly mentioned
 * 1. Task-type specific files (README task → .md files, docs/, package.json)
 * 2. Path-based matching (file NAMES contain keywords)
 * 3. Content matching with filtered keywords (skip "code noise" words)
 *
 * i[11] insight: When a task says "follow the pattern in preparation.ts",
 * that's an EXPLICIT reference that must be in mustRead. Keyword matching
 * doesn't catch this - we need to extract file paths, type names, and
 * class names from the task description and resolve them to actual files.
 */
class FileDiscoveryWorker {
  // Words that appear commonly in code but aren't meaningful for file discovery
  // These should NOT be used for content-based file search
  private static CODE_NOISE_WORDS = new Set([
    'simple', 'new', 'file', 'data', 'value', 'type', 'name', 'get', 'set',
    'list', 'item', 'result', 'error', 'message', 'string', 'number', 'boolean',
    'function', 'method', 'class', 'object', 'array', 'return', 'true', 'false',
    'null', 'undefined', 'const', 'let', 'var', 'async', 'await', 'export',
    'import', 'default', 'interface', 'config', 'options', 'params', 'args',
  ]);

  /**
   * Discover relevant files for a task in a codebase
   *
   * i[9] refactored: Now uses multi-strategy approach
   * i[11] enhanced: Added explicit reference extraction as Strategy 0
   */
  async discover(
    projectPath: string,
    keywords: string[],
    projectType: ProjectType,
    taskDescription: string = ''  // Added for task-type detection
  ): Promise<FileDiscoveryResult> {
    console.log(`[Worker:FileDiscovery] Scanning ${projectPath}`);
    console.log(`[Worker:FileDiscovery] Keywords: ${keywords.join(', ')}`);

    // Get directory structure (expanded to include more file types)
    let directoryStructure = '';
    try {
      const { stdout } = await execAsync(
        `find "${projectPath}" -type f \\( -name "*.ts" -o -name "*.js" -o -name "*.tsx" -o -name "*.jsx" -o -name "*.md" -o -name "*.json" \\) ! -path "*/node_modules/*" | head -50`,
        { timeout: 10000 }
      );
      directoryStructure = stdout;
    } catch {
      directoryStructure = 'Unable to scan directory';
    }

    const relevantFiles: FileDiscoveryResult['relevantFiles'] = [];

    // Strategy 0 (i[11]): Explicit reference extraction (HIGHEST priority)
    // Extract file paths, type names, and class names directly mentioned in task
    console.log('[Worker:FileDiscovery] Strategy 0: Explicit reference extraction (i[11])');
    const explicitRefs = await this.discoverByExplicitReferences(projectPath, taskDescription);
    for (const file of explicitRefs) {
      if (!relevantFiles.find(f => f.path === file.path)) {
        relevantFiles.push({ ...file, priority: 'high' });
      }
    }

    // Strategy 1: Task-type specific files (highest priority)
    console.log('[Worker:FileDiscovery] Strategy 1: Task-type specific files');
    const taskTypeFiles = await this.discoverByTaskType(projectPath, taskDescription, keywords);
    for (const file of taskTypeFiles) {
      if (!relevantFiles.find(f => f.path === file.path)) {
        relevantFiles.push({ ...file, priority: 'high' });
      }
    }

    // Strategy 2: Path-based matching (file/directory names)
    console.log('[Worker:FileDiscovery] Strategy 2: Path-based matching');
    const pathFiles = await this.discoverByPath(projectPath, keywords);
    for (const file of pathFiles) {
      const existing = relevantFiles.find(f => f.path === file.path);
      if (existing) {
        existing.priority = 'high'; // Multiple strategies matched = high priority
      } else {
        relevantFiles.push({ ...file, priority: 'high' });
      }
    }

    // Strategy 3: Content matching with filtered keywords (lowest priority)
    // Only use keywords that aren't "code noise"
    const meaningfulKeywords = keywords.filter(k => !FileDiscoveryWorker.CODE_NOISE_WORDS.has(k));
    if (meaningfulKeywords.length > 0) {
      console.log(`[Worker:FileDiscovery] Strategy 3: Content matching with: ${meaningfulKeywords.join(', ')}`);
      const contentFiles = await this.discoverByContent(projectPath, meaningfulKeywords);
      for (const file of contentFiles) {
        const existing = relevantFiles.find(f => f.path === file.path);
        if (existing) {
          existing.priority = 'high';
        } else {
          relevantFiles.push({ ...file, priority: 'medium' });
        }
      }
    } else {
      console.log('[Worker:FileDiscovery] Strategy 3: Skipped (all keywords are code noise)');
    }

    // i[11] fix: Filter out directories and non-code files from mustRead
    // The path-based matching often adds directories and irrelevant files
    const filteredFiles = await this.filterRelevantFiles(relevantFiles, projectPath);

    console.log(`[Worker:FileDiscovery] Found ${filteredFiles.length} relevant files (after filtering)`);
    return { relevantFiles: filteredFiles, directoryStructure };
  }

  /**
   * i[11] addition: Filter out directories and non-relevant files from results.
   *
   * The path-based matching strategy often includes:
   * - Directories (not files)
   * - dist/ compiled output
   * - Non-code files like Dockerfile when task is about TypeScript
   *
   * This filter ensures mustRead contains actual readable code files.
   */
  private async filterRelevantFiles(
    files: FileDiscoveryResult['relevantFiles'],
    projectPath: string
  ): Promise<FileDiscoveryResult['relevantFiles']> {
    const filtered: FileDiscoveryResult['relevantFiles'] = [];

    for (const file of files) {
      // Skip if it's a directory
      try {
        const stats = await fs.stat(file.path);
        if (stats.isDirectory()) {
          console.log(`[Worker:FileDiscovery] Filtering out directory: ${file.path}`);
          continue;
        }
      } catch {
        // File doesn't exist, skip it
        continue;
      }

      // Skip dist/ compiled output
      if (file.path.includes('/dist/')) {
        console.log(`[Worker:FileDiscovery] Filtering out dist file: ${file.path}`);
        continue;
      }

      // Skip non-code files for code tasks (unless explicitly referenced)
      const isExplicitReference = file.reason.includes('Explicitly referenced') ||
        file.reason.includes('Defines type/class') ||
        file.reason.includes('Defines function');

      if (!isExplicitReference) {
        // Check if it's a code file
        const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md'];
        const hasCodeExtension = codeExtensions.some(ext => file.path.endsWith(ext));

        // Skip Dockerfile and similar unless explicitly mentioned
        const basename = path.basename(file.path);
        const nonCodeFiles = ['Dockerfile', '.gitignore', '.env', '.env.example'];
        if (nonCodeFiles.includes(basename)) {
          console.log(`[Worker:FileDiscovery] Filtering out non-code file: ${file.path}`);
          continue;
        }

        if (!hasCodeExtension) {
          console.log(`[Worker:FileDiscovery] Filtering out non-code extension: ${file.path}`);
          continue;
        }
      }

      filtered.push(file);
    }

    return filtered;
  }

  /**
   * Strategy 0 (i[11]): Discover files by explicit references in task description
   *
   * This strategy extracts:
   * 1. File paths mentioned directly (e.g., "preparation.ts", "src/index.ts")
   * 2. Type/interface names (e.g., "ContextPackage") → resolve to definition file
   * 3. Class names (e.g., "PreparationForeman") → resolve to definition file
   *
   * This solves the problem where a task says "follow the pattern in preparation.ts"
   * but keyword matching doesn't find preparation.ts because "preparation" isn't
   * a keyword in the stopword-filtered list.
   */
  private async discoverByExplicitReferences(
    projectPath: string,
    taskDescription: string
  ): Promise<Array<{ path: string; reason: string }>> {
    const files: Array<{ path: string; reason: string }> = [];

    if (!taskDescription) return files;

    // 1. Extract explicit file paths (.ts, .tsx, .js, .jsx, .md, .json, .yaml, .yml)
    // Match patterns like "preparation.ts", "src/departments/execution.ts", etc.
    const filePatterns = taskDescription.match(
      /(?:^|[\s"'`(,])([a-zA-Z0-9_\-./]+\.(?:ts|tsx|js|jsx|md|json|yaml|yml))(?:[\s"'`),]|$)/gi
    ) || [];

    for (const match of filePatterns) {
      // Clean up the match (remove surrounding whitespace/punctuation)
      const fileName = match.replace(/^[\s"'`(,]+|[\s"'`),]+$/g, '');
      if (fileName.length < 3) continue;

      // Try to find this file in the project
      try {
        const { stdout } = await execAsync(
          `find "${projectPath}" -type f -name "${path.basename(fileName)}" ! -path "*/node_modules/*" ! -path "*/dist/*" 2>/dev/null | head -3`,
          { timeout: 5000 }
        );

        for (const foundPath of stdout.trim().split('\n').filter(Boolean)) {
          // Prefer paths that match the full specified path, not just basename
          if (fileName.includes('/') && !foundPath.includes(fileName.replace(/^\//, ''))) {
            continue;
          }
          files.push({
            path: foundPath,
            reason: `Explicitly referenced in task: "${fileName}"`,
          });
        }
      } catch { /* ignore */ }
    }

    // 2. Extract PascalCase type/class names (likely TypeScript types or classes)
    // Match patterns like "ContextPackage", "PreparationForeman", etc.
    const pascalCaseNames = taskDescription.match(/\b([A-Z][a-zA-Z0-9]*(?:[A-Z][a-zA-Z0-9]*)+)\b/g) || [];

    // Deduplicate and filter out common false positives
    const falsePascalCase = new Set(['README', 'TODO', 'FIXME', 'JSON', 'API', 'URL', 'HTML', 'CSS', 'SQL', 'HTTP', 'HTTPS']);
    const uniqueNames = [...new Set(pascalCaseNames)].filter(n => !falsePascalCase.has(n));

    for (const name of uniqueNames) {
      // Search for files that define this type/class
      // Look for various definition patterns:
      // - "interface Name", "type Name =", "class Name"
      // - "export const Name", "export type Name", "export class Name"
      // - "export { Name }", etc.
      try {
        const { stdout } = await execAsync(
          `rg -l "(interface|type|class|const|let|var|function)\\s+${name}\\b|export\\s+.*${name}\\b" "${projectPath}" --type ts 2>/dev/null | grep -v node_modules | grep -v dist | head -3`,
          { timeout: 5000 }
        );

        for (const foundPath of stdout.trim().split('\n').filter(Boolean)) {
          if (!files.find(f => f.path === foundPath)) {
            files.push({
              path: foundPath,
              reason: `Defines type/class "${name}" referenced in task`,
            });
          }
        }
      } catch { /* ignore - rg might not find anything */ }
    }

    // 3. Extract camelCase identifiers that might be important function/method names
    // Match patterns like "createForgeEngine", "prepareContext", etc.
    // Only include if they're likely to be definitions (not common verbs)
    const camelCasePatterns = taskDescription.match(/\b(create|build|make|get|set|init|handle|process)[A-Z][a-zA-Z0-9]+\b/g) || [];

    for (const name of [...new Set(camelCasePatterns)]) {
      try {
        const { stdout } = await execAsync(
          `rg -l "(?:function|const|let|export)\\s+${name}\\b" "${projectPath}" --type ts 2>/dev/null | grep -v node_modules | grep -v dist | head -2`,
          { timeout: 5000 }
        );

        for (const foundPath of stdout.trim().split('\n').filter(Boolean)) {
          if (!files.find(f => f.path === foundPath)) {
            files.push({
              path: foundPath,
              reason: `Defines function "${name}" referenced in task`,
            });
          }
        }
      } catch { /* ignore */ }
    }

    console.log(`[Worker:FileDiscovery] Strategy 0: Found ${files.length} explicit references`);
    return files;
  }

  /**
   * Strategy 1: Discover files based on task type
   *
   * For documentation tasks → look for .md files, docs/, package.json
   * For test tasks → look for test files, __tests__ directories
   * etc.
   */
  private async discoverByTaskType(
    projectPath: string,
    taskDescription: string,
    keywords: string[]
  ): Promise<Array<{ path: string; reason: string }>> {
    const lower = (taskDescription || keywords.join(' ')).toLowerCase();
    const files: Array<{ path: string; reason: string }> = [];

    // Documentation task detection
    if (lower.includes('readme') || lower.includes('documentation') || lower.includes('docs')) {
      console.log('[Worker:FileDiscovery] Detected: Documentation task');

      // Find existing README files
      try {
        const { stdout } = await execAsync(
          `find "${projectPath}" -maxdepth 2 -iname "readme*" -o -iname "*.md" 2>/dev/null | head -5`,
          { timeout: 5000 }
        );
        for (const file of stdout.trim().split('\n').filter(Boolean)) {
          files.push({ path: file, reason: 'Existing documentation file' });
        }
      } catch { /* ignore */ }

      // Find package.json for project metadata
      try {
        await fs.access(path.join(projectPath, 'package.json'));
        files.push({ path: path.join(projectPath, 'package.json'), reason: 'Project metadata' });
      } catch { /* ignore */ }

      // Find docs directory
      try {
        const { stdout } = await execAsync(
          `find "${projectPath}" -maxdepth 2 -type d -iname "docs" -o -iname "documentation" 2>/dev/null | head -1`,
          { timeout: 5000 }
        );
        if (stdout.trim()) {
          files.push({ path: stdout.trim(), reason: 'Documentation directory' });
        }
      } catch { /* ignore */ }
    }

    // Test task detection
    if (lower.includes('test') || lower.includes('spec')) {
      console.log('[Worker:FileDiscovery] Detected: Testing task');

      try {
        const { stdout } = await execAsync(
          `find "${projectPath}" -type f \\( -name "*.test.ts" -o -name "*.spec.ts" -o -name "*.test.js" \\) ! -path "*/node_modules/*" 2>/dev/null | head -10`,
          { timeout: 5000 }
        );
        for (const file of stdout.trim().split('\n').filter(Boolean)) {
          files.push({ path: file, reason: 'Test file' });
        }
      } catch { /* ignore */ }
    }

    // Config task detection
    if (lower.includes('config') || lower.includes('setting') || lower.includes('setup')) {
      console.log('[Worker:FileDiscovery] Detected: Configuration task');

      const configPatterns = ['tsconfig.json', 'package.json', '.eslintrc*', '.prettierrc*', 'jest.config.*', 'vite.config.*'];
      for (const pattern of configPatterns) {
        try {
          const { stdout } = await execAsync(
            `find "${projectPath}" -maxdepth 1 -name "${pattern}" 2>/dev/null | head -3`,
            { timeout: 3000 }
          );
          for (const file of stdout.trim().split('\n').filter(Boolean)) {
            files.push({ path: file, reason: 'Configuration file' });
          }
        } catch { /* ignore */ }
      }
    }

    return files;
  }

  /**
   * Strategy 2: Discover files by path matching
   *
   * Searches for files/directories whose NAMES contain keywords.
   * This is more reliable than content matching for finding related files.
   */
  private async discoverByPath(
    projectPath: string,
    keywords: string[]
  ): Promise<Array<{ path: string; reason: string }>> {
    const files: Array<{ path: string; reason: string }> = [];

    for (const keyword of keywords) {
      if (keyword.length < 3) continue; // Skip very short keywords

      try {
        // Search for files/directories with keyword in name
        const { stdout } = await execAsync(
          `find "${projectPath}" -iname "*${keyword}*" ! -path "*/node_modules/*" 2>/dev/null | head -5`,
          { timeout: 5000 }
        );

        for (const file of stdout.trim().split('\n').filter(Boolean)) {
          if (!files.find(f => f.path === file)) {
            files.push({ path: file, reason: `Name contains "${keyword}"` });
          }
        }
      } catch { /* ignore */ }
    }

    return files;
  }

  /**
   * Strategy 3: Discover files by content matching
   *
   * Searches for keywords inside file contents.
   * Only used for "meaningful" keywords (not code noise).
   */
  private async discoverByContent(
    projectPath: string,
    keywords: string[]
  ): Promise<Array<{ path: string; reason: string }>> {
    const files: Array<{ path: string; reason: string }> = [];

    for (const keyword of keywords) {
      try {
        const { stdout } = await execAsync(
          `rg -l -i "${keyword}" "${projectPath}" --type ts --type js --type md 2>/dev/null | grep -v node_modules | head -5`,
          { timeout: 10000 }
        );

        for (const file of stdout.trim().split('\n').filter(Boolean)) {
          if (!files.find(f => f.path === file)) {
            files.push({ path: file, reason: `Content contains "${keyword}"` });
          }
        }
      } catch { /* ignore */ }
    }

    return files;
  }
}

class PatternExtractionWorker {
  /**
   * Extract coding patterns from a codebase
   */
  async extract(projectPath: string): Promise<PatternExtractionResult> {
    console.log(`[Worker:PatternExtraction] Analyzing patterns in ${projectPath}`);

    // Check for config files
    const configs: string[] = [];
    const configFiles = ['tsconfig.json', 'package.json', '.eslintrc', '.prettierrc', 'jest.config.js'];

    for (const config of configFiles) {
      try {
        await fs.access(path.join(projectPath, config));
        configs.push(config);
      } catch {
        // File doesn't exist
      }
    }

    // Infer patterns from structure
    let testingApproach = 'Unknown';
    try {
      const { stdout } = await execAsync(`ls -la "${projectPath}" 2>/dev/null`);
      if (stdout.includes('jest') || stdout.includes('__tests__')) {
        testingApproach = 'Jest';
      } else if (stdout.includes('vitest')) {
        testingApproach = 'Vitest';
      } else if (stdout.includes('mocha')) {
        testingApproach = 'Mocha';
      }
    } catch {
      // Ignore
    }

    // Check package.json for more info
    let namingConventions = 'camelCase (TypeScript default)';
    let fileOrganization = 'Unknown';

    try {
      const pkgPath = path.join(projectPath, 'package.json');
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));

      if (pkg.type === 'module') {
        fileOrganization = 'ES Modules';
      }

      if (pkg.scripts?.test) {
        testingApproach = pkg.scripts.test.includes('jest')
          ? 'Jest'
          : pkg.scripts.test.includes('vitest')
          ? 'Vitest'
          : testingApproach;
      }
    } catch {
      // No package.json or parse error
    }

    return {
      namingConventions,
      fileOrganization,
      testingApproach,
      errorHandling: 'Standard try/catch with typed errors',
      codeStyle: configs,
    };
  }
}

class ArchitectureAnalysisWorker {
  /**
   * Analyze the architecture of a codebase
   */
  async analyze(
    projectPath: string,
    relevantFiles: string[]
  ): Promise<ArchitectureAnalysisResult> {
    console.log(`[Worker:Architecture] Analyzing ${relevantFiles.length} files`);

    const components: ArchitectureAnalysisResult['components'] = [];
    const dependencies: string[] = [];

    // Read package.json for dependencies
    try {
      const pkgPath = path.join(projectPath, 'package.json');
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));

      dependencies.push(...Object.keys(pkg.dependencies ?? {}));
      dependencies.push(...Object.keys(pkg.devDependencies ?? {}).map(d => `${d} (dev)`));
    } catch {
      // Ignore
    }

    // Analyze file structure to identify components
    const dirCounts: Record<string, number> = {};
    for (const file of relevantFiles) {
      const dir = path.dirname(file).replace(projectPath, '').split('/')[1] ?? 'root';
      dirCounts[dir] = (dirCounts[dir] ?? 0) + 1;
    }

    for (const [dir, count] of Object.entries(dirCounts)) {
      if (count >= 1) {
        components.push({
          name: dir,
          purpose: `Contains ${count} relevant file(s)`,
          location: path.join(projectPath, dir),
        });
      }
    }

    return {
      overview: `Project with ${relevantFiles.length} relevant files across ${components.length} components`,
      components,
      dependencies: dependencies.slice(0, 20), // Top 20
    };
  }
}

// ============================================================================
// Preparation Foreman
// ============================================================================

export class PreparationForeman {
  private instanceId: string;
  private fileWorker: FileDiscoveryWorker;
  private patternWorker: PatternExtractionWorker;
  private architectureWorker: ArchitectureAnalysisWorker;
  private learningRetriever: LearningRetriever;
  private contentGenerator: TaskTypeContentGenerator; // i[10]: Task-type-aware content

  constructor(instanceId: string) {
    this.instanceId = instanceId;
    this.fileWorker = new FileDiscoveryWorker();
    this.patternWorker = new PatternExtractionWorker();
    this.architectureWorker = new ArchitectureAnalysisWorker();
    this.learningRetriever = createLearningRetriever(instanceId);
    this.contentGenerator = new TaskTypeContentGenerator(); // i[10]
  }

  /**
   * Execute the 7-phase preparation protocol
   *
   * Returns a complete ContextPackage ready for execution.
   */
  async prepare(
    taskId: string,
    projectPath: string
  ): Promise<{ success: boolean; package?: ContextPackage; error?: string }> {
    const task = taskManager.getTask(taskId);
    if (!task || !task.classification) {
      return { success: false, error: 'Task not found or not classified' };
    }

    console.log(`[Foreman:Preparation] Starting preparation for task ${taskId}`);
    console.log(`[Foreman:Preparation] Type: ${task.classification.projectType}, Scope: ${task.classification.scope}`);

    // Transition to preparing state
    taskManager.transitionState(taskId, 'preparing', this.instanceId, 'Starting preparation');

    try {
      // Phase 1: Already done by Plant Manager (classification)
      console.log('[Foreman:Preparation] Phase 1: Classification complete');

      // Phase 2: Architectural Discovery
      console.log('[Foreman:Preparation] Phase 2: Architectural Discovery');

      // Extract keywords from request
      const keywords = this.extractKeywords(task.rawRequest);
      console.log(`[Foreman:Preparation] Keywords: ${keywords.join(', ')}`);

      // Worker: File Discovery (i[9]: now passes task description for task-type awareness)
      const fileResult = await this.fileWorker.discover(
        projectPath,
        keywords,
        task.classification.projectType,
        task.rawRequest  // i[9]: Added for task-type-aware file discovery
      );

      // Phase 3: Code Context Assembly
      console.log('[Foreman:Preparation] Phase 3: Code Context Assembly');

      // Worker: Architecture Analysis
      const relevantPaths = fileResult.relevantFiles.map(f => f.path);
      const archResult = await this.architectureWorker.analyze(projectPath, relevantPaths);

      // Phase 4: Pattern & Constraint Synthesis
      console.log('[Foreman:Preparation] Phase 4: Pattern Synthesis');

      // Worker: Pattern Extraction
      const patternResult = await this.patternWorker.extract(projectPath);

      // Phase 5: Risk Assessment
      console.log('[Foreman:Preparation] Phase 5: Risk Assessment');
      const risks = this.assessRisks(task, fileResult, archResult);

      // Phase 5.5: Learning Retrieval (added by i[4])
      // This is the key to compound learning - retrieve historical context
      console.log('[Foreman:Preparation] Phase 5.5: Learning Retrieval (i[4])');
      const historicalContext = await this.learningRetriever.retrieve(
        task.rawRequest,
        projectPath
      );

      // Phase 6: Package Validation (internal)
      console.log('[Foreman:Preparation] Phase 6: Package Validation');

      // Phase 6.5: Task-Type-Aware Content Generation (i[10])
      // This fixes the problem where ContextPackages had code-centric content
      // even for non-code tasks like README creation.
      console.log('[Foreman:Preparation] Phase 6.5: Task-Type Content Generation (i[10])');
      const taskTypeContent = this.contentGenerator.generate(task.rawRequest);
      console.log(`[Foreman:Preparation] Detected task type: ${taskTypeContent.taskType}`);

      // Phase 7: Build the ContextPackage
      console.log('[Foreman:Preparation] Phase 7: Building ContextPackage');

      const contextPackage: ContextPackage = {
        id: crypto.randomUUID(),
        projectType: task.classification.projectType,
        created: new Date(),
        preparedBy: this.instanceId,

        task: {
          description: task.rawRequest,
          // i[10]: Use task-type-aware acceptance criteria instead of code-centric defaults
          acceptanceCriteria: taskTypeContent.acceptanceCriteria,
          scope: {
            inScope: keywords,
            outOfScope: ['unrelated features', 'major refactoring'],
          },
        },

        architecture: {
          overview: archResult.overview,
          relevantComponents: archResult.components,
          dataFlow: archResult.dataFlow,
          dependencies: archResult.dependencies,
        },

        codeContext: {
          // Combine file discovery with historical learning (i[4])
          mustRead: [
            // Files from keyword search
            ...fileResult.relevantFiles
              .filter(f => f.priority === 'high')
              .map(f => ({
                path: f.path,
                reason: f.reason,
              })),
            // Files from previous similar tasks (learning retrieval)
            ...historicalContext.previousAttempts
              .flatMap(attempt => attempt.keyFiles.map(path => ({
                path,
                reason: `From previous task: "${attempt.taskDescription.substring(0, 30)}..."`,
              })))
              .slice(0, 3), // Limit historical files
          ].filter((f, i, arr) =>
            // Deduplicate by path
            arr.findIndex(x => x.path === f.path) === i
          ),
          mustNotModify: [], // Would be populated by deeper analysis
          relatedExamples: [
            // Files from keyword search
            ...fileResult.relevantFiles
              .filter(f => f.priority !== 'high')
              .slice(0, 5)
              .map(f => ({
                path: f.path,
                similarity: f.reason,
              })),
            // Files from co-modification patterns (learning retrieval)
            ...historicalContext.coModificationPatterns
              .flatMap(p => p.files.map(path => ({
                path,
                similarity: `Co-modified in: ${p.typicalTask}`,
              })))
              .slice(0, 3),
          ].filter((f, i, arr) =>
            arr.findIndex(x => x.path === f.path) === i
          ),
        },

        // i[10]: Merge discovered patterns with task-type-aware patterns
        patterns: {
          namingConventions: taskTypeContent.patterns.conventions,
          fileOrganization: taskTypeContent.patterns.organization,
          testingApproach: patternResult.testingApproach, // Keep project-specific discovery
          errorHandling: patternResult.errorHandling,     // Keep project-specific discovery
          codeStyle: patternResult.codeStyle,             // Keep project-specific discovery
        },

        // i[10]: Use task-type-aware constraints instead of hardcoded code constraints
        constraints: {
          technical: archResult.dependencies.length > 10
            ? ['Large dependency graph - minimize new dependencies']
            : [],
          quality: taskTypeContent.qualityConstraints,
          timeline: null,
        },

        risks,

        // History section now populated by LearningRetriever (i[4])
        history: {
          previousAttempts: historicalContext.previousAttempts.map(attempt => ({
            what: attempt.taskDescription,
            result: attempt.outcome,
            lesson: attempt.lesson,
          })),
          relatedDecisions: historicalContext.relatedDecisions.map(decision => ({
            decision: decision.title,
            rationale: decision.rationale,
          })),
        },

        humanSync: {
          requiredBefore: risks.length > 2 ? ['execution'] : [],
          ambiguities: this.findAmbiguities(task.rawRequest),
        },
      };

      // Validate package
      const validation = this.validatePackage(contextPackage);
      if (!validation.valid) {
        return { success: false, error: `Package validation failed: ${validation.errors.join(', ')}` };
      }

      // Store package on task
      taskManager.setContextPackage(taskId, contextPackage);
      taskManager.transitionState(taskId, 'prepared', this.instanceId, 'ContextPackage ready');

      // Store to Mandrel
      await mandrel.storeContext(
        `ContextPackage prepared for task ${taskId}:\n${JSON.stringify(contextPackage, null, 2)}`,
        'completion',
        ['context-package', task.classification.projectType, this.instanceId]
      );

      console.log('[Foreman:Preparation] ContextPackage complete');
      return { success: true, package: contextPackage };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Foreman:Preparation] Error: ${message}`);

      taskManager.transitionState(taskId, 'failed', this.instanceId, message);
      return { success: false, error: message };
    }
  }

  /**
   * Extract keywords from a request for file discovery
   */
  private extractKeywords(request: string): string[] {
    // Remove common words
    const stopWords = new Set([
      'a', 'an', 'the', 'to', 'and', 'or', 'but', 'in', 'on', 'at', 'for',
      'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'must',
      'i', 'me', 'my', 'we', 'our', 'you', 'your', 'it', 'its',
      'this', 'that', 'these', 'those',
      'add', 'create', 'implement', 'fix', 'update', 'change', 'make',
      'want', 'need', 'please', 'can', 'help',
    ]);

    const words = request
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    // Return unique keywords, max 10
    return [...new Set(words)].slice(0, 10);
  }

  /**
   * Infer acceptance criteria from request
   */
  private inferAcceptanceCriteria(request: string): string[] {
    const criteria: string[] = [];

    if (request.toLowerCase().includes('test')) {
      criteria.push('Tests pass');
    }

    if (request.toLowerCase().includes('error') || request.toLowerCase().includes('bug')) {
      criteria.push('Error no longer occurs');
    }

    criteria.push('Code compiles without errors');
    criteria.push('Functionality works as described');

    return criteria;
  }

  /**
   * Assess risks based on analysis results
   */
  private assessRisks(
    task: ReturnType<typeof taskManager.getTask>,
    fileResult: FileDiscoveryResult,
    archResult: ArchitectureAnalysisResult
  ): Array<{ description: string; mitigation: string }> {
    const risks: Array<{ description: string; mitigation: string }> = [];

    if (fileResult.relevantFiles.length === 0) {
      risks.push({
        description: 'No relevant files found - may be working in wrong location',
        mitigation: 'Verify project path and keywords',
      });
    }

    if (fileResult.relevantFiles.length > 20) {
      risks.push({
        description: 'Many files affected - scope may be too broad',
        mitigation: 'Consider breaking into smaller tasks',
      });
    }

    if (archResult.dependencies.length > 30) {
      risks.push({
        description: 'Complex dependency graph',
        mitigation: 'Test thoroughly after changes',
      });
    }

    return risks;
  }

  /**
   * Find ambiguities that need human clarification
   */
  private findAmbiguities(request: string): string[] {
    const ambiguities: string[] = [];

    // Check for vague language
    const vagueTerms = ['better', 'improve', 'optimize', 'clean', 'nice', 'good'];
    for (const term of vagueTerms) {
      if (request.toLowerCase().includes(term)) {
        ambiguities.push(`"${term}" is subjective - needs specific criteria`);
      }
    }

    // Check for missing details
    if (request.length < 50) {
      ambiguities.push('Request is brief - may need more detail');
    }

    return ambiguities;
  }

  /**
   * Validate the ContextPackage
   */
  private validatePackage(pkg: ContextPackage): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!pkg.task.description) {
      errors.push('Missing task description');
    }

    if (pkg.codeContext.mustRead.length === 0 && pkg.codeContext.relatedExamples.length === 0) {
      errors.push('No code context identified');
    }

    // Check estimated size (rough context window check)
    const jsonSize = JSON.stringify(pkg).length;
    if (jsonSize > 50000) {
      errors.push(`Package too large (${jsonSize} chars) - may exceed context window`);
    }

    return { valid: errors.length === 0, errors };
  }
}

// Factory function
export function createPreparationForeman(instanceId: string): PreparationForeman {
  return new PreparationForeman(instanceId);
}
