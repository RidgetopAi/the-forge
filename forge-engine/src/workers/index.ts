/**
 * Workers - Barrel export for all worker implementations
 *
 * Phase 3: Worker Implementations
 *
 * Workers are the labor force of The Forge. They execute focused tasks
 * using the Haiku tier and return structured results via the submit_result
 * pattern.
 *
 * Exploration Workers (canExplore=true, multi-turn):
 * - FileDiscoveryWorker - Discovers relevant files
 * - PatternExtractionWorker - Extracts coding patterns
 * - DependencyMapperWorker - Maps file dependencies
 * - ConstraintIdentifierWorker - Identifies project constraints
 *
 * Non-Exploration Workers (canExplore=false, single-turn):
 * - WebResearchWorker - Provides LLM training knowledge
 * - DocumentationReaderWorker - Extracts info from docs
 */

// Base worker class and types
export { BaseWorker } from './base.js';
export type {
  WorkerInput,
  WorkerAdditionalContext,
  WorkerMetrics,
  WorkerResult,
  ToolCallRecord,
} from './base.js';

// Tools
export {
  WORKER_TOOLS,
  executeTool,
  buildMinimalContext,
  getProjectSummary,
} from './tools.js';
export type { ToolInput, ToolResult } from './tools.js';

// FileDiscoveryWorker
export {
  FileDiscoveryWorker,
  FileDiscoveryOutputSchema,
  RelevantFileSchema,
  SuggestedFileSchema,
  FilePrioritySchema,
} from './file-discovery.js';
export type {
  FileDiscoveryOutput,
  RelevantFile,
  SuggestedFile,
  FilePriority,
} from './file-discovery.js';

// PatternExtractionWorker
export {
  PatternExtractionWorker,
  PatternExtractionOutputSchema,
  PatternSchema,
  AntiPatternSchema,
  ConventionsSchema,
} from './pattern-extraction.js';
export type {
  PatternExtractionOutput,
  Pattern,
  AntiPattern,
  Conventions,
} from './pattern-extraction.js';

// DependencyMapperWorker
export {
  DependencyMapperWorker,
  DependencyMappingOutputSchema,
  DependencySchema,
  DependencyTypeSchema,
  ExternalDependencySchema,
  EntryPointSchema,
  CircularDependencySchema,
} from './dependency-mapper.js';
export type {
  DependencyMappingOutput,
  Dependency,
  DependencyType,
  ExternalDependency,
  EntryPoint,
  CircularDependency,
} from './dependency-mapper.js';

// ConstraintIdentifierWorker
export {
  ConstraintIdentifierWorker,
  ConstraintIdentificationOutputSchema,
  TypeConstraintSchema,
  TestConstraintSchema,
  LintConstraintSchema,
  BuildConstraintSchema,
  ApiConstraintSchema,
  EnforcementSchema,
  SeveritySchema,
} from './constraint-identifier.js';
export type {
  ConstraintIdentificationOutput,
  TypeConstraint,
  TestConstraint,
  LintConstraint,
  BuildConstraint,
  ApiConstraint,
  Enforcement,
  Severity,
} from './constraint-identifier.js';

// WebResearchWorker
export {
  WebResearchWorker,
  WebResearchOutputSchema,
  FindingSchema,
  RecommendationSchema,
  UnknownSchema,
  RelevanceSchema,
} from './web-research.js';
export type {
  WebResearchOutput,
  Finding,
  Recommendation,
  Unknown,
  Relevance,
} from './web-research.js';

// DocumentationReaderWorker
export {
  DocumentationReaderWorker,
  DocumentationReadingOutputSchema,
  RelevantSectionSchema,
  ApiReferenceSchema,
  ExampleSchema,
  WarningSchema,
} from './documentation-reader.js';
export type {
  DocumentationReadingOutput,
  RelevantSection,
  ApiReference,
  Example,
  Warning,
} from './documentation-reader.js';
