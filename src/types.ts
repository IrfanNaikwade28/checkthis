export type EntryKind = "file" | "directory" | "symlink";

export type ProjectType =
  | "node"
  | "python"
  | "rust"
  | "go"
  | "java"
  | "unknown";

export type Confidence = "low" | "medium" | "high";

export type InaccessibleReason =
  | "permission"
  | "missing"
  | "loop"
  | "other";

export interface BaseEntry {
  kind: EntryKind;
  name: string;
  path: string;
  absolutePath: string;
  isHidden: boolean;
  isSymlink: boolean;
  target?: string;
}

export interface InspectionError {
  code: string;
  message: string;
  path: string;
  recoverable: boolean;
}

export interface FileInspection extends BaseEntry {
  kind: EntryKind;
  extension: string;
  size: number;
  modifiedAt: Date;
  category: "text" | "binary" | "image" | "audio" | "video" | "unknown";
  readable: boolean;
  contentPreview?: string;
  error?: InspectionError;
}

export interface InaccessibleEntry {
  path: string;
  reason: InaccessibleReason;
  message: string;
}

export interface DirectoryStats extends BaseEntry {
  kind: "directory";
  fileCount: number;
  directoryCount: number;
  totalSize: number;
  empty: boolean;
  extensionDistribution: Record<string, number>;
  inaccessible: InaccessibleEntry[];
  symlinkLoopCount: number;
  scanComplete: boolean;
  warnings: string[];
}

export interface ProjectDetection {
  detected: boolean;
  type: ProjectType;
  markers: string[];
  languages: string[];
  confidence: Confidence;
}

export interface ExplainResult {
  summary: string;
  facts: string[];
  assumptions: string[];
  recommendations?: string[];
}

export interface InspectPathResult {
  entry: FileInspection | DirectoryStats;
  project?: ProjectDetection;
  explanation: ExplainResult;
}

export interface InspectOptions {
  maxContentSize?: number;
  maxPreviewBytes?: number;
  followSymlinks?: boolean;
}

export interface AnalyzeOptions {
  maxEntries?: number;
  maxDepth?: number;
  followSymlinks?: boolean;
  includeHidden?: boolean;
}

export interface RenderOptions {
  color?: boolean;
  width?: number;
}
