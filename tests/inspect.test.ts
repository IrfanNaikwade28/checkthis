import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspectPath } from "../dist/inspect.js";
import { promises as fs } from "fs";
import { mkdtemp, writeFile, mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

describe("inspectPath", () => {
  let tmpDir: string;

  describe("file inspection", () => {
    it("returns metadata for an existing file", async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, "test.txt");
      await writeFile(filePath, "hello world");

      const result = await inspectPath(filePath);

      assert.strictEqual(result.entry.kind, "file");
      assert.strictEqual(result.entry.name, "test.txt");
      assert.strictEqual(result.entry.extension, ".txt");
      assert.ok(result.entry.size > 0);
      assert.ok(result.entry.absolutePath);
      assert.strictEqual(result.entry.isHidden, false);
      assert.strictEqual(result.entry.isSymlink, false);
      assert.strictEqual(result.entry.category, "text");
      assert.strictEqual(result.entry.readable, true);
      assert.ok(result.entry.modifiedAt instanceof Date);

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("handles missing files gracefully", async () => {
      const result = await inspectPath("/nonexistent/path/to/file.txt");

      assert.strictEqual(result.entry.readable, false);
      assert.ok(result.entry.error);
      assert.strictEqual(result.entry.error.code, "ENOENT");
    });

    it("detects hidden files", async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, ".hidden");
      await writeFile(filePath, "secret");

      const result = await inspectPath(filePath);

      assert.strictEqual(result.entry.isHidden, true);
      assert.strictEqual(result.entry.name, ".hidden");

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("detects file extensions", async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, "script.ts");
      await writeFile(filePath, "const x: number = 1;");

      const result = await inspectPath(filePath);

      assert.strictEqual(result.entry.extension, ".ts");
      assert.strictEqual(result.entry.category, "text");

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("returns empty extension for files without one", async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, "Makefile");
      await writeFile(filePath, "all:\n\techo hello\n");

      const result = await inspectPath(filePath);

      assert.strictEqual(result.entry.extension, "");

      await rm(tmpDir, { recursive: true, force: true });
    });
  });

  describe("directory inspection", () => {
    it("returns directory metadata", async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));

      const result = await inspectPath(tmpDir);

      assert.strictEqual(result.entry.kind, "directory");
      assert.strictEqual(result.entry.fileCount, 0);
      assert.strictEqual(result.entry.directoryCount, 0);
      assert.strictEqual(result.entry.empty, true);

      await rm(tmpDir, { recursive: true, force: true });
    });
  });
});
