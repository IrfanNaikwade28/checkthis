import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { spawn } from "child_process";
import { parseArgs } from "../dist/cli.js";

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
  function runCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const proc = spawn("node", ["bin/checkthis", ...args], {
        cwd: process.cwd(),
        encoding: "utf8",
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
    assert.strictEqual(parsed.entry.fileCount, 9);
    assert.strictEqual(parsed.entry.extensionDistribution[".ts"], 9);
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
});
