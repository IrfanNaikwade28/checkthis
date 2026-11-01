import * as fs from "fs/promises";
import type { Stats } from "fs";
import * as path from "path";

/** Maximum bytes read from a single file. */
export const MAX_READ_BYTES = 512;

/** Maximum total bytes extracted across all files in a directory scan. */
export const MAX_TOTAL_CONTENT_BYTES = 1000;

/** Extensions considered safe for text content inspection. */
const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".less",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".swift",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".sql",
  ".env",
]);

/**
 * Filenames (exact match) that are always excluded from content reading,
 * regardless of extension. These are typically private key files that
 * should not be read at all.
 */
const SENSITIVE_FILENAMES = new Set([
  ".env",
  ".envrc",
  ".env.production",
  ".env.development",
  ".env.test",
  ".netrc",
  ".passwd",
  ".htpasswd",
  "id_rsa",
  "id_dsa",
  "id_ed25519",
  "id_ed25519_*",
  ".pem",
  ".key",
  ".rsa",
  ".dsa",
  ".jks",
  ".pfx",
]);

/**
 * Filename patterns (substring match) that are excluded from content reading.
 */
const SENSITIVE_FILENAME_SUBSTRINGS = [
  ".pem",
  ".key",
  ".rsa",
  ".dsa",
  ".jks",
  ".pfx",
  "secret",
  "credentials",
];

/**
 * Regex for common secret/credential assignment patterns in text files.
 * Matches lines like `password=value`, `API_KEY=...`, `secret_key=...`, etc.
 */
const SECRET_PATTERN = /(password|passwd|api[_-]key|api[_-]secret|api[_-]token|access[_-]token|auth[_-]token|private[_-]key|secret[_-]key|client[_-]secret|secret|token)\s*[:=]\s*[^\s;,}]+/gi;

/**
 * Result of inspecting a single file's content.
 */
export interface ContentInspection {
  path: string;
  name: string;
  extension: string;
  size: number;
  isText: boolean;
  isReadable: boolean;
  isExcluded: boolean;
  isBinary: boolean;
  content?: string;
  truncated: boolean;
  readError?: { code: string; message: string };
  reason?: string;
}

/**
 * Check whether a filename matches a sensitive filename pattern.
 * Returns true if the file should be skipped entirely.
 */
function isSensitiveFilename(filePath: string): boolean {
  const name = path.basename(filePath);

  if (SENSITIVE_FILENAMES.has(name)) {
    return true;
  }

  const lower = name.toLowerCase();

  // .env.* pattern: any hidden env file (e.g. .env.local, .env.production)
  if (lower.startsWith(".env.")) {
    return true;
  }

  // *.env pattern: any file ending with .env (e.g. config.env)
  if (lower.endsWith(".env")) {
    return true;
  }

  for (const substr of SENSITIVE_FILENAME_SUBSTRINGS) {
    if (lower.includes(substr)) {
      return true;
    }
  }

  return false;
}

/**
 * Check whether an extension is in the supported text set.
 */
function isSupportedTextExtension(extension: string): boolean {
  return TEXT_EXTENSIONS.has(extension);
}

/**
 * Check whether a Buffer contains a null byte.
 */
function containsNullByte(buf: Buffer): boolean {
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Validate UTF-8 encoding strictly. Returns false if the bytes contain
 * invalid UTF-8 sequences.
 */
function isValidUtf8(buf: Buffer): boolean {
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    decoder.decode(buf);
    return true;
  } catch {
    return false;
  }
}

/**
 * Redact likely secret/credential values from text content.
 * Replaces values after known secret key patterns with [REDACTED].
 */
function redactSecrets(text: string): string {
  return text.replace(
    SECRET_PATTERN,
    (match) => {
      const eqIndex = match.indexOf("=");
      const colonIndex = match.indexOf(":");
      const sepIndex = colonIndex >= 0 && colonIndex > eqIndex ? colonIndex : eqIndex;
      if (sepIndex === -1) {
        return match;
      }
      return match.slice(0, sepIndex + 1) + "[REDACTED]";
    }
  );
}

/**
 * Inspect a single file's content safely.
 *
 * Reads at most MAX_READ_BYTES bytes using a bounded read. Does not read
 * entire files into memory. Skips symlinks, non-regular files, sensitive
 * filenames, binary files, and invalid UTF-8.
 *
 * Returns a ContentInspection result describing what was found.
 */
export async function inspectContent(filePath: string): Promise<ContentInspection> {
  const result: ContentInspection = {
    path: filePath,
    name: "",
    extension: "",
    size: 0,
    isText: false,
    isReadable: false,
    isExcluded: false,
    isBinary: false,
    truncated: false,
  };

  // Check sensitive filename first (before any filesystem access).
  if (isSensitiveFilename(filePath)) {
    result.isExcluded = true;
    result.reason = "sensitive filename";
    return result;
  }

  const name = path.basename(filePath);
  const extension = getExtensionSafe(filePath);
  result.name = name;
  result.extension = extension;

  let stat: Stats;
  try {
    stat = await fs.lstat(filePath);
  } catch (err) {
    result.readError = {
      code: (err as NodeJS.ErrnoException).code ?? "UNKNOWN",
      message: (err as Error).message,
    };
    return result;
  }

  // Only regular files are read.
  if (!stat.isFile()) {
    result.reason = "not a regular file";
    return result;
  }

  result.size = stat.size;

  // Read at most MAX_READ_BYTES bytes using a bounded read.
  // Open the file first, then fstat to verify it's still a regular file
  // (defends against symlink races between lstat and open).
  let content = "";
  let truncated = false;

  let fd: fs.FileHandle | undefined;
  try {
    fd = await fs.open(filePath, "r");
    try {
      const fdStat = await fd.stat();
      if (!fdStat.isFile()) {
        result.reason = "not a regular file";
        return result;
      }
      result.size = fdStat.size;

      const buf = Buffer.alloc(MAX_READ_BYTES);
      const { bytesRead } = await fd.read(buf, 0, MAX_READ_BYTES, 0);
      const contentBuf = buf.slice(0, bytesRead);

      // Binary detection: null byte.
      if (containsNullByte(contentBuf)) {
        result.isBinary = true;
        result.reason = "binary content detected";
        return result;
      }

      // Strict UTF-8 validation.
      if (!isValidUtf8(contentBuf)) {
        result.isBinary = true;
        result.reason = "invalid UTF-8";
        return result;
      }

      // Check supported extension only after confirming it's text.
      if (!isSupportedTextExtension(extension) && !(extension === "" && name.startsWith("."))) {
        result.reason = "unsupported extension";
        return result;
      }

      content = buf.slice(0, bytesRead).toString("utf8");
      truncated = bytesRead === MAX_READ_BYTES && stat.size > MAX_READ_BYTES;

      // Redact secrets.
      const redacted = redactSecrets(content);
      if (redacted !== content) {
        content = redacted;
      }
    } finally {
      await fd?.close();
    }
  } catch (err) {
    result.readError = {
      code: (err as NodeJS.ErrnoException).code ?? "UNKNOWN",
      message: (err as Error).message,
    };
    return result;
  }

  result.isText = true;
  result.isReadable = true;
  result.content = content;
  result.truncated = truncated;
  return result;
}

/**
 * Get the file extension including the dot, lowercased.
 * Returns empty string for files with no extension.
 */
function getExtensionSafe(filePath: string): string {
  const name = path.basename(filePath);
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === name.length - 1) {
    return "";
  }
  return name.slice(dotIndex).toLowerCase();
}
