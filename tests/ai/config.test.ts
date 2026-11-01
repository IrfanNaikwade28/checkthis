import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readConfig,
  writeConfig,
  createDefaultConfig,
  setStatus,
  setModel,
  clearModel,
  DEFAULT_CONFIG,
} from "../../src/ai/config.ts";
import { mkdtemp, writeFile, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

describe("config", () => {
  describe("createDefaultConfig", () => {
    it("creates a config with not_configured status", () => {
      const config = createDefaultConfig();
      assert.strictEqual(config.status, "not_configured");
      assert.strictEqual(config.version, 1);
      assert.ok(config.updatedAt);
    });
  });

  describe("readConfig / writeConfig", () => {
    it("returns null when no config file exists", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const configPath = join(tmpDir, "config.json");

      const result = await readConfig(configPath);
      assert.strictEqual(result, null);

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("writes and reads a config", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const configPath = join(tmpDir, "config.json");

      const config = createDefaultConfig();
      await writeConfig(config, configPath);

      const result = await readConfig(configPath);
      assert.ok(result);
      assert.strictEqual(result!.status, "not_configured");
      assert.strictEqual(result!.version, 1);

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("returns null for invalid JSON", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const configPath = join(tmpDir, "config.json");
      await writeFile(configPath, "{ not valid json }");

      const result = await readConfig(configPath);
      assert.strictEqual(result, null);

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("returns null for missing required fields", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const configPath = join(tmpDir, "config.json");
      await writeFile(configPath, JSON.stringify({ version: 1 }));

      const result = await readConfig(configPath);
      assert.strictEqual(result, null);

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("returns null for unsupported status", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const configPath = join(tmpDir, "config.json");
      await writeFile(
        configPath,
        JSON.stringify({ version: 1, status: "unknown_status", updatedAt: "2026-01-01T00:00:00Z" })
      );

      const result = await readConfig(configPath);
      assert.strictEqual(result, null);

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("returns null for unsupported config version", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const configPath = join(tmpDir, "config.json");
      await writeFile(
        configPath,
        JSON.stringify({
          version: 99,
          status: "not_configured",
          updatedAt: "2026-01-01T00:00:00Z",
        })
      );

      const result = await readConfig(configPath);
      assert.strictEqual(result, null);

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("atomic write: no .tmp file left behind", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const configPath = join(tmpDir, "config.json");

      const config = createDefaultConfig();
      await writeConfig(config, configPath);

      const tmpPath = configPath + ".tmp";
      const tmpExists = await stat(tmpPath).then(() => true, () => false);
      assert.strictEqual(tmpExists, false);

      const result = await readConfig(configPath);
      assert.ok(result);

      await rm(tmpDir, { recursive: true, force: true });
    });
  });

  describe("setStatus", () => {
    it("sets status to declined", () => {
      const config = createDefaultConfig();
      const updated = setStatus(config, "declined");
      assert.strictEqual(updated.status, "declined");
      assert.ok(updated.updatedAt);
    });

    it("sets status to installed", () => {
      const config = createDefaultConfig();
      const updated = setStatus(config, "installed");
      assert.strictEqual(updated.status, "installed");
      assert.ok(updated.updatedAt);
    });
  });

  describe("setModel and clearModel", () => {
    it("sets model metadata", () => {
      const config = createDefaultConfig();
      const model = {
        name: "Qwen2.5-0.5B-Instruct-Q4_K_M.gguf",
        size: 398000000,
        quantization: "Q4_K_M",
        checksum: "abc123",
        source: "https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF",
        downloadedAt: "2026-11-01T00:00:00Z",
      };
      const updated = setModel(config, model);
      assert.ok(updated.model);
      assert.strictEqual(updated.model!.name, model.name);
      assert.strictEqual(updated.model!.size, model.size);
    });

    it("clears model metadata", () => {
      const config = {
        ...createDefaultConfig(),
        model: {
          name: "test.gguf",
          size: 100,
          quantization: "Q4_K_M",
          checksum: "abc",
          source: "test",
          downloadedAt: "2026-01-01T00:00:00Z",
        },
      };
      const updated = clearModel(config);
      assert.strictEqual(updated.model, undefined);
    });
  });
});
