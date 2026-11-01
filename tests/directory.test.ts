import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeDirectory } from "../dist/directory.js";
import { mkdtemp, writeFile, mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

describe("analyzeDirectory", () => {
  describe("basic directory scanning", () => {
    it("returns stats for an empty directory", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));

      const result = await analyzeDirectory(tmpDir);

      assert.strictEqual(result.kind, "directory");
      assert.strictEqual(result.fileCount, 0);
      assert.strictEqual(result.directoryCount, 0);
      assert.strictEqual(result.totalSize, 0);
      assert.strictEqual(result.empty, true);
      assert.strictEqual(result.scanComplete, true);

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("counts files in a directory", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(join(tmpDir, "a.txt"), "a");
      await writeFile(join(tmpDir, "b.txt"), "b");
      await writeFile(join(tmpDir, "c.ts"), "const x = 1;");

      const result = await analyzeDirectory(tmpDir);

      assert.strictEqual(result.fileCount, 3);
      assert.strictEqual(result.directoryCount, 0);
      assert.strictEqual(result.empty, false);
      assert.strictEqual(result.extensionDistribution[".txt"], 2);
      assert.strictEqual(result.extensionDistribution[".ts"], 1);

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("handles nested directories", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await mkdir(join(tmpDir, "sub"));
      await writeFile(join(tmpDir, "root.txt"), "root");
      await writeFile(join(tmpDir, "sub", "nested.txt"), "nested");

      const result = await analyzeDirectory(tmpDir);

      assert.strictEqual(result.fileCount, 2);
      assert.strictEqual(result.directoryCount, 1);

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("calculates total size", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(join(tmpDir, "small.txt"), "hi");
      await writeFile(join(tmpDir, "large.txt"), "x".repeat(1000));

      const result = await analyzeDirectory(tmpDir);

      assert.ok(result.totalSize > 1000);

      await rm(tmpDir, { recursive: true, force: true });
    });
  });

  describe("hidden files", () => {
    it("includes hidden files by default", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(join(tmpDir, ".env"), "secret=1");
      await writeFile(join(tmpDir, "visible.txt"), "visible");

      const result = await analyzeDirectory(tmpDir);

      assert.strictEqual(result.fileCount, 2);

      await rm(tmpDir, { recursive: true, force: true });
    });
  });

  describe("excluded directories", () => {
    it("excludes node_modules by default", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await mkdir(join(tmpDir, "node_modules"));
      await writeFile(join(tmpDir, "node_modules", "dep.js"), "dep");
      await writeFile(join(tmpDir, "index.js"), "main");

      const result = await analyzeDirectory(tmpDir);

      assert.strictEqual(result.fileCount, 1);
      assert.strictEqual(result.extensionDistribution[".js"], 1);

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("excludes .git by default", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await mkdir(join(tmpDir, ".git"));
      await writeFile(join(tmpDir, ".git", "config"), "config");
      await writeFile(join(tmpDir, "README.md"), "# readme");

      const result = await analyzeDirectory(tmpDir);

      assert.strictEqual(result.fileCount, 1);

      await rm(tmpDir, { recursive: true, force: true });
    });
  });

  describe("error handling", () => {
    it("handles missing directory", async () => {
      const result = await analyzeDirectory("/nonexistent/dir/path");
      assert.ok(result.warnings.length > 0 || result.inaccessible.length > 0);
    });
  });

  describe("max entries and depth", () => {
    it("respects maxEntries limit", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      for (let i = 0; i < 15; i++) {
        await writeFile(join(tmpDir, `file${i}.txt`), "x");
      }

      const result = await analyzeDirectory(tmpDir, { maxEntries: 5 });

      assert.ok(result.scanComplete === false || result.warnings.length > 0);

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("respects maxDepth limit", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      let current = tmpDir;
      for (let i = 0; i < 5; i++) {
        current = join(current, `level${i}`);
        await mkdir(current);
      }
      await writeFile(join(current, "deep.txt"), "deep");

      const result = await analyzeDirectory(tmpDir, { maxDepth: 2 });

      assert.ok(result.warnings.length > 0 || result.scanComplete === false);

      await rm(tmpDir, { recursive: true, force: true });
    });
  });
});
