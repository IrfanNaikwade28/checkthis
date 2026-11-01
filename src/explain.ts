import {
  InspectPathResult,
  ExplainResult,
  FileInspection,
  DirectoryStats,
} from "./types.ts";
import { formatSize, formatDate } from "./utils.ts";

function explainFile(entry: FileInspection): ExplainResult {
  const facts: string[] = [];
  const assumptions: string[] = [];

  facts.push(`Name: ${entry.name}`);
  facts.push(`Path: ${entry.absolutePath}`);
  facts.push(`Entry type: ${entry.kind}`);
  facts.push(`Size: ${formatSize(entry.size)}`);
  facts.push(`Extension: ${entry.extension || "(none)"}`);
  facts.push(`Hidden: ${entry.isHidden ? "yes" : "no"}`);
  facts.push(`Modified: ${formatDate(entry.modifiedAt)}`);
  facts.push(`Readable: ${entry.readable ? "yes" : "no"}`);

  if (entry.isSymlink && entry.target) {
    facts.push(`Symbolic link target: ${entry.target}`);
  }

  if (entry.error) {
    facts.push(
      `Inspection error: ${entry.error.code} — ${entry.error.message}`
    );
  }

  if (entry.size === 0 && entry.kind === "file") {
    assumptions.push("This file appears to be empty (0 bytes).");
  }

  if (entry.category === "text") {
    assumptions.push(
      `The "${entry.extension}" extension typically indicates a plain-text file.`
    );
  } else if (entry.category === "unknown" && entry.extension) {
    assumptions.push(
      `The file type could not be determined from the "${entry.extension}" extension alone.`
    );
  }

  const summary = `${entry.name} — ${entry.kind}, ${formatSize(entry.size)}`;

  return { summary, facts, assumptions };
}

function explainDirectory(entry: DirectoryStats): ExplainResult {
  const facts: string[] = [];
  const assumptions: string[] = [];

  facts.push(`Name: ${entry.name}`);
  facts.push(`Path: ${entry.absolutePath}`);
  facts.push(`Entry type: directory`);
  facts.push(`Files: ${entry.fileCount}`);
  facts.push(`Subdirectories: ${entry.directoryCount}`);
  facts.push(`Total size: ${formatSize(entry.totalSize)}`);
  facts.push(`Empty: ${entry.empty ? "yes" : "no"}`);
  facts.push(`Scan complete: ${entry.scanComplete ? "yes" : "no"}`);

  const distEntries = Object.entries(entry.extensionDistribution);
  if (distEntries.length > 0) {
    const dist = distEntries
      .map(([ext, count]) => `${ext || "(none)"}: ${count}`)
      .join(", ");
    facts.push(`Extension distribution: ${dist}`);
  }

  if (entry.inaccessible.length > 0) {
    facts.push(`Inaccessible entries: ${entry.inaccessible.length}`);
    for (const inc of entry.inaccessible) {
      facts.push(
        `  - ${inc.path}: ${inc.reason} (${inc.message})`
      );
    }
  }

  if (entry.symlinkLoopCount > 0) {
    facts.push(
      `Symbolic link loops detected: ${entry.symlinkLoopCount}`
    );
  }

  for (const warning of entry.warnings) {
    facts.push(`Warning: ${warning}`);
  }

  if (entry.empty) {
    assumptions.push(
      "This directory contains no files or subdirectories."
    );
  }

  const topExts = distEntries
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  if (topExts.length > 0) {
    const top = topExts
      .map(([ext, count]) => `${ext || "(none)"} (${count})`)
      .join(", ");
    assumptions.push(`This directory is dominated by ${top}.`);
  }

  const summary = `${entry.name} — ${entry.fileCount} files, ${entry.directoryCount} directories, ${formatSize(entry.totalSize)}`;

  return { summary, facts, assumptions };
}

function isDirectoryStats(
  entry: FileInspection | DirectoryStats
): entry is DirectoryStats {
  return "fileCount" in entry;
}

export function explain(result: InspectPathResult): ExplainResult {
  const { entry } = result;

  if (isDirectoryStats(entry)) {
    return explainDirectory(entry);
  }

  return explainFile(entry);
}
