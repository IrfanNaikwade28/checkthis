import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as crypto from "crypto";
import * as path from "path";

export interface DownloadArtifact {
  name: string;
  url: string;
  size: number;
  sha256: string;
  destination: string;
}

export interface DownloadProgress {
  bytesDownloaded: number;
  totalBytes: number;
  percentage: number;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

export interface DownloadOptions {
  retries?: number;
  retryDelayMs?: number;
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
}

const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 2000;
const CHUNK_SIZE = 64 * 1024; // 64 KB chunks

export class DownloadError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "DownloadError";
    this.code = code;
  }
}

export class ChecksumError extends Error {
  readonly expected: string;
  readonly actual: string;

  constructor(message: string, expected: string, actual: string) {
    super(message);
    this.name = "ChecksumError";
    this.expected = expected;
    this.actual = actual;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function computeSha256(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk: Buffer) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function getRemoteSize(url: string, signal?: AbortSignal): Promise<number> {
  const controller = new AbortController();
  const abortHandler = () => controller.abort();
  if (signal) {
    signal.addEventListener("abort", abortHandler);
  }

  try {
    const res = await fetch(url, { method: "HEAD", signal: controller.signal });
    if (!res.ok) {
      throw new DownloadError(
        `HEAD request failed: ${res.status} ${res.statusText}`,
        "HTTP_ERROR"
      );
    }
    const sizeHeader = res.headers.get("content-length");
    if (!sizeHeader) {
      throw new DownloadError("Missing content-length header", "MISSING_SIZE");
    }
    return parseInt(sizeHeader, 10);
  } finally {
    if (signal) {
      signal.removeEventListener("abort", abortHandler);
    }
  }
}

export async function downloadArtifact(
  artifact: DownloadArtifact,
  options: DownloadOptions = {}
): Promise<void> {
  const {
    retries = DEFAULT_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    onProgress,
    signal,
  } = options;

  // Check if file already exists and matches checksum
  try {
    const existingHash = await computeSha256(artifact.destination);
    if (existingHash === artifact.sha256) {
      // File already valid, skip download
      if (onProgress) {
        onProgress({
          bytesDownloaded: artifact.size,
          totalBytes: artifact.size,
          percentage: 100,
        });
      }
      return;
    }
  } catch {
    // File doesn't exist or can't be read, proceed with download
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) {
      throw new DownloadError("Download aborted", "ABORTED");
    }

    try {
      await downloadWithResume(artifact, onProgress, signal);
      return; // Success — downloadWithResume already verified checksum
    } catch (err) {
      lastError = err as Error;

      // Don't retry checksum errors
      if (err instanceof ChecksumError) {
        throw err;
      }

      if (attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
      }
    }
  }

  throw lastError ?? new DownloadError("Download failed", "UNKNOWN");
}

async function downloadWithResume(
  artifact: DownloadArtifact,
  onProgress?: ProgressCallback,
  signal?: AbortSignal
): Promise<void> {
  const controller = new AbortController();
  const abortHandler = () => controller.abort();
  if (signal) {
    signal.addEventListener("abort", abortHandler);
  }

  const tempDestination = `${artifact.destination}.tmp`;

  try {
    // Check for partial download to resume from the destination file
    let startByte = 0;
    try {
      const stat = await fsPromises.stat(artifact.destination);
      startByte = stat.size;
    } catch {
      // File doesn't exist, start from 0
    }

    // Initialize temp file with existing partial data (if resuming)
    if (startByte > 0) {
      const existingData = await fsPromises.readFile(artifact.destination);
      await fsPromises.writeFile(tempDestination, existingData);
    } else {
      await fsPromises.writeFile(tempDestination, "");
    }

    const headers: Record<string, string> = {};
    if (startByte > 0) {
      headers["Range"] = `bytes=${startByte}-`;
    }

    const res = await fetch(artifact.url, {
      headers,
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new DownloadError(
        `Download failed: ${res.status} ${res.statusText}`,
        "HTTP_ERROR"
      );
    }

    const body = res.body;
    if (!body) {
      throw new DownloadError("No response body", "NO_BODY");
    }

    const totalSize =
      parseInt(res.headers.get("content-length") ?? "0", 10) + startByte;
    let bytesDownloaded = startByte;

    // Open temp file for writing at exact offset
    const fileHandle = await fsPromises.open(tempDestination, "r+");
    const writer = fileHandle.createWriteStream({ start: startByte });

    const reader = body.getReader();

    try {
      while (true) {
        if (signal?.aborted) {
          reader.releaseLock();
          throw new DownloadError("Download aborted", "ABORTED");
        }

        const { done, value } = await reader.read();
        if (done) break;

        // Backpressure: wait for drain if write buffer is full
        const writable = writer.write(value);
        if (!writable) {
          await new Promise<void>((resolve) => {
            writer.once("drain", resolve);
          });
        }
        bytesDownloaded += value.length;

        if (onProgress) {
          onProgress({
            bytesDownloaded,
            totalBytes: totalSize || artifact.size,
            percentage: totalSize
              ? Math.round((bytesDownloaded / totalSize) * 100)
              : 0,
          });
        }
      }

      writer.end();
      await new Promise<void>((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });
      await fileHandle.close();

      // Verify checksum of temp file before atomic replacement
      const actualHash = await computeSha256(tempDestination);
      if (actualHash !== artifact.sha256) {
        throw new ChecksumError(
          `Checksum mismatch for ${artifact.name}`,
          artifact.sha256,
          actualHash
        );
      }

      // Atomically replace destination with verified temp file
      await fsPromises.rename(tempDestination, artifact.destination);
    } finally {
      await fileHandle.close().catch(() => {
        // Ignore close errors during cleanup
      });
    }
  } catch (err) {
    // Clean up temp file on any failure
    try {
      await fsPromises.unlink(tempDestination);
    } catch {
      // Ignore if already removed or doesn't exist
    }
    throw err;
  } finally {
    if (signal) {
      signal.removeEventListener("abort", abortHandler);
    }
  }
}
