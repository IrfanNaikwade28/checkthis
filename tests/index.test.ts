import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inspectPath,
  analyzeDirectory,
  explain,
  render,
  renderTree,
  toJson,
  formatSize,
} from "../dist/index.js";
import type {
  InspectPathResult,
  FileInspection,
  DirectoryStats,
  ExplainResult,
  InspectOptions,
  AnalyzeOptions,
  RenderOptions,
} from "../dist/index.js";

describe("public API (src/index.ts)", () => {
  it("exports inspectPath function", () => {
    assert.strictEqual(typeof inspectPath, "function");
  });

  it("exports analyzeDirectory function", () => {
    assert.strictEqual(typeof analyzeDirectory, "function");
  });

  it("exports explain function", () => {
    assert.strictEqual(typeof explain, "function");
  });

  it("exports render function", () => {
    assert.strictEqual(typeof render, "function");
  });

  it("exports formatSize function", () => {
    assert.strictEqual(typeof formatSize, "function");
  });

  it("formats size via public API", () => {
    assert.strictEqual(formatSize(1024), "1.00 KB");
    assert.strictEqual(formatSize(1048576), "1.00 MB");
  });

  it("renders via public API", () => {
    const output = render({
      summary: "test.txt — file, 10.00 B",
      facts: ["Entry type: file"],
      assumptions: [],
    });
    assert.ok(output.includes("test.txt — file, 10.00 B"));
  });

  it("exports toJson function", () => {
    assert.strictEqual(typeof toJson, "function");
  });

  it("exports renderTree function", () => {
    assert.strictEqual(typeof renderTree, "function");
  });

  it("serializes to valid JSON via public API", () => {
    const output = toJson({
      entry: {
        kind: "file",
        name: "test.txt",
        path: "/tmp/test.txt",
        absolutePath: "/tmp/test.txt",
        isHidden: false,
        isSymlink: false,
        extension: ".txt",
        size: 42,
        modifiedAt: new Date("2026-10-31T14:22:10Z"),
        category: "text",
        readable: true,
      },
      explanation: {
        summary: "test.txt — file, 42 B",
        facts: ["Size: 42"],
        assumptions: [],
      },
    });

    const parsed = JSON.parse(output);
    assert.strictEqual(parsed.entry.name, "test.txt");
    assert.strictEqual(parsed.entry.size, 42);
    assert.strictEqual(parsed.explanation.summary, "test.txt — file, 42 B");
  });

  it("exports types usable at compile time", () => {
    // These variables verify that the types are exported and usable.
    // They are intentionally unused at runtime; TypeScript checks them.
    const _result: InspectPathResult = {} as InspectPathResult;
    const _file: FileInspection = {} as FileInspection;
    const _dir: DirectoryStats = {} as DirectoryStats;
    const _explain: ExplainResult = {} as ExplainResult;
    const _inspectOpts: InspectOptions = {} as InspectOptions;
    const _analyzeOpts: AnalyzeOptions = {} as AnalyzeOptions;
    const _renderOpts: RenderOptions = {} as RenderOptions;

    assert.ok(_result);
    assert.ok(_file);
    assert.ok(_dir);
    assert.ok(_explain);
    assert.ok(_inspectOpts);
    assert.ok(_analyzeOpts);
    assert.ok(_renderOpts);
  });
});
