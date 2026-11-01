import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  downloadArtifact,
  DownloadError,
  ChecksumError,
} from "../../dist/ai/download.js";
import { mkdtemp, writeFile, rm, stat } from "fs/promises";
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
      const crypto = await import("crypto");
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

          const result = await stat(dest);
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
      const crypto = await import("crypto");
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
          const result = await stat(dest);
          assert.ok(result.isFile());
        }
      );

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("skips download if file already matches checksum", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const dest = join(tmpDir, "test.gguf");
      const content = "x".repeat(100);
      const crypto = await import("crypto");
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
          const result = await stat(dest);
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
  });
});
