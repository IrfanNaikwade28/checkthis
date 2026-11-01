import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatSize,
  isHidden,
  getExtension,
  isTextExtension,
  formatDate,
} from "../src/utils.ts";

describe("formatSize", () => {
  it("formats zero bytes", () => {
    assert.strictEqual(formatSize(0), "0 B");
  });

  it("formats bytes", () => {
    assert.strictEqual(formatSize(500), "500.00 B");
  });

  it("formats kilobytes", () => {
    assert.strictEqual(formatSize(1024), "1.00 KB");
  });

  it("formats megabytes", () => {
    assert.strictEqual(formatSize(1048576), "1.00 MB");
  });

  it("formats gigabytes", () => {
    assert.strictEqual(formatSize(1073741824), "1.00 GB");
  });
});

describe("isHidden", () => {
  it("detects dotfiles", () => {
    assert.strictEqual(isHidden("/home/user/.gitignore"), true);
    assert.strictEqual(isHidden("/home/user/.ssh/"), true);
  });

  it("detects non-hidden files", () => {
    assert.strictEqual(isHidden("/home/user/README.md"), false);
    assert.strictEqual(isHidden("package.json"), false);
  });
});

describe("getExtension", () => {
  it("returns extension with dot", () => {
    assert.strictEqual(getExtension("/path/to/file.ts"), ".ts");
  });

  it("returns lowercase extension", () => {
    assert.strictEqual(getExtension("file.MD"), ".md");
  });

  it("returns empty string for no extension", () => {
    assert.strictEqual(getExtension("Makefile"), "");
    assert.strictEqual(getExtension("file."), "");
  });

  it("handles hidden files without extension", () => {
    assert.strictEqual(getExtension(".gitignore"), "");
  });
});

describe("isTextExtension", () => {
  it("returns true for known text extensions", () => {
    assert.strictEqual(isTextExtension(".ts"), true);
    assert.strictEqual(isTextExtension(".md"), true);
    assert.strictEqual(isTextExtension(".json"), true);
  });

  it("returns false for unknown extensions", () => {
    assert.strictEqual(isTextExtension(".xyz"), false);
    assert.strictEqual(isTextExtension(""), false);
  });
});

describe("formatDate", () => {
  it("returns a string", () => {
    const result = formatDate(new Date("2026-10-31T14:22:10Z"));
    assert.strictEqual(typeof result, "string");
    assert.ok(result.length > 0);
  });
});
