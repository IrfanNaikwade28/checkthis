import assert from "node:assert/strict";
import * as path from "path";
import { describe, it } from "node:test";
import {
  getConfigDir,
  getConfigPath,
  getModelDir,
  getModelPath,
  getConfigDirForTesting,
} from "../../src/ai/paths.ts";

describe("paths", () => {
  describe("getConfigDirForTesting", () => {
    it("resolves Linux XDG path", () => {
      const result = getConfigDirForTesting("linux", "/home/user");
      assert.strictEqual(result, "/home/user/.local/share/checkthis");
    });

    it("resolves macOS path", () => {
      const result = getConfigDirForTesting("darwin", "/Users/user");
      assert.strictEqual(
        result,
        "/Users/user/Library/Application Support/checkthis"
      );
    });

    it("resolves Windows path", () => {
      const result = getConfigDirForTesting("win32", "C:\\Users\\user");
      const expected = path.win32.join(
        "C:\\",
        "Users",
        "user",
        "AppData",
        "Local",
        "checkthis"
      );
      assert.strictEqual(result, expected);
    });
  });

  describe("getConfigDir", () => {
    it("returns a non-empty absolute path", () => {
      const dir = getConfigDir();
      assert.ok(dir);
      assert.ok(dir.length > 0);
    });
  });

  describe("getConfigPath", () => {
    it("returns config.json inside config dir", () => {
      const configPath = getConfigPath();
      assert.ok(configPath.endsWith("config.json"));
      assert.ok(configPath.includes(getConfigDir()));
    });
  });

  describe("getModelDir", () => {
    it("returns models subdirectory inside config dir", () => {
      const modelDir = getModelDir();
      assert.ok(modelDir.endsWith("models"));
      assert.ok(modelDir.includes(getConfigDir()));
    });
  });

  describe("getModelPath", () => {
    it("returns model file path inside models dir", () => {
      const modelPath = getModelPath("qwen.gguf");
      assert.ok(modelPath.endsWith("qwen.gguf"));
      assert.ok(modelPath.includes(getModelDir()));
    });
  });
});
