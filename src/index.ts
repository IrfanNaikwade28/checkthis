// Public API functions
export { inspectPath } from "./inspect.ts";
export { analyzeDirectory } from "./directory.ts";
export { detectProject } from "./project.ts";
export { explain } from "./explain.ts";
export { render, renderTree, toJson } from "./render.ts";
export { formatSize } from "./utils.ts";

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
