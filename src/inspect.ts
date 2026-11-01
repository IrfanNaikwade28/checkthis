import * as fs from "fs/promises";
import type { Stats } from "fs";
import * as path from "path";
import {
  FileInspection,
  DirectoryStats,
  InspectPathResult,
  InspectOptions,
  InspectionError,
  EntryKind,
} from "./types.ts";
import {
  getExtension,
  isHidden,
  isTextExtension,
} from "./utils.ts";
import { detectProject } from "./project.ts";

const DEFAULT_MAX_CONTENT_SIZE = 1024 * 1024; // 1 MB
const DEFAULT_MAX_PREVIEW_BYTES = 8 * 1024; // 8 KB

function makeError(
  code: string,
  message: string,
  filePath: string,
  recoverable: boolean
): InspectionError {
  return { code, message, path: filePath, recoverable };
}

async function inspectPath(
  filePath: string,
  options: InspectOptions = {}
): Promise<InspectPathResult> {
  const {
    maxContentSize = DEFAULT_MAX_CONTENT_SIZE,
    maxPreviewBytes = DEFAULT_MAX_PREVIEW_BYTES,
    followSymlinks = false,
  } = options;

  const absolutePath = path.resolve(filePath);
  const name = path.basename(absolutePath);
  const extension = getExtension(absolutePath);
  const hidden = isHidden(absolutePath);

  let stat: Stats;
  try {
    stat = followSymlinks
      ? await fs.stat(absolutePath)
      : await fs.lstat(absolutePath);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    const entry: FileInspection = {
      kind: "file",
      name,
      path: filePath,
      absolutePath,
      isHidden: hidden,
      isSymlink: false,
      extension,
      size: 0,
      modifiedAt: new Date(),
      category: "unknown",
      readable: false,
      error: makeError(
        error.code ?? "UNKNOWN",
        error.message,
        absolutePath,
        error.code === "ENOENT" || error.code === "EACCES"
      ),
    };
    return {
      entry,
      explanation: {
        summary: `Unable to inspect ${name}`,
        facts: [`${error.code}: ${error.message}`],
        assumptions: [],
      },
    };
  }

  const isSymlink = stat.isSymbolicLink();
  let target: string | undefined;

  if (isSymlink) {
    try {
      target = await fs.readlink(absolutePath);
    } catch {
      // readlink failed; still a symlink
    }
  }

  let kind: EntryKind;
  if (stat.isDirectory()) {
    kind = "directory";
  } else if (stat.isSymbolicLink()) {
    kind = "symlink";
  } else {
    kind = "file";
  }

  const category = isTextExtension(extension) ? "text" : "unknown";
  const readable = true; // lstat succeeded, so we can at least stat it

  if (kind === "directory") {
    const entry: DirectoryStats = {
      kind: "directory",
      name,
      path: filePath,
      absolutePath,
      isHidden: hidden,
      isSymlink,
      target,
      fileCount: 0,
      directoryCount: 0,
      totalSize: 0,
      empty: true,
      extensionDistribution: {},
      inaccessible: [],
      symlinkLoopCount: 0,
      scanComplete: true,
      warnings: [],
    };

    const project = await detectProject(filePath);

    return {
      entry,
      project,
      explanation: {
        summary: `${name} is a directory`,
        facts: [`Type: directory`, `Size: 0 bytes (directory metadata only)`],
        assumptions: [],
      },
    };
  }

  const entry: FileInspection = {
    kind,
    name,
    path: filePath,
    absolutePath,
    isHidden: hidden,
    isSymlink,
    target,
    extension,
    size: stat.size,
    modifiedAt: stat.mtime,
    category,
    readable,
  };

  return {
    entry,
    explanation: {
      summary: `${name} is a ${kind}`,
      facts: [
        `Type: ${kind}`,
        `Size: ${stat.size} bytes`,
        `Extension: ${extension || "(none)"}`,
      ],
      assumptions: [],
    },
  };
}

export { inspectPath };
