import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getAIStatus,
  isAIEnabled,
  canPrompt,
  isSetupPending,
  isSetupFailed,
  isDeclined,
  isInstalled,
} from "../../src/ai/status.ts";
import { createDefaultConfig } from "../../src/ai/config.ts";

describe("status", () => {
  describe("getAIStatus", () => {
    it("returns not_configured for null config", () => {
      const status = getAIStatus(null);
      assert.strictEqual(status.status, "not_configured");
      assert.strictEqual(status.isEnabled, false);
      assert.strictEqual(status.canPrompt, true);
      assert.strictEqual(status.model, undefined);
    });

    it("returns declined status", () => {
      const config = createDefaultConfig();
      const status = getAIStatus({ ...config, status: "declined" });
      assert.strictEqual(status.status, "declined");
      assert.strictEqual(status.isEnabled, false);
      assert.strictEqual(status.canPrompt, false);
    });

    it("returns installed status with model", () => {
      const config = createDefaultConfig();
      const configWithModel = {
        ...config,
        status: "installed" as const,
        model: {
          name: "test.gguf",
          size: 100,
          quantization: "Q4_K_M",
          checksum: "abc",
          source: "test",
          downloadedAt: "2026-01-01T00:00:00Z",
        },
      };
      const status = getAIStatus(configWithModel);
      assert.strictEqual(status.status, "installed");
      assert.strictEqual(status.isEnabled, true);
      assert.strictEqual(status.canPrompt, false);
      assert.ok(status.model);
      assert.strictEqual(status.model!.name, "test.gguf");
    });

    it("returns installed without model as not enabled", () => {
      const config = createDefaultConfig();
      const configInstalledNoModel = {
        ...config,
        status: "installed" as const,
      };
      const status = getAIStatus(configInstalledNoModel);
      assert.strictEqual(status.status, "installed");
      assert.strictEqual(status.isEnabled, false);
      assert.strictEqual(status.canPrompt, true);
    });

    it("returns setup_pending as canPrompt", () => {
      const config = createDefaultConfig();
      const status = getAIStatus({
        ...config,
        status: "setup_pending" as const,
      });
      assert.strictEqual(status.status, "setup_pending");
      assert.strictEqual(status.isEnabled, false);
      assert.strictEqual(status.canPrompt, true);
    });

    it("returns setup_failed as canPrompt", () => {
      const config = createDefaultConfig();
      const status = getAIStatus({
        ...config,
        status: "setup_failed" as const,
      });
      assert.strictEqual(status.status, "setup_failed");
      assert.strictEqual(status.isEnabled, false);
      assert.strictEqual(status.canPrompt, true);
    });
  });

  describe("isAIEnabled", () => {
    it("returns false for null config", () => {
      assert.strictEqual(isAIEnabled(null), false);
    });

    it("returns false for not_configured", () => {
      const config = createDefaultConfig();
      assert.strictEqual(isAIEnabled(config), false);
    });

    it("returns false for declined", () => {
      const config = { ...createDefaultConfig(), status: "declined" as const };
      assert.strictEqual(isAIEnabled(config), false);
    });

    it("returns true for installed with model", () => {
      const config = {
        ...createDefaultConfig(),
        status: "installed" as const,
        model: {
          name: "test.gguf",
          size: 100,
          quantization: "Q4_K_M",
          checksum: "abc",
          source: "test",
          downloadedAt: "2026-01-01T00:00:00Z",
        },
      };
      assert.strictEqual(isAIEnabled(config), true);
    });
  });

  describe("canPrompt", () => {
    it("returns true for null config", () => {
      assert.strictEqual(canPrompt(null), true);
    });

    it("returns true for not_configured", () => {
      const config = createDefaultConfig();
      assert.strictEqual(canPrompt(config), true);
    });

    it("returns true for declined", () => {
      const config = { ...createDefaultConfig(), status: "declined" as const };
      assert.strictEqual(canPrompt(config), false);
    });

    it("returns false for installed", () => {
      const config = {
        ...createDefaultConfig(),
        status: "installed" as const,
        model: {
          name: "test.gguf",
          size: 100,
          quantization: "Q4_K_M",
          checksum: "abc",
          source: "test",
          downloadedAt: "2026-01-01T00:00:00Z",
        },
      };
      assert.strictEqual(canPrompt(config), false);
    });
  });

  describe("isSetupPending", () => {
    it("returns true for setup_pending", () => {
      const config = {
        ...createDefaultConfig(),
        status: "setup_pending" as const,
      };
      assert.strictEqual(isSetupPending(config), true);
    });

    it("returns false for not_configured", () => {
      const config = createDefaultConfig();
      assert.strictEqual(isSetupPending(config), false);
    });
  });

  describe("isSetupFailed", () => {
    it("returns true for setup_failed", () => {
      const config = {
        ...createDefaultConfig(),
        status: "setup_failed" as const,
      };
      assert.strictEqual(isSetupFailed(config), true);
    });

    it("returns false for not_configured", () => {
      const config = createDefaultConfig();
      assert.strictEqual(isSetupFailed(config), false);
    });
  });

  describe("isDeclined", () => {
    it("returns true for declined", () => {
      const config = { ...createDefaultConfig(), status: "declined" as const };
      assert.strictEqual(isDeclined(config), true);
    });

    it("returns false for not_configured", () => {
      const config = createDefaultConfig();
      assert.strictEqual(isDeclined(config), false);
    });
  });

  describe("isInstalled", () => {
    it("returns true for installed", () => {
      const config = {
        ...createDefaultConfig(),
        status: "installed" as const,
        model: {
          name: "test.gguf",
          size: 100,
          quantization: "Q4_K_M",
          checksum: "abc",
          source: "test",
          downloadedAt: "2026-01-01T00:00:00Z",
        },
      };
      assert.strictEqual(isInstalled(config), true);
    });

    it("returns false for not_configured", () => {
      const config = createDefaultConfig();
      assert.strictEqual(isInstalled(config), false);
    });
  });
});
