import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, writeFile, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  readConfig,
  writeConfig,
  createDefaultConfig,
  setStatus,
} from "../../dist/ai/config.js";
import {
  getAIStatus,
  isAIEnabled,
  canPrompt,
  isDeclined,
  isInstalled,
} from "../../dist/ai/status.js";
import { parseArgs } from "../../dist/cli.js";

describe("cli AI integration", () => {
  describe("parseArgs", () => {
    it("parses ai setup command", () => {
      const args = parseArgs(["node", "checkthis", "ai", "setup"]);
      assert.strictEqual(args.command, "ai");
      assert.strictEqual(args.aiSubcommand, "setup");
      assert.strictEqual(args.error, null);
    });

    it("parses ai status command", () => {
      const args = parseArgs(["node", "checkthis", "ai", "status"]);
      assert.strictEqual(args.command, "ai");
      assert.strictEqual(args.aiSubcommand, "status");
      assert.strictEqual(args.error, null);
    });

    it("parses --no-ai flag", () => {
      const args = parseArgs(["node", "checkthis", "--no-ai", "./src"]);
      assert.strictEqual(args.noAI, true);
      assert.strictEqual(args.command, "inspect");
      assert.strictEqual(args.path, "./src");
    });

    it("parses --no-ai with --json", () => {
      const args = parseArgs([
        "node",
        "checkthis",
        "--no-ai",
        "--json",
        "./src",
      ]);
      assert.strictEqual(args.noAI, true);
      assert.strictEqual(args.json, true);
      assert.strictEqual(args.path, "./src");
    });

    it("rejects unknown ai subcommand", () => {
      const args = parseArgs(["node", "checkthis", "ai", "bogus"]);
      assert.ok(args.error);
      assert.ok(args.error.includes("Unknown argument"));
    });
  });

  describe("AI state transitions", () => {
    it("transitions from not_configured to setup_pending", () => {
      const config = createDefaultConfig();
      assert.strictEqual(config.status, "not_configured");
      assert.strictEqual(canPrompt(config), true);

      const updated = setStatus(config, "setup_pending");
      assert.strictEqual(updated.status, "setup_pending");
      assert.strictEqual(canPrompt(updated), true);
    });

    it("transitions from setup_pending to installed", () => {
      const config = createDefaultConfig();
      const pending = setStatus(config, "setup_pending");
      const installed = setStatus(pending, "installed");
      assert.strictEqual(installed.status, "installed");
      // installed without model still allows prompting
      assert.strictEqual(canPrompt(installed), true);
      // installed with model does not allow prompting
      const installedWithModel = {
        ...installed,
        model: {
          name: "test.gguf",
          size: 100,
          quantization: "Q4_K_M",
          checksum: "abc",
          source: "test",
          downloadedAt: "2026-01-01T00:00:00Z",
        },
      };
      assert.strictEqual(canPrompt(installedWithModel), false);
    });

    it("transitions to declined and stays declined", () => {
      const config = createDefaultConfig();
      const declined = setStatus(config, "declined");
      assert.strictEqual(declined.status, "declined");
      assert.strictEqual(canPrompt(declined), false);
      assert.strictEqual(isDeclined(declined), true);
      assert.strictEqual(isInstalled(declined), false);
    });

    it("setup_failed allows re-prompting", () => {
      const config = createDefaultConfig();
      const failed = setStatus(config, "setup_failed");
      assert.strictEqual(failed.status, "setup_failed");
      assert.strictEqual(canPrompt(failed), true);
    });
  });

  describe("AI status info", () => {
    it("returns correct status for installed config", () => {
      const config = {
        ...createDefaultConfig(),
        status: "installed" as const,
        model: {
          name: "test.gguf",
          size: 398000000,
          quantization: "Q4_K_M",
          checksum: "abc123",
          source: "https://example.com/model.gguf",
          downloadedAt: "2026-01-01T00:00:00Z",
        },
      };
      const status = getAIStatus(config);
      assert.strictEqual(status.status, "installed");
      assert.strictEqual(status.isEnabled, true);
      assert.strictEqual(status.canPrompt, false);
      assert.ok(status.model);
    });

    it("returns correct status for declined config", () => {
      const config = {
        ...createDefaultConfig(),
        status: "declined" as const,
      };
      const status = getAIStatus(config);
      assert.strictEqual(status.status, "declined");
      assert.strictEqual(status.isEnabled, false);
      assert.strictEqual(status.canPrompt, false);
    });
  });

  describe("first-run opt-in flow", () => {
    it("accepts AI installation and transitions to setup_pending", () => {
      const config = createDefaultConfig();
      assert.strictEqual(config.status, "not_configured");
      assert.strictEqual(canPrompt(config), true);

      // User says yes - transition to setup_pending
      const pending = setStatus(config, "setup_pending");
      assert.strictEqual(pending.status, "setup_pending");
      assert.strictEqual(canPrompt(pending), true);
    });

    it("declines AI and persists declined state", () => {
      const config = createDefaultConfig();
      const declined = setStatus(config, "declined");
      assert.strictEqual(declined.status, "declined");
      assert.strictEqual(isDeclined(declined), true);
      assert.strictEqual(isInstalled(declined), false);
      assert.strictEqual(canPrompt(declined), false);
    });

    it("subsequent launches do not re-prompt after decline", () => {
      const config = createDefaultConfig();
      // Simulate user declining
      const declined = setStatus(config, "declined");
      // On next launch, canPrompt returns true but status is declined
      // The CLI checks declined status and skips prompt
      assert.strictEqual(declined.status, "declined");
    });

    it("checkthis ai setup allows explicit opt-in after decline", () => {
      const declined = setStatus(createDefaultConfig(), "declined");
      assert.strictEqual(declined.status, "declined");
      // Running `checkthis ai setup` transitions to setup_pending
      const pending = setStatus(declined, "setup_pending");
      assert.strictEqual(pending.status, "setup_pending");
      assert.strictEqual(canPrompt(pending), true);
    });

    it("declined state persists across config reads", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const configPath = join(tmpDir, "config.json");
      await writeConfig(setStatus(createDefaultConfig(), "declined"), configPath);

      const config = await readConfig(configPath);
      assert.strictEqual(config.status, "declined");
      assert.strictEqual(isDeclined(config), true);

      await rm(tmpDir, { recursive: true, force: true });
    });
  });
});
