import * as fs from "fs/promises";
import type { Dirent } from "fs";
import * as path from "path";
import {
  DirectoryStats,
  AnalyzeOptions,
  InaccessibleEntry,
  FileInspection,
  DirectoryEntry,
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
    tree = false,
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
    children?: DirectoryEntry[];
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

    // Deterministic sort: directories first, then alphabetical by name
    entries.sort((a, b) => {
      const aIsDir = a.isDirectory();
      const bIsDir = b.isDirectory();
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;
      return a.name.localeCompare(b.name);
    });

    let fileCount = 0;
    let directoryCount = 0;
    let totalSize = 0;
    const extensionDistribution: Record<string, number> = {};
    const children: DirectoryEntry[] = [];

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
          const entryNode: DirectoryEntry = {
            kind: "symlink",
            name: entry.name,
            path: fullPath,
            absolutePath: fullPath,
            isHidden: isHidden(fullPath),
            isSymlink: true,
            target: undefined,
          };

          try {
            entryNode.target = await fs.readlink(fullPath);
          } catch {
            // readlink failed; target remains undefined
          }

          // In tree view, symlinks are always leaf nodes — never traversed,
          // regardless of followSymlinks setting.
          if (tree) {
            children.push(entryNode);
            continue;
          }

          if (!followSymlinks) {
            continue;
          }

          // If following symlinks (non-tree mode only), check for loops and recurse
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
          const entryNode: DirectoryEntry = {
            kind: "directory",
            name: entry.name,
            path: fullPath,
            absolutePath: fullPath,
            isHidden: isHidden(fullPath),
            isSymlink: false,
          };
          const result = await walk(fullPath, currentDepth + 1);
          fileCount += result.fileCount;
          directoryCount += result.directoryCount;
          totalSize += result.totalSize;
          for (const [ext, count] of Object.entries(result.extensionDistribution)) {
            extensionDistribution[ext] = (extensionDistribution[ext] ?? 0) + count;
          }
          if (tree && result.children) {
            entryNode.children = result.children;
          }
          if (tree) {
            children.push(entryNode);
          }
        } else if (stat.isFile()) {
          fileCount++;
          totalSize += stat.size;
          const ext = getExtension(fullPath);
          extensionDistribution[ext] = (extensionDistribution[ext] ?? 0) + 1;
          if (tree) {
            children.push({
              kind: "file",
              name: entry.name,
              path: fullPath,
              absolutePath: fullPath,
              isHidden: isHidden(fullPath),
              isSymlink: false,
              size: stat.size,
            });
          }
        }
      } catch (err) {
        const error = err as NodeJS.ErrnoException;
        inaccessible.push({
          path: fullPath,
          reason: error.code === "EACCES" ? "permission" : error.code === "ENOENT" ? "missing" : "other",
          message: error.message,
        });
        scanComplete = false;
        if (tree) {
          children.push({
            kind: "file",
            name: entry.name,
            path: fullPath,
            absolutePath: fullPath,
            isHidden: isHidden(fullPath),
            isSymlink: false,
            inaccessible: [{ path: fullPath, reason: "other", message: error.message }],
            warnings: [error.message],
          });
        }
      }
    }

    return { fileCount, directoryCount, totalSize, extensionDistribution, children: tree ? children : undefined };
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

  if (tree && result.children) {
    entry.children = result.children;
  }

  return entry;
}

export { analyzeDirectory };
