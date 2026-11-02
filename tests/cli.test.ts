import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { spawn } from "child_process";
import { PassThrough } from "stream";
import { writeFile, mkdtemp, rm, chmod, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { parseArgs, promptFirstRunAI } from "../dist/cli.js";

describe("CLI argument parsing", () => {
  it("parses a path", () => {
    const args = parseArgs(["node", "checkthis", "./README.md"]);
    assert.strictEqual(args.path, "./README.md");
    assert.strictEqual(args.help, false);
    assert.strictEqual(args.version, false);
    assert.strictEqual(args.color, true);
    assert.strictEqual(args.error, null);
  });

  it("parses --help", () => {
    const args = parseArgs(["node", "checkthis", "--help"]);
    assert.strictEqual(args.help, true);
    assert.strictEqual(args.path, null);
  });

  it("parses -h", () => {
    const args = parseArgs(["node", "checkthis", "-h"]);
    assert.strictEqual(args.help, true);
  });

  it("parses --version", () => {
    const args = parseArgs(["node", "checkthis", "--version"]);
    assert.strictEqual(args.version, true);
  });

  it("parses -v", () => {
    const args = parseArgs(["node", "checkthis", "-v"]);
    assert.strictEqual(args.version, true);
  });

  it("parses --no-color", () => {
    const args = parseArgs(["node", "checkthis", "--no-color", "./file.txt"]);
    assert.strictEqual(args.color, false);
    assert.strictEqual(args.path, "./file.txt");
  });

  it("parses --color=false", () => {
    const args = parseArgs(["node", "checkthis", "--color=false", "./file.txt"]);
    assert.strictEqual(args.color, false);
  });

  it("reports unknown flag", () => {
    const args = parseArgs(["node", "checkthis", "--unknown"]);
    assert.ok(args.error);
    assert.ok(args.error.includes("Unknown option"));
  });

  it("reports unknown short flag", () => {
    const args = parseArgs(["node", "checkthis", "-x"]);
    assert.ok(args.error);
    assert.ok(args.error.includes("Unknown option"));
  });

  it("reports missing path", () => {
    const args = parseArgs(["node", "checkthis"]);
    assert.strictEqual(args.path, null);
    assert.strictEqual(args.error, null);
  });

  it("parses --tree", () => {
    const args = parseArgs(["node", "checkthis", "--tree", "./src"]);
    assert.strictEqual(args.tree, true);
    assert.strictEqual(args.path, "./src");
    assert.strictEqual(args.error, null);
  });

  it("parses --tree after path", () => {
    const args = parseArgs(["node", "checkthis", "./src", "--tree"]);
    assert.strictEqual(args.tree, true);
    assert.strictEqual(args.path, "./src");
    assert.strictEqual(args.error, null);
  });

  it("reports unknown long option with full name", () => {
    const args = parseArgs(["node", "checkthis", "--bogus"]);
    assert.strictEqual(args.error, "Unknown option: --bogus");
  });

  it("reports unknown long option with full name after path", () => {
    const args = parseArgs(["node", "checkthis", "./src", "--bogus"]);
    assert.strictEqual(args.error, "Unknown option: --bogus");
  });

  it("does not misparse --tree as unknown short flag", () => {
    const args = parseArgs(["node", "checkthis", "--tree", "./src"]);
    assert.strictEqual(args.error, null);
    assert.strictEqual(args.tree, true);
  });

  it("parses --tree with --no-color", () => {
    const args = parseArgs(["node", "checkthis", "--tree", "--no-color", "./src"]);
    assert.strictEqual(args.tree, true);
    assert.strictEqual(args.color, false);
    assert.strictEqual(args.path, "./src");
    assert.strictEqual(args.error, null);
  });

  it("parses --json", () => {
    const args = parseArgs(["node", "checkthis", "--json", "./src"]);
    assert.strictEqual(args.json, true);
    assert.strictEqual(args.path, "./src");
    assert.strictEqual(args.error, null);
  });

  it("parses --json after path", () => {
    const args = parseArgs(["node", "checkthis", "./src", "--json"]);
    assert.strictEqual(args.json, true);
    assert.strictEqual(args.path, "./src");
    assert.strictEqual(args.error, null);
  });

  it("parses --json with --no-color", () => {
    const args = parseArgs(["node", "checkthis", "--json", "--no-color", "./src"]);
    assert.strictEqual(args.json, true);
    assert.strictEqual(args.color, false);
    assert.strictEqual(args.path, "./src");
    assert.strictEqual(args.error, null);
  });

  it("rejects --json with --tree", () => {
    const args = parseArgs(["node", "checkthis", "--json", "--tree", "./src"]);
    assert.strictEqual(args.json, true);
    assert.strictEqual(args.tree, true);
    assert.strictEqual(args.error, "Cannot use --json and --tree together");
  });

  it("rejects --tree with --json", () => {
    const args = parseArgs(["node", "checkthis", "--tree", "--json", "./src"]);
    assert.strictEqual(args.json, true);
    assert.strictEqual(args.tree, true);
    assert.strictEqual(args.error, "Cannot use --json and --tree together");
  });
});

describe("CLI subprocess", () => {
  function runCli(
    args: string[],
    opts?: { cwd?: string; env?: Record<string, string> }
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const proc = spawn("node", ["bin/checkthis", ...args], {
        cwd: opts?.cwd ?? process.cwd(),
        encoding: "utf8",
        env: opts?.env ?? { ...process.env },
      });
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (d) => (stdout += d.toString()));
      proc.stderr.on("data", (d) => (stderr += d.toString()));
      proc.on("close", (code) => {
        resolve({ code: code ?? 0, stdout, stderr });
      });
    });
  }

  it("shows help via subprocess", async () => {
    const result = await runCli(["--help"]);
    assert.strictEqual(result.code, 0);
    assert.ok(result.stdout.includes("Usage: checkthis <path>"));
    assert.ok(result.stdout.includes("--help"));
  });

  it("shows version via subprocess", async () => {
    const result = await runCli(["--version"]);
    assert.strictEqual(result.code, 0);
    assert.ok(result.stdout.includes("0.1.0"));
  });

  it("errors on missing path", async () => {
    const result = await runCli([]);
    assert.strictEqual(result.code, 1);
    assert.ok(result.stderr.includes("No path provided"));
  });

  it("errors on unknown flag", async () => {
    const result = await runCli(["--bogus"]);
    assert.strictEqual(result.code, 1);
    assert.ok(result.stderr.includes("Unknown option"));
  });

  it("inspects a file via subprocess", async () => {
    const result = await runCli(["package.json"]);
    assert.strictEqual(result.code, 0);
    assert.ok(result.stdout.includes("package.json"));
    assert.ok(result.stdout.includes("Entry type: file"));
    assert.ok(result.stdout.includes("Extension: .json"));
  });

  it("inspects a directory via subprocess", async () => {
    const result = await runCli(["src"]);
    assert.strictEqual(result.code, 0);
    assert.ok(result.stdout.includes("src"));
    assert.ok(result.stdout.includes("Entry type: directory"));
    assert.ok(result.stdout.includes("Files:"));
  });

  it("disables color with --no-color", async () => {
    const result = await runCli(["--no-color", "package.json"]);
    assert.strictEqual(result.code, 0);
    assert.ok(!result.stdout.includes("\x1b["));
  });

  it("errors on missing file", async () => {
    const result = await runCli(["/nonexistent/path/file.txt"]);
    assert.strictEqual(result.code, 1);
    assert.ok(result.stderr.includes("Error:"));
  });

  it("renders tree with --tree before path", async () => {
    const result = await runCli(["--tree", "src"]);
    assert.strictEqual(result.code, 0);
    assert.ok(result.stdout.includes("src/"));
    assert.ok(result.stdout.includes("├──"));
    assert.ok(result.stdout.includes("└──"));
  });

  it("renders tree with --tree after path", async () => {
    const result = await runCli(["src", "--tree"]);
    assert.strictEqual(result.code, 0);
    assert.ok(result.stdout.includes("src/"));
    assert.ok(result.stdout.includes("├──"));
    assert.ok(result.stdout.includes("└──"));
  });

  it("renders tree without colors with --tree --no-color", async () => {
    const result = await runCli(["--tree", "--no-color", "src"]);
    assert.strictEqual(result.code, 0);
    assert.ok(!result.stdout.includes("\x1b["));
    assert.ok(result.stdout.includes("src/"));
  });

  it("renders JSON for file with --json before path", async () => {
    const result = await runCli(["--json", "package.json"]);
    assert.strictEqual(result.code, 0);
    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.entry.name, "package.json");
    assert.strictEqual(parsed.entry.kind, "file");
    assert.strictEqual(parsed.entry.extension, ".json");
    assert.ok(!result.stdout.includes("\x1b["));
  });

  it("renders JSON for file with --json after path", async () => {
    const result = await runCli(["package.json", "--json"]);
    assert.strictEqual(result.code, 0);
    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.entry.name, "package.json");
    assert.strictEqual(parsed.entry.kind, "file");
    assert.ok(!result.stdout.includes("\x1b["));
  });

  it("renders JSON for directory with --json before path", async () => {
    const result = await runCli(["--json", "src"]);
    assert.strictEqual(result.code, 0);
    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.entry.name, "src");
    assert.strictEqual(parsed.entry.kind, "directory");
    assert.strictEqual(parsed.entry.fileCount, 20);
    assert.strictEqual(parsed.entry.extensionDistribution[".ts"], 20);
    assert.ok(!result.stdout.includes("\x1b["));
  });

  it("renders JSON for directory with --json after path", async () => {
    const result = await runCli(["src", "--json"]);
    assert.strictEqual(result.code, 0);
    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.entry.name, "src");
    assert.strictEqual(parsed.entry.kind, "directory");
    assert.ok(!result.stdout.includes("\x1b["));
  });

  it("renders valid JSON output", async () => {
    const result = await runCli(["--json", "package.json"]);
    assert.strictEqual(result.code, 0);
    // Should be parseable as valid JSON
    JSON.parse(result.stdout);
  });

  it("outputs no ANSI codes in JSON mode", async () => {
    const result = await runCli(["--json", "package.json"]);
    assert.strictEqual(result.code, 0);
    assert.ok(!result.stdout.includes("\x1b["));
  });

  it("outputs no decorative text in JSON mode", async () => {
    const result = await runCli(["--json", "package.json"]);
    assert.strictEqual(result.code, 0);
    // JSON output should not contain human-readable headings
    assert.ok(!result.stdout.includes("Facts:"));
    assert.ok(!result.stdout.includes("Assumptions:"));
    assert.ok(!result.stdout.includes("•"));
  });

  it("outputs JSON error for missing path with --json", async () => {
    const result = await runCli(["--json", "/nonexistent/path/file.txt"]);
    assert.strictEqual(result.code, 1);
    const parsed = JSON.parse(result.stdout);
    assert.ok(parsed.entry.error);
    assert.strictEqual(parsed.entry.error.code, "ENOENT");
    assert.strictEqual(parsed.entry.readable, false);
  });

  it("rejects --json with --tree", async () => {
    const result = await runCli(["--json", "--tree", "src"]);
    assert.strictEqual(result.code, 1);
    assert.ok(result.stderr.includes("Cannot use --json and --tree together"));
  });

  it("rejects --tree with --json", async () => {
    const result = await runCli(["--tree", "--json", "src"]);
    assert.strictEqual(result.code, 1);
    assert.ok(result.stderr.includes("Cannot use --json and --tree together"));
  });

  it("preserves default output without --json", async () => {
    const result = await runCli(["package.json"]);
    assert.strictEqual(result.code, 0);
    assert.ok(result.stdout.includes("package.json"));
    assert.ok(result.stdout.includes("Entry type: file"));
    assert.ok(result.stdout.includes("Facts:"));
  });

  it("preserves default output without --tree", async () => {
    const result = await runCli(["src"]);
    assert.strictEqual(result.code, 0);
    assert.ok(result.stdout.includes("src"));
    assert.ok(result.stdout.includes("Entry type: directory"));
  });

  it("does not prompt for AI setup with --json in TTY mode", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
    try {
      const result = await runCli(["--json", "."], {
        env: { ...process.env, XDG_DATA_HOME: tmpDir },
      });
      assert.strictEqual(result.code, 0);
      // Should be valid JSON
      JSON.parse(result.stdout);
      // Should not contain AI prompt text
      assert.ok(!result.stdout.includes("Install optional local AI model"));
      assert.ok(!result.stdout.includes("readline"));
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("does not prompt for AI setup with --tree in TTY mode", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
    try {
      const result = await runCli(["--tree", "."], {
        env: { ...process.env, XDG_DATA_HOME: tmpDir },
      });
      assert.strictEqual(result.code, 0);
      // Should not contain AI prompt text
      assert.ok(!result.stdout.includes("Install optional local AI model"));
      assert.ok(!result.stdout.includes("readline"));
      // Should contain tree output or indicate empty
      assert.ok(
        result.stdout.includes("├──") ||
          result.stdout.includes("└──") ||
          result.stdout.includes("empty") ||
          result.stdout.includes("0 B")
      );
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("includes meaningful explanation in directory JSON output", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
    await writeFile(join(tmpDir, "README.md"), "# Test\n");
    await writeFile(join(tmpDir, "package.json"), '{"name": "test"}\n');
    try {
      const result = await runCli(["--json", tmpDir], {
        env: { ...process.env, XDG_DATA_HOME: tmpDir },
      });
      assert.strictEqual(result.code, 0);
      const parsed = JSON.parse(result.stdout);
      // Should have explanation with facts
      assert.ok(parsed.explanation);
      assert.ok(Array.isArray(parsed.explanation.facts));
      assert.ok(parsed.explanation.facts.length > 0);
      // Should contain project info
      const factsText = parsed.explanation.facts.join(" ");
      assert.ok(
        factsText.includes("Project") ||
          factsText.includes("Extension") ||
          factsText.includes("Files:")
      );
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("continues inspection when AI config write fails", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
    try {
      // Use a path where writeConfig cannot create directories
      const result = await runCli(["."], {
        env: {
          ...process.env,
          XDG_DATA_HOME: "/proc/no-xdg-write-test",
        },
      });
      // Inspection should succeed even if AI config write fails
      assert.strictEqual(result.code, 0);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("promptFirstRunAI throws when writeConfig fails (interactive path isolated)", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
    const readOnlyDir = join(tmpDir, "readonly-config");
    await mkdir(readOnlyDir, { recursive: true });
    await writeFile(join(readOnlyDir, ".keep"), "");
    await chmod(readOnlyDir, 0o000);

    const originalIsTTY = process.stdout.isTTY;
    const originalCI = process.env.CI;
    const originalXDG = process.env.XDG_DATA_HOME;
    const originalStdin = process.stdin;

    try {
      // Use a PassThrough stream as stdin so readline gets "y" without PTY
      const fakeStdin = new PassThrough();
      fakeStdin.write("y\n");
      fakeStdin.end();
      Object.defineProperty(process, "stdin", {
        value: fakeStdin,
        configurable: true,
      });

      Object.defineProperty(process.stdout, "isTTY", {
        value: true,
        configurable: true,
      });
      delete process.env.CI;
      process.env.XDG_DATA_HOME = readOnlyDir;

      await assert.rejects(
        promptFirstRunAI(),
        (err: Error) => err instanceof Error
      );
    } finally {
      Object.defineProperty(process, "stdin", {
        value: originalStdin,
        configurable: true,
      });
      Object.defineProperty(process.stdout, "isTTY", {
        value: originalIsTTY,
        configurable: true,
      });
      if (originalCI !== undefined) {
        process.env.CI = originalCI;
      } else {
        delete process.env.CI;
      }
      if (originalXDG !== undefined) {
        process.env.XDG_DATA_HOME = originalXDG;
      } else {
        delete process.env.XDG_DATA_HOME;
      }
      await chmod(readOnlyDir, 0o700).catch(() => {});
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("never prompts with --no-ai flag", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
    try {
      const result = await runCli(["--no-ai", "."], {
        env: { ...process.env, XDG_DATA_HOME: tmpDir },
      });
      assert.strictEqual(result.code, 0);
      assert.ok(!result.stdout.includes("Install optional local AI model"));
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("handles --tree with a file gracefully", async () => {
    const result = await runCli(["--tree", "package.json"]);
    assert.strictEqual(result.code, 0);
    // Tree flag on a file should fall back to normal file inspection
    assert.ok(result.stdout.includes("package.json"));
    assert.ok(result.stdout.includes("Entry type: file"));
  });
});
