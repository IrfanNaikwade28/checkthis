import * as fs from "fs/promises";
import type { Dirent } from "fs";
import * as path from "path";
import {
  DirectoryStats,
  AnalyzeOptions,
  InaccessibleEntry,
  FileInspection,
} from "./types.ts";
import { inspectPath } from "./inspect.ts";
import { getExtension, isHidden } from "./utils.ts";

const DEFAULT_EXCLUDES = new Set(["node_modules", ".git", "dist", "build"]);
const DEFAULT_MAX_ENTRIES = 10000;
const DEFAULT_MAX_DEPTH = 100;

async function analyzeDirectory(
  dirPath: string,
  options: AnalyzeOptions = {}
): Promise<DirectoryStats> {
  const {
    maxEntries = DEFAULT_MAX_ENTRIES,
    maxDepth = DEFAULT_MAX_DEPTH,
    followSymlinks = false,
    includeHidden = true,
  } = options;

  const absolutePath = path.resolve(dirPath);
  const name = path.basename(absolutePath);
  const hidden = isHidden(absolutePath);

  const excludes = new Set(DEFAULT_EXCLUDES);
  const inaccessible: InaccessibleEntry[] = [];
  const warnings: string[] = [];
  let symlinkLoopCount = 0;
  let entryCount = 0;
  let scanComplete = true;

  const visitedRealPaths = new Set<string>();

  async function walk(
    currentPath: string,
    currentDepth: number
  ): Promise<{
    fileCount: number;
    directoryCount: number;
    totalSize: number;
    extensionDistribution: Record<string, number>;
  }> {
    if (currentDepth > maxDepth) {
      scanComplete = false;
      warnings.push(`Maximum depth ${maxDepth} reached at ${currentPath}`);
      return { fileCount: 0, directoryCount: 0, totalSize: 0, extensionDistribution: {} };
    }

    if (entryCount >= maxEntries) {
      scanComplete = false;
      warnings.push(`Maximum entry count ${maxEntries} reached`);
      return { fileCount: 0, directoryCount: 0, totalSize: 0, extensionDistribution: {} };
    }

    let realPath: string;
    try {
      realPath = await fs.realpath(currentPath);
    } catch {
      realPath = currentPath;
    }

    if (visitedRealPaths.has(realPath)) {
      symlinkLoopCount++;
      scanComplete = false;
      warnings.push(`Symlink loop detected at ${currentPath}`);
      return { fileCount: 0, directoryCount: 0, totalSize: 0, extensionDistribution: {} };
    }
    visitedRealPaths.add(realPath);

    let entries: Dirent[];
    try {
      const dirHandle = await fs.opendir(currentPath);
      entries = [];
      for await (const entry of dirHandle) {
        entries.push(entry);
      }
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      inaccessible.push({
        path: currentPath,
        reason: error.code === "EACCES" ? "permission" : "other",
        message: error.message,
      });
      scanComplete = false;
      warnings.push(`Cannot read directory ${currentPath}: ${error.message}`);
      return { fileCount: 0, directoryCount: 0, totalSize: 0, extensionDistribution: {} };
    }

    let fileCount = 0;
    let directoryCount = 0;
    let totalSize = 0;
    const extensionDistribution: Record<string, number> = {};

    for (const entry of entries) {
      if (entryCount >= maxEntries) {
        scanComplete = false;
        warnings.push(`Maximum entry count ${maxEntries} reached`);
        break;
      }

      const fullPath = path.join(currentPath, entry.name);

      // Skip excluded directories
      if (entry.isDirectory() && excludes.has(entry.name)) {
        continue;
      }

      // Skip hidden files if not included
      if (!includeHidden && isHidden(fullPath)) {
        continue;
      }

      entryCount++;

      try {
        const stat = await fs.lstat(fullPath);

        if (stat.isSymbolicLink()) {
          // Symlinks are not counted as regular files and not traversed recursively
          if (!followSymlinks) {
            continue;
          }
          // If following symlinks, check for loops and recurse
          let linkTarget: string;
          try {
            linkTarget = await fs.readlink(fullPath);
          } catch {
            continue;
          }
          try {
            const targetStat = await fs.stat(linkTarget);
            if (targetStat.isDirectory()) {
              const result = await walk(linkTarget, currentDepth + 1);
              directoryCount += result.directoryCount + 1;
              fileCount += result.fileCount;
              totalSize += result.totalSize;
              for (const [ext, count] of Object.entries(result.extensionDistribution)) {
                extensionDistribution[ext] = (extensionDistribution[ext] ?? 0) + count;
              }
            } else {
              fileCount++;
              totalSize += targetStat.size;
              const ext = getExtension(linkTarget);
              extensionDistribution[ext] = (extensionDistribution[ext] ?? 0) + 1;
            }
          } catch (err) {
            const error = err as NodeJS.ErrnoException;
            inaccessible.push({
              path: fullPath,
              reason: error.code === "EACCES" ? "permission" : "other",
              message: error.message,
            });
          }
          continue;
        }

        if (stat.isDirectory()) {
          directoryCount++;
          const result = await walk(fullPath, currentDepth + 1);
          fileCount += result.fileCount;
          directoryCount += result.directoryCount;
          totalSize += result.totalSize;
          for (const [ext, count] of Object.entries(result.extensionDistribution)) {
            extensionDistribution[ext] = (extensionDistribution[ext] ?? 0) + count;
          }
        } else if (stat.isFile()) {
          fileCount++;
          totalSize += stat.size;
          const ext = getExtension(fullPath);
          extensionDistribution[ext] = (extensionDistribution[ext] ?? 0) + 1;
        }
      } catch (err) {
        const error = err as NodeJS.ErrnoException;
        inaccessible.push({
          path: fullPath,
          reason: error.code === "EACCES" ? "permission" : error.code === "ENOENT" ? "missing" : "other",
          message: error.message,
        });
        scanComplete = false;
      }
    }

    return { fileCount, directoryCount, totalSize, extensionDistribution };
  }

  const result = await walk(absolutePath, 0);

  const entry: DirectoryStats = {
    kind: "directory",
    name,
    path: dirPath,
    absolutePath,
    isHidden: hidden,
    isSymlink: false,
    fileCount: result.fileCount,
    directoryCount: result.directoryCount,
    totalSize: result.totalSize,
    empty: result.fileCount === 0 && result.directoryCount === 0,
    extensionDistribution: result.extensionDistribution,
    inaccessible,
    symlinkLoopCount,
    scanComplete,
    warnings,
  };

  return entry;
}

export { analyzeDirectory };
