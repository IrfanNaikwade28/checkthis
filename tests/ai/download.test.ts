import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as crypto from "crypto";
import {
  downloadArtifact,
  DownloadError,
  ChecksumError,
} from "../../dist/ai/download.js";
import * as fsPromises from "fs/promises";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// Mock fetch for testing
const originalFetch = globalThis.fetch;

async function withMockFetch(
  responseHandler: (url: string) => Promise<Response>,
  testFn: () => Promise<void>
) {
  globalThis.fetch = responseHandler as any;
  try {
    await testFn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe("download", () => {
  describe("downloadArtifact", () => {
    it("successfully downloads and verifies checksum", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const dest = join(tmpDir, "test.gguf");
      const content = "x".repeat(1000);
      const sha256 = crypto.createHash("sha256").update(content).digest("hex");

      await withMockFetch(
        async () =>
          new Response(content, {
            headers: { "content-length": String(content.length) },
          }),
        async () => {
          await downloadArtifact({
            name: "test.gguf",
            url: "https://example.com/test.gguf",
            size: content.length,
            sha256,
            destination: dest,
          });

          const result = await fsPromises.stat(dest);
          assert.ok(result.isFile());
        }
      );

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("fails checksum verification for corrupted download", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const dest = join(tmpDir, "test.gguf");
      const content = "x".repeat(1000);

      await withMockFetch(
        async () =>
          new Response(content, {
            headers: { "content-length": String(content.length) },
          }),
        async () => {
          await assert.rejects(
            downloadArtifact({
              name: "test.gguf",
              url: "https://example.com/test.gguf",
              size: content.length,
              sha256: "invalid-checksum",
              destination: dest,
            }),
            (err: Error) => err instanceof ChecksumError
          );
        }
      );

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("retries on transient failure", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const dest = join(tmpDir, "test.gguf");
      const content = "x".repeat(100);
      const sha256 = crypto.createHash("sha256").update(content).digest("hex");

      let callCount = 0;
      await withMockFetch(
        async () => {
          callCount++;
          if (callCount < 3) {
            return new Response("temporary error", { status: 500 });
          }
          return new Response(content, {
            headers: { "content-length": String(content.length) },
          });
        },
        async () => {
          await downloadArtifact({
            name: "test.gguf",
            url: "https://example.com/test.gguf",
            size: content.length,
            sha256,
            destination: dest,
          });

          assert.strictEqual(callCount, 3);
          const result = await fsPromises.stat(dest);
          assert.ok(result.isFile());
        }
      );

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("skips download if file already matches checksum", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const dest = join(tmpDir, "test.gguf");
      const content = "x".repeat(100);
      const sha256 = crypto.createHash("sha256").update(content).digest("hex");

      // Pre-create the file with correct content
      await writeFile(dest, content);

      let fetchCalled = false;
      await withMockFetch(
        async () => {
          fetchCalled = true;
          return new Response("should-not-be-called", {
            status: 200,
          });
        },
        async () => {
          await downloadArtifact({
            name: "test.gguf",
            url: "https://example.com/test.gguf",
            size: content.length,
            sha256,
            destination: dest,
          });

          assert.strictEqual(fetchCalled, false);
          const result = await fsPromises.stat(dest);
          assert.ok(result.isFile());
        }
      );

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("handles server disconnection mid-download", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const dest = join(tmpDir, "test.gguf");

      // Create a response that closes the stream prematurely
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("partial"));
          // Close the controller after enqueueing a small chunk
          // This simulates a server that disconnects mid-download
          setTimeout(() => controller.close(), 10);
        },
      });

      await withMockFetch(
        async () =>
          new Response(stream, {
            headers: { "content-length": "1000000" },
          }),
        async () => {
          await assert.rejects(
            downloadArtifact({
              name: "test.gguf",
              url: "https://example.com/test.gguf",
              size: 1000000,
              sha256: "fake",
              destination: dest,
            }),
            (err: Error) => err instanceof Error
          );
        }
      );

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("resumes a partial download with correct checksum", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const dest = join(tmpDir, "test.gguf");
      const fullContent = "x".repeat(2000);
      const sha256 = crypto.createHash("sha256").update(fullContent).digest("hex");

      // Pre-create a partial destination file (first 500 bytes)
      const partialContent = "x".repeat(500);
      await writeFile(dest, partialContent);

      let fetchCalls = 0;
      await withMockFetch(
        async (url) => {
          fetchCalls++;
          // Simulate server honoring Range request - return only the requested bytes
          const rangeStart = 500;
          const rangeContent = fullContent.slice(rangeStart);
          return new Response(rangeContent, {
            status: 206,
            headers: {
              "content-length": String(rangeContent.length),
              "content-range": `bytes ${rangeStart}-${fullContent.length - 1}/${fullContent.length}`,
            },
          });
        },
        async () => {
          await downloadArtifact({
            name: "test.gguf",
            url: "https://example.com/test.gguf",
            size: fullContent.length,
            sha256,
            destination: dest,
          });

          // Verify file size and content match
          const result = await fsPromises.stat(dest);
          assert.strictEqual(result.size, fullContent.length);
          const written = await fsPromises.readFile(dest);
          assert.strictEqual(written.toString(), fullContent);

          // Fetch should have been called once (for the resume request)
          assert.strictEqual(fetchCalls, 1);
        }
      );

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("preserves existing valid destination after download failure", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const dest = join(tmpDir, "test.gguf");
      const goodContent = "x".repeat(1000);
      const goodSha256 = crypto.createHash("sha256").update(goodContent).digest("hex");

      // Pre-create a valid destination file
      await writeFile(dest, goodContent);

      let fetchCalled = false;
      await withMockFetch(
        async () => {
          fetchCalled = true;
          return new Response("bad content", {
            headers: { "content-length": "11" },
          });
        },
        async () => {
          await assert.rejects(
            downloadArtifact({
              name: "test.gguf",
              url: "https://example.com/test.gguf",
              size: 11,
              sha256: "wrong-checksum",
              destination: dest,
            }),
            (err: Error) => err instanceof ChecksumError
          );

          // Destination should be unchanged (still the good content)
          assert.ok(fetchCalled, "fetch should have been called once");
          const written = await fsPromises.readFile(dest);
          assert.strictEqual(written.toString(), goodContent);
        }
      );

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("cleans up temporary file after cancellation", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const dest = join(tmpDir, "test.gguf");
      const controller = new AbortController();

      // Create a stream that emits data slowly, allowing abort to be caught
      const fullData = Buffer.alloc(100000, 0x41); // 100KB of 'A's
      let offset = 0;
      const stream = new ReadableStream({
        start(controller) {
          function pushChunk() {
            if (offset >= fullData.length) {
              controller.close();
              return;
            }
            const chunk = fullData.subarray(offset, Math.min(offset + 1000, fullData.length));
            offset += chunk.length;
            controller.enqueue(chunk);
            setTimeout(pushChunk, 5);
          }
          pushChunk();
        },
      });

      await withMockFetch(
        async () =>
          new Response(stream, {
            headers: { "content-length": String(fullData.length) },
          }),
        async () => {
          const downloadPromise = downloadArtifact({
            name: "test.gguf",
            url: "https://example.com/test.gguf",
            size: fullData.length,
            sha256: "fake",
            destination: dest,
            signal: controller.signal,
          });

          // Abort after a short delay - before the stream completes
          setTimeout(() => controller.abort(), 30);

          await assert.rejects(downloadPromise, (err: Error) => err instanceof Error);

          // Temp file should be cleaned up
          const tempDest = `${dest}.tmp`;
          let tempExists = false;
          try {
            await fsPromises.stat(tempDest);
            tempExists = true;
          } catch {
            // File doesn't exist - which is what we want
          }
          assert.strictEqual(tempExists, false, "Temp file should be cleaned up after abort");
        }
      );

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("handles backpressure during download", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const dest = join(tmpDir, "test.gguf");
      const content = "x".repeat(5000);
      const sha256 = crypto.createHash("sha256").update(content).digest("hex");

      // Create chunks that arrive one at a time to exercise chunked writes
      const chunks: Buffer[] = [];
      for (let i = 0; i < content.length; i += 100) {
        chunks.push(Buffer.from(content.slice(i, i + 100)));
      }

      let chunkIndex = 0;
      const stream = new ReadableStream({
        start(controller) {
          function pushChunk() {
            if (chunkIndex >= chunks.length) {
              controller.close();
              return;
            }
            controller.enqueue(chunks[chunkIndex++]);
            setTimeout(pushChunk, 1);
          }
          pushChunk();
        },
      });

      await withMockFetch(
        async () =>
          new Response(stream, {
            headers: { "content-length": String(content.length) },
          }),
        async () => {
          await downloadArtifact({
            name: "test.gguf",
            url: "https://example.com/test.gguf",
            size: content.length,
            sha256,
            destination: dest,
          });

          const result = await fsPromises.stat(dest);
          assert.strictEqual(result.size, content.length);
          const written = await fsPromises.readFile(dest);
          assert.strictEqual(written.toString(), content);
        }
      );

      await rm(tmpDir, { recursive: true, force: true });
    });
  });
});