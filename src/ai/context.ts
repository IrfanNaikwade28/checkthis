import * as path from "path";
import type {
  Confidence,
  DirectoryStats,
  DirectoryEntry,
  ProjectDetection,
  ProjectType,
} from "../types.ts";
import { detectProject } from "../project.ts";
import { analyzeDirectory } from "../directory.ts";
import { inspectContent } from "./content.ts";
import { getExtension } from "../utils.ts";

/** Default total content byte budget for the directory context. */
export const DEFAULT_MAX_TOTAL_BYTES = 1000;

/** Default maximum number of files to include in the context. */
export const DEFAULT_MAX_FILES = 10;

/**
 * README filenames matched case-insensitively.
 * Matches exactly "readme" (no extension) or "readme.<ext>" where <ext>
 * is a supported text extension. Case-insensitive.
 */
function isReadmeFilename(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower === "readme") {
    return true;
  }
  const dotIndex = lower.indexOf(".");
  if (dotIndex <= 0) {
    return false;
  }
  const base = lower.slice(0, dotIndex);
  if (base !== "readme") {
    return false;
  }
  const ext = lower.slice(dotIndex); // includes leading dot
  return SUPPORTED_EXTENSIONS.has(ext);
}

/** Package manifest filenames. */
const MANIFEST_FILENAMES = new Set([
  "package.json",
  "package-lock.json",
  "pyproject.toml",
  "requirements.txt",
  "setup.py",
  "cargo.toml",
  "cargo.lock",
  "go.mod",
  "go.sum",
  "pom.xml",
  "build.gradle",
]);

/** Important configuration filenames. */
const CONFIG_FILENAMES = new Set([
  "tsconfig.json",
  "dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  ".gitignore",
  ".eslintrc.json",
  ".eslintrc.js",
  ".eslintrc.ts",
  ".prettierrc",
  ".prettierrc.json",
  ".prettierrc.js",
  "vite.config.ts",
  "vite.config.js",
  "next.config.js",
  "next.config.mjs",
]);

/** Recognized entry point filenames. */
const ENTRY_FILENAMES = new Set([
  "index.ts",
  "index.tsx",
  "index.js",
  "index.jsx",
  "main.ts",
  "main.js",
  "app.py",
  "main.go",
  "main.rs",
  "main.java",
]);

/** Source file extensions. */
const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".swift",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".rb",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".sql",
]);

/** All supported text extensions (union of source + config-adjacent). */
const SUPPORTED_EXTENSIONS = new Set([
  ...SOURCE_EXTENSIONS,
  ".md",
  ".markdown",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".less",
  ".xml",
  ".csv",
  ".ini",
  ".cfg",
  ".conf",
  ".env",
]);

/**
 * A single file included in the directory context.
 */
export interface ContextFile {
  relativePath: string;
  extension: string;
  size: number;
  content: string;
  truncated: boolean;
  isText: boolean;
  isBinary: boolean;
  isExcluded: boolean;
  reason?: string;
}

/**
 * The directory context assembled for AI consumption.
 */
export interface DirectoryContext {
  dirPath: string;
  projectType: ProjectType;
  projectConfidence: Confidence;
  languages: string[];
  frameworks: string[];
  files: ContextFile[];
  totalBytes: number;
  truncated: boolean;
  fileCount: number;
  skippedCount: number;
  errorCount: number;
}

/**
 * Options for building a directory context.
 */
export interface ContextOptions {
  maxTotalBytes?: number;
  maxFiles?: number;
}

/**
 * Validate that a value is a finite, non-negative integer.
 */
function isValidNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
  );
}

/**
 * Flatten a directory tree into candidate file entries with relative paths.
 */
function flattenTree(
  entries: DirectoryEntry[],
  basePath: string,
  prefix: string
): { relativePath: string; absolutePath: string }[] {
  const result: { relativePath: string; absolutePath: string }[] = [];

  for (const entry of entries) {
    if (entry.kind === "file" || entry.kind === "symlink") {
      const relativePath = prefix
        ? `${prefix}/${entry.name}`
        : entry.name;
      const absolutePath = path.join(basePath, relativePath);
      result.push({ relativePath, absolutePath });
    } else if (entry.kind === "directory" && entry.children) {
      const relativePath = prefix
        ? `${prefix}/${entry.name}`
        : entry.name;
      result.push(
        ...flattenTree(entry.children, basePath, relativePath)
      );
    }
  }

  return result;
}

/**
 * Assign a priority tier to a file for selection ordering.
 * Lower numbers are selected first.
 */
function priorityTier(relativePath: string): number {
  const name = path.basename(relativePath).toLowerCase();

  if (isReadmeFilename(name)) {
    return 1;
  }

  if (MANIFEST_FILENAMES.has(name)) {
    return 2;
  }

  if (CONFIG_FILENAMES.has(name)) {
    return 3;
  }

  const dir = path.dirname(relativePath);
  const base = path.basename(relativePath, path.extname(relativePath));
  const entryName = `${dir ? dir + "/" : ""}${base}`.toLowerCase();

  if (
    ENTRY_FILENAMES.has(name) ||
    entryName === "src/index" ||
    entryName === "src/main" ||
    entryName === "lib/index" ||
    entryName === "lib/main" ||
    entryName === "app/index" ||
    entryName === "app/main"
  ) {
    return 4;
  }

  const ext = getExtension(relativePath).toLowerCase();
  if (SOURCE_EXTENSIONS.has(ext)) {
    return 5;
  }

  return 6;
}

/**
 * Sort candidate files deterministically by priority tier, then relative path.
 */
function sortCandidates(
  a: { relativePath: string; absolutePath: string },
  b: { relativePath: string; absolutePath: string }
): number {
  const tierA = priorityTier(a.relativePath);
  const tierB = priorityTier(b.relativePath);
  if (tierA !== tierB) {
    return tierA - tierB;
  }
  return a.relativePath.localeCompare(b.relativePath);
}

/**
 * Build a compact, safe directory context for AI consumption.
 *
 * Reuses analyzeDirectory() for traversal, detectProject() for project
 * metadata, and inspectContent() for safe per-file extraction. File
 * contents are bounded by the existing MAX_READ_BYTES per-file limit and
 * a total byte budget enforced with Buffer.byteLength(content, "utf8").
 *
 * Symlinks are not followed. Sensitive, binary, unreadable, and
 * unsupported files are skipped gracefully.
 */
export async function buildDirectoryContext(
  dirPath: string,
  options: ContextOptions = {}
): Promise<DirectoryContext> {
  const {
    maxTotalBytes = DEFAULT_MAX_TOTAL_BYTES,
    maxFiles = DEFAULT_MAX_FILES,
  } = options;

  if (!isValidNonNegativeInteger(maxTotalBytes)) {
    throw new TypeError(
      `maxTotalBytes must be a finite, non-negative integer, got: ${JSON.stringify(maxTotalBytes)}`
    );
  }
  if (!isValidNonNegativeInteger(maxFiles)) {
    throw new TypeError(
      `maxFiles must be a finite, non-negative integer, got: ${JSON.stringify(maxFiles)}`
    );
  }

  const absolutePath = path.resolve(dirPath);

  // Detect project metadata without duplicating project detection logic.
  let project: ProjectDetection;
  try {
    project = await detectProject(absolutePath);
  } catch {
    project = {
      detected: false,
      type: "unknown",
      types: [],
      markers: [],
      languages: [],
      frameworks: [],
      packageManagers: [],
      confidence: "low",
    };
  }

  // Analyze the directory tree, reusing existing traversal logic.
  let stats: DirectoryStats;
  try {
    stats = await analyzeDirectory(absolutePath, { tree: true });
  } catch (err) {
    const error = err as Error;
    throw new Error(
      `Failed to analyze directory "${dirPath}": ${error.message}`
    );
  }

  // Flatten the tree into candidate files with relative paths.
  const children = stats.children ?? [];
  const candidates = flattenTree(children, absolutePath, "");

  // Sort deterministically by priority tier, then relative path.
  candidates.sort(sortCandidates);

  const files: ContextFile[] = [];
  let totalBytes = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let truncated = false;

  for (const candidate of candidates) {
    // If we've reached the file limit, check whether any remaining
    // candidate would be eligible before claiming truncation.
    if (files.length >= maxFiles) {
      const remaining = await inspectContent(candidate.absolutePath);
      const eligible =
        remaining.isReadable &&
        remaining.isText &&
        !remaining.isBinary &&
        !remaining.isExcluded;
      if (eligible) {
        truncated = true;
      }
      break;
    }

    const result = await inspectContent(candidate.absolutePath);

    // Skip sensitive files entirely.
    if (result.isExcluded) {
      skippedCount++;
      continue;
    }

    // Skip unreadable files.
    if (!result.isReadable) {
      if (result.readError) {
        errorCount++;
      }
      skippedCount++;
      continue;
    }

    // Skip binary or unsupported files.
    if (result.isBinary || !result.isText) {
      skippedCount++;
      continue;
    }

    const content = result.content ?? "";
    const contentBytes = Buffer.byteLength(content, "utf8");

    // Enforce the total budget before adding this file.
    if (totalBytes + contentBytes > maxTotalBytes) {
      truncated = true;
      continue;
    }

    files.push({
      relativePath: candidate.relativePath,
      extension: result.extension,
      size: result.size,
      content,
      truncated: result.truncated,
      isText: result.isText,
      isBinary: result.isBinary,
      isExcluded: result.isExcluded,
      reason: result.reason,
    });

    totalBytes += contentBytes;
  }

  return {
    dirPath: absolutePath,
    projectType: project.type,
    projectConfidence: project.confidence,
    languages: project.languages,
    frameworks: project.frameworks,
    files,
    totalBytes,
    truncated,
    fileCount: files.length,
    skippedCount,
    errorCount,
  };
}
