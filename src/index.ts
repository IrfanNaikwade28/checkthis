// Public API functions
export { inspectPath } from "./inspect.ts";
export { analyzeDirectory } from "./directory.ts";
export { detectProject } from "./project.ts";
export { explain } from "./explain.ts";
export { render, renderTree, toJson } from "./render.ts";
export { formatSize } from "./utils.ts";

// AI public API
export {
  getConfigDir,
  getConfigPath,
  getModelDir,
  getModelPath,
  readConfig,
  writeConfig,
  createDefaultConfig,
  setStatus,
  setModel,
  clearModel,
  DEFAULT_CONFIG,
  getAIStatus,
  isAIEnabled,
  canPrompt,
  isSetupPending,
  isSetupFailed,
  isDeclined,
  isInstalled,
} from "./ai/index.ts";

// AI types
export type {
  AIStatus,
  AI_CONFIG_SCHEMA_VERSION,
  AIConfig,
  ModelMetadata,
  InferenceResult,
  AIProvider,
  AIStatusInfo,
} from "./ai/types.ts";

// Public types
export type {
  EntryKind,
  ProjectType,
  Confidence,
  InaccessibleReason,
  BaseEntry,
  InspectionError,
  FileInspection,
  DirectoryStats,
  DirectoryEntry,
  InaccessibleEntry,
  ProjectDetection,
  ExplainResult,
  InspectPathResult,
  InspectOptions,
  AnalyzeOptions,
  RenderOptions,
} from "./types.ts";
