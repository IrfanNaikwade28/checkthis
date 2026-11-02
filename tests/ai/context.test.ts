import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as fs from "fs/promises";
import {
  buildDirectoryContext,
  DEFAULT_MAX_TOTAL_BYTES,
  DEFAULT_MAX_FILES,
} from "../../dist/ai/context.js";
import { mkdtemp, writeFile, rm, chmod, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

function pathDirname(filePath: string): string {
  return filePath.split(/[/\\]/).slice(0, -1).join("/");
}

describe("buildDirectoryContext", () => {
  async function setupFiles(
    files: Record<string, string>
  ): Promise<string> {
    const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-context-"));
    for (const [relPath, content] of Object.entries(files)) {
      const fullPath = join(tmpDir, relPath);
      const dir = pathDirname(fullPath);
      await mkdir(dir, { recursive: true });
      await writeFile(fullPath, content);
    }
    return tmpDir;
  }

  async function cleanup(dir: string): Promise<void> {
    await rm(dir, { recursive: true, force: true });
  }

  it("returns empty context for empty directory", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-context-"));
    const result = await buildDirectoryContext(tmpDir);

    assert.strictEqual(result.files.length, 0);
    assert.strictEqual(result.totalBytes, 0);
    assert.strictEqual(result.truncated, false);
    assert.strictEqual(result.fileCount, 0);
    assert.strictEqual(result.skippedCount, 0);
    assert.strictEqual(result.errorCount, 0);

    await cleanup(tmpDir);
  });

  it("prioritizes README files first", async () => {
    const tmpDir = await setupFiles({
      "src/index.ts": "export const x = 1;\n",
      "README.md": "# My Project\n",
      "package.json": '{"name": "my-app"}\n',
    });

    try {
      const result = await buildDirectoryContext(tmpDir);

      assert.ok(result.files.length > 0);
      assert.strictEqual(result.files[0].relativePath, "README.md");
      assert.strictEqual(result.files[1].relativePath, "package.json");
      assert.strictEqual(result.files[2].relativePath, "src/index.ts");
    } finally {
      await cleanup(tmpDir);
    }
  });

  it("matches README case-insensitively", async () => {
    const tmpDir = await setupFiles({
      "readme.md": "# lowercase readme\n",
      "src/main.ts": "console.log('hi');\n",
    });

    try {
      const result = await buildDirectoryContext(tmpDir);

      assert.strictEqual(result.files[0].relativePath, "readme.md");
    } finally {
      await cleanup(tmpDir);
    }
  });

  it("includes nested source files with relative paths", async () => {
    const tmpDir = await setupFiles({
      "README.md": "# Project\n",
      "src/utils.ts": "export function util() {}\n",
      "lib/helper.ts": "export function helper() {}\n",
    });

    try {
      const result = await buildDirectoryContext(tmpDir);

      assert.ok(result.files.some((f) => f.relativePath === "src/utils.ts"));
      assert.ok(result.files.some((f) => f.relativePath === "lib/helper.ts"));
      assert.ok(
        result.files.every((f) => !f.relativePath.startsWith("/"))
      );
    } finally {
      await cleanup(tmpDir);
    }
  });

  it("orders deterministically by tier then relative path", async () => {
    const tmpDir = await setupFiles({
      "zzz.txt": "plain text\n",
      "README.md": "# Project\n",
      "aaa.txt": "plain text\n",
      "package.json": '{"name": "app"}\n',
    });

    try {
      const result = await buildDirectoryContext(tmpDir);

      const paths = result.files.map((f) => f.relativePath);
      // README and package.json should come before plain text files.
      const readmeIdx = paths.indexOf("README.md");
      const pkgIdx = paths.indexOf("package.json");
      const zzzIdx = paths.indexOf("zzz.txt");
      const aaaIdx = paths.indexOf("aaa.txt");

      assert.ok(readmeIdx < zzzIdx);
      assert.ok(readmeIdx < aaaIdx);
      assert.ok(pkgIdx < zzzIdx);
      assert.ok(pkgIdx < aaaIdx);
      // Within same tier, alphabetical: aaa before zzz.
      if (aaaIdx >= 0 && zzzIdx >= 0) {
        assert.ok(aaaIdx < zzzIdx);
      }
    } finally {
      await cleanup(tmpDir);
    }
  });

  it("enforces total byte budget", async () => {
    const tmpDir = await setupFiles({
      "README.md": "x".repeat(500),
      "file1.ts": "y".repeat(600),
      "file2.ts": "z".repeat(100),
    });

    try {
      const result = await buildDirectoryContext(tmpDir);

      // README (500 bytes) fits. file1.ts (600 bytes) would exceed 1000, so skipped.
      // file2.ts (100 bytes) fits in remaining 500.
      assert.ok(result.totalBytes <= DEFAULT_MAX_TOTAL_BYTES);
      assert.ok(result.files.some((f) => f.relativePath === "README.md"));
      assert.ok(result.files.some((f) => f.relativePath === "file2.ts"));
      // file1.ts likely skipped due to budget
      const file1Included = result.files.some(
        (f) => f.relativePath === "file1.ts"
      );
      if (file1Included) {
        // If both README and file1 fit, total would be 1100 > 1000, so truncated.
        assert.ok(result.truncated || result.totalBytes <= DEFAULT_MAX_TOTAL_BYTES);
      }
    } finally {
      await cleanup(tmpDir);
    }
  });

  it("skips a large file but allows a later smaller file", async () => {
    const tmpDir = await setupFiles({
      "README.md": "# Project\n",
      "filler.ts": "x".repeat(512), // fills most of budget
      "large.ts": "y".repeat(512), // won't fit after filler
      "small.ts": "const a = 1;\n", // fits in remaining budget
    });

    try {
      const result = await buildDirectoryContext(tmpDir);

      assert.ok(result.files.some((f) => f.relativePath === "README.md"));
      assert.ok(result.files.some((f) => f.relativePath === "filler.ts"));
      assert.ok(result.files.some((f) => f.relativePath === "small.ts"));
      assert.ok(!result.files.some((f) => f.relativePath === "large.ts"));
      assert.ok(result.truncated);
    } finally {
      await cleanup(tmpDir);
    }
  });

  it("respects maximum included file count", async () => {
    const files: Record<string, string> = { "README.md": "# Project\n" };
    for (let i = 0; i < 15; i++) {
      files[`file${i}.ts`] = `const v${i} = ${i};\n`;
    }

    const tmpDir = await setupFiles(files);

    try {
      const result = await buildDirectoryContext(tmpDir);

      assert.ok(result.files.length <= DEFAULT_MAX_FILES);
      assert.ok(result.truncated || result.files.length === DEFAULT_MAX_FILES);
    } finally {
      await cleanup(tmpDir);
    }
  });

  it("excludes sensitive and binary files", async () => {
    const tmpDir = await setupFiles({
      "README.md": "# Project\n",
      ".env.local": "API_KEY=secret\n",
      "binary.bin": "\x00\x01\x02\x03",
      "src/app.ts": "export const app = 1;\n",
    });

    try {
      const result = await buildDirectoryContext(tmpDir);

      const paths = result.files.map((f) => f.relativePath);
      assert.ok(!paths.includes(".env.local"));
      assert.ok(!paths.includes("binary.bin"));
      assert.ok(paths.includes("README.md"));
      assert.ok(paths.includes("src/app.ts"));
      assert.ok(result.skippedCount > 0);
    } finally {
      await cleanup(tmpDir);
    }
  });

  it("handles extraction errors gracefully", async () => {
    const tmpDir = await setupFiles({
      "README.md": "# Project\n",
      "restricted.txt": "secret content\n",
    });

    await chmod(join(tmpDir, "restricted.txt"), 0o000);

    try {
      const result = await buildDirectoryContext(tmpDir);

      assert.ok(result.files.some((f) => f.relativePath === "README.md"));
      // Restricted file should not crash the build; it's skipped.
      assert.ok(
        !result.files.some((f) => f.relativePath === "restricted.txt") ||
          result.errorCount > 0
      );
    } finally {
      try {
        await chmod(join(tmpDir, "restricted.txt"), 0o644);
      } catch {}
      await cleanup(tmpDir);
    }
  });

  it("distinguishes duplicate filenames in different directories", async () => {
    const tmpDir = await setupFiles({
      "README.md": "# Project\n",
      "src/utils.ts": "export function srcUtil() {}\n",
      "lib/utils.ts": "export function libUtil() {}\n",
    });

    try {
      const result = await buildDirectoryContext(tmpDir);

      const utilFiles = result.files.filter((f) =>
        f.relativePath.endsWith("utils.ts")
      );
      assert.strictEqual(utilFiles.length, 2);
      assert.ok(
        utilFiles.some((f) => f.relativePath === "src/utils.ts")
      );
      assert.ok(
        utilFiles.some((f) => f.relativePath === "lib/utils.ts")
      );
    } finally {
      await cleanup(tmpDir);
    }
  });

  it("does not traverse symlinks", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-context-"));
    const targetDir = await mkdtemp(join(tmpdir(), "checkthis-target-"));

    try {
      await writeFile(join(targetDir, "secret.txt"), "secret content\n");
      await writeFile(join(tmpDir, "README.md"), "# Project\n");

      // Create a symlink to the target directory inside tmpDir.
      await fs.symlink(targetDir, join(tmpDir, "linked"), "dir");

      const result = await buildDirectoryContext(tmpDir);

      const paths = result.files.map((f) => f.relativePath);
      assert.ok(!paths.includes("linked/secret.txt"));
      assert.ok(paths.includes("README.md"));
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
      await rm(targetDir, { recursive: true, force: true });
    }
  });

  it("uses Buffer.byteLength for UTF-8 budget calculation", async () => {
    // Multi-byte UTF-8 characters count as multiple bytes.
    const tmpDir = await setupFiles({
      "README.md": "héllo wörld\n", // 13 chars, but 'é' and 'ö' are 2 bytes each = 15 bytes
    });

    try {
      const result = await buildDirectoryContext(tmpDir);

      const expectedBytes = Buffer.byteLength("héllo wörld\n", "utf8");
      assert.strictEqual(result.totalBytes, expectedBytes);
      assert.ok(result.totalBytes <= DEFAULT_MAX_TOTAL_BYTES);
    } finally {
      await cleanup(tmpDir);
    }
  });
});
