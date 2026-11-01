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

  it("parses combined short flags -hv", () => {
    const args = parseArgs(["node", "checkthis", "-hv"]);
    assert.strictEqual(args.help, true);
    assert.strictEqual(args.version, true);
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
});
