import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inspectContent,
  MAX_READ_BYTES,
  MAX_TOTAL_CONTENT_BYTES,
} from "../../src/ai/content.ts";
import { mkdtemp, writeFile, rm, stat, chmod } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

describe("inspectContent", () => {
  describe("supported file types", () => {
    it("reads a small text file completely", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, "hello.ts");
      const content = "export const x = 1;\n";
      await writeFile(filePath, content);

      const result = await inspectContent(filePath);

      assert.strictEqual(result.isText, true);
      assert.strictEqual(result.isReadable, true);
      assert.strictEqual(result.isExcluded, false);
      assert.strictEqual(result.isBinary, false);
      assert.strictEqual(result.content, content);
      assert.strictEqual(result.truncated, false);
      assert.strictEqual(result.extension, ".ts");
      assert.strictEqual(result.size, content.length);

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("handles files larger than MAX_READ_BYTES", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, "large.ts");
      const content = "x".repeat(MAX_READ_BYTES + 100);
      await writeFile(filePath, content);

      const result = await inspectContent(filePath);

      assert.strictEqual(result.isText, true);
      assert.strictEqual(result.content.length, MAX_READ_BYTES);
      assert.strictEqual(result.truncated, true);
      assert.strictEqual(result.size, MAX_READ_BYTES + 100);

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("handles files exactly at MAX_READ_BYTES", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, "exact.ts");
      const content = "x".repeat(MAX_READ_BYTES);
      await writeFile(filePath, content);

      const result = await inspectContent(filePath);

      assert.strictEqual(result.content.length, MAX_READ_BYTES);
      assert.strictEqual(result.truncated, false);
      assert.strictEqual(result.size, MAX_READ_BYTES);

      await rm(tmpDir, { recursive: true, force: true });
    });
  });

  describe("unsupported file types", () => {
    it("skips unsupported extensions", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, "data.xyz");
      await writeFile(filePath, "some content");

      const result = await inspectContent(filePath);

      assert.strictEqual(result.isText, false);
      assert.strictEqual(result.isReadable, false);
      assert.strictEqual(result.isExcluded, false);
      assert.strictEqual(result.content, undefined);
      assert.strictEqual(result.truncated, false);
      assert.strictEqual(result.reason, "unsupported extension");

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("skips files with no extension", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, "Makefile");
      await writeFile(filePath, "all:\n\techo hi\n");

      const result = await inspectContent(filePath);

      assert.strictEqual(result.isText, false);
      assert.strictEqual(result.isReadable, false);
      assert.strictEqual(result.extension, "");
      assert.strictEqual(result.content, undefined);
      assert.strictEqual(result.reason, "unsupported extension");

      await rm(tmpDir, { recursive: true, force: true });
    });
  });

  describe("binary file detection", () => {
    it("detects binary files with null bytes", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, "binary.bin");
      const content = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x01, 0x02]);
      await writeFile(filePath, content);

      const result = await inspectContent(filePath);

      assert.strictEqual(result.isBinary, true);
      assert.strictEqual(result.isText, false);
      assert.strictEqual(result.content, undefined);
      assert.strictEqual(result.reason, "binary content detected");

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("detects invalid UTF-8 as binary", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpdir(), "invalid.bin");
      const content = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0xff, 0xfe]);
      await writeFile(filePath, content);

      const result = await inspectContent(filePath);

      assert.strictEqual(result.isBinary, true);
      assert.strictEqual(result.isText, false);
      assert.strictEqual(result.content, undefined);
      assert.strictEqual(result.reason, "invalid UTF-8");

      await rm(tmpDir, { recursive: true, force: true });
    });
  });

  describe("sensitive file detection", () => {
    it("skips .env files", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, ".env");
      await writeFile(filePath, "API_KEY=secret123");

      const result = await inspectContent(filePath);

      assert.strictEqual(result.isExcluded, true);
      assert.strictEqual(result.reason, "sensitive filename");
      assert.strictEqual(result.content, undefined);
      assert.strictEqual(result.isReadable, false);

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("skips .env.local files", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, ".env.local");
      await writeFile(filePath, "API_KEY=secret123");

      const result = await inspectContent(filePath);

      assert.strictEqual(result.isExcluded, true);
      assert.strictEqual(result.reason, "sensitive filename");

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("skips .env.production files", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, ".env.production");
      await writeFile(filePath, "API_KEY=secret123");

      const result = await inspectContent(filePath);

      assert.strictEqual(result.isExcluded, true);
      assert.strictEqual(result.reason, "sensitive filename");

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("skips .envrc files", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, ".envrc");
      await writeFile(filePath, "export FOO=bar");

      const result = await inspectContent(filePath);

      assert.strictEqual(result.isExcluded, true);
      assert.strictEqual(result.reason, "sensitive filename");

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("skips private key files", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, "id_rsa");
      await writeFile(filePath, "-----BEGIN RSA PRIVATE KEY-----\n");

      const result = await inspectContent(filePath);

      assert.strictEqual(result.isExcluded, true);
      assert.strictEqual(result.reason, "sensitive filename");

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("skips .pem files", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, "server.pem");
      await writeFile(filePath, "-----BEGIN CERTIFICATE-----\n");

      const result = await inspectContent(filePath);

      assert.strictEqual(result.isExcluded, true);
      assert.strictEqual(result.reason, "sensitive filename");

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("skips files with 'secret' in filename", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, "my_secret_config.txt");
      await writeFile(filePath, "password=hunter2");

      const result = await inspectContent(filePath);

      assert.strictEqual(result.isExcluded, true);
      assert.strictEqual(result.reason, "sensitive filename");

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("skips files with 'credentials' in filename", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, "db_credentials.json");
      await writeFile(filePath, '{"password": "hunter2"}');

      const result = await inspectContent(filePath);

      assert.strictEqual(result.isExcluded, true);
      assert.strictEqual(result.reason, "sensitive filename");

      await rm(tmpDir, { recursive: true, force: true });
    });
  });

  describe("credential redaction", () => {
    it("redacts password= values", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, "config.yaml");
      await writeFile(filePath, "password=supersecret\nother: value\n");

      const result = await inspectContent(filePath);

      assert.strictEqual(result.isText, true);
      assert.strictEqual(result.content, "password=[REDACTED]\nother: value\n");
      assert.strictEqual(result.content.includes("supersecret"), false);
      assert.strictEqual(result.content.includes("[REDACTED]"), true);

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("redacts API_KEY= values", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, "config.env");
      await writeFile(filePath, "API_KEY=sk-1234567890abcdef\n");

      const result = await inspectContent(filePath);

      assert.strictEqual(result.isExcluded, true);
      assert.strictEqual(result.content, undefined);
      assert.strictEqual(result.reason, "sensitive filename");

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("redacts multiple secrets in one file", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, "config.yml");
      await writeFile(filePath, "password=secret1\napi_key=secret2\nother=value\n");

      const result = await inspectContent(filePath);

      assert.strictEqual(result.content.includes("secret1"), false);
      assert.strictEqual(result.content.includes("secret2"), false);
      assert.strictEqual(result.content.includes("[REDACTED]"), true);
      assert.strictEqual(result.content.includes("other=value"), true);

      await rm(tmpDir, { recursive: true, force: true });
    });
  });

  describe("error handling", () => {
    it("handles missing files gracefully", async () => {
      const result = await inspectContent("/nonexistent/path/file.ts");

      assert.strictEqual(result.isText, false);
      assert.strictEqual(result.isReadable, false);
      assert.strictEqual(result.content, undefined);
      assert.ok(result.readError);
      assert.strictEqual(result.readError.code, "ENOENT");
    });

    it("handles inaccessible files gracefully", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, "restricted.txt");
      await writeFile(filePath, "secret content");
      await chmod(filePath, 0o000);

      try {
        const result = await inspectContent(filePath);
        if (result.isReadable) {
          assert.strictEqual(result.content, "secret content");
        } else {
          assert.ok(result.readError);
        }
      } finally {
        try {
          await chmod(filePath, 0o644);
        } catch {}
        await rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("determinism and immutability", () => {
    it("does not modify inspected file contents", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, "stable.ts");
      const content = "export const x = 1;\n";
      await writeFile(filePath, content);

      const before = await stat(filePath);
      const result = await inspectContent(filePath);
      const after = await stat(filePath);

      assert.strictEqual(result.content, content);
      assert.strictEqual(before.size, after.size);
      assert.strictEqual(before.mtimeMs, after.mtimeMs);

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("bounded extraction does not read entire file", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, "large.txt");
      const content = "x".repeat(MAX_READ_BYTES + 500);
      await writeFile(filePath, content);

      const result = await inspectContent(filePath);

      assert.strictEqual(result.content.length, MAX_READ_BYTES);
      assert.strictEqual(result.truncated, true);
      assert.strictEqual(result.size, MAX_READ_BYTES + 500);

      await rm(tmpDir, { recursive: true, force: true });
    });
  });
});
