import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { render } from "../dist/render.js";

describe("render", () => {
  describe("file output", () => {
    it("renders a file explanation with facts and assumptions", () => {
      const result: ExplainResultInput = {
        summary: "app.ts — file, 42.00 B",
        facts: [
          "Name: app.ts",
          "Path: /home/user/app.ts",
          "Entry type: file",
          "Size: 42.00 B",
          "Extension: .ts",
          "Hidden: no",
          "Modified: Nov 1, 2026, 11:00:00 AM",
          "Readable: yes",
        ],
        assumptions: [
          'The ".ts" extension typically indicates a plain-text file.',
        ],
      };

      const output = render(result);

      assert.ok(output.includes("app.ts — file, 42.00 B"));
      assert.ok(output.includes("Facts:"));
      assert.ok(output.includes("Assumptions:"));
      assert.ok(output.includes("• Name: app.ts"));
      assert.ok(
        output.includes('• The ".ts" extension typically indicates a plain-text file.')
      );
    });

    it("renders without assumptions when empty", () => {
      const result: ExplainResultInput = {
        summary: "data.xyz — file, 100.00 B",
        facts: ["Entry type: file", "Size: 100.00 B"],
        assumptions: [],
      };

      const output = render(result);

      assert.ok(output.includes("Facts:"));
      assert.ok(!output.includes("Assumptions:"));
    });

    it("renders without facts when empty", () => {
      const result: ExplainResultInput = {
        summary: "error — file, 0 B",
        facts: [],
        assumptions: ["Could not determine file type."],
      };

      const output = render(result);

      assert.ok(output.includes("Assumptions:"));
      assert.ok(!output.includes("Facts:"));
    });

    it("handles empty facts and assumptions", () => {
      const result: ExplainResultInput = {
        summary: "empty — file, 0 B",
        facts: [],
        assumptions: [],
      };

      const output = render(result);

      assert.ok(output.includes("empty — file, 0 B"));
      assert.ok(!output.includes("Facts:"));
      assert.ok(!output.includes("Assumptions:"));
    });

    it("renders symbolic link facts", () => {
      const result: ExplainResultInput = {
        summary: "link.txt — symlink, 0 B",
        facts: [
          "Name: link.txt",
          "Entry type: symlink",
          "Symbolic link target: /home/user/target.txt",
        ],
        assumptions: [],
      };

      const output = render(result);

      assert.ok(output.includes("Symbolic link target:"));
    });

    it("renders inspection errors", () => {
      const result: ExplainResultInput = {
        summary: "missing.txt — file, 0 B",
        facts: ["Inspection error: ENOENT — no such file or directory"],
        assumptions: [],
      };

      const output = render(result);

      assert.ok(output.includes("Inspection error:"));
      assert.ok(output.includes("ENOENT"));
    });
  });

  describe("directory output", () => {
    it("renders a directory explanation", () => {
      const result: ExplainResultInput = {
        summary: "src — 3 files, 1 directories, 56.00 B",
        facts: [
          "Name: src",
          "Path: /home/user/src",
          "Entry type: directory",
          "Files: 3",
          "Subdirectories: 1",
          "Total size: 56.00 B",
          "Empty: no",
          "Scan complete: yes",
          "Extension distribution: .ts: 2, .md: 1",
        ],
        assumptions: ["This directory is dominated by .ts (2), .md (1)."],
      };

      const output = render(result);

      assert.ok(output.includes("src — 3 files, 1 directories, 56.00 B"));
      assert.ok(output.includes("Files: 3"));
      assert.ok(output.includes("Subdirectories: 1"));
      assert.ok(output.includes("Extension distribution:"));
      assert.ok(output.includes("Scan complete: yes"));
    });

    it("renders an incomplete scan warning", () => {
      const result: ExplainResultInput = {
        summary: "large-dir — 10 files, 2 directories, 1.00 MB",
        facts: [
          "Files: 10",
          "Subdirectories: 2",
          "Scan complete: no",
          "Warning: Maximum entry count 100 reached",
        ],
        assumptions: [],
      };

      const output = render(result);

      assert.ok(output.includes("Scan complete: no"));
      assert.ok(output.includes("Warning:"));
    });

    it("renders an empty directory", () => {
      const result: ExplainResultInput = {
        summary: "empty-dir — 0 files, 0 directories, 0 B",
        facts: ["Files: 0", "Empty: yes"],
        assumptions: ["This directory contains no files or subdirectories."],
      };

      const output = render(result);

      assert.ok(output.includes("Empty: yes"));
      assert.ok(output.includes("no files or subdirectories"));
    });
  });

  describe("color control", () => {
    it("disables colors when color: false", () => {
      const result: ExplainResultInput = {
        summary: "test.txt — file, 10.00 B",
        facts: ["Entry type: file"],
        assumptions: [],
      };

      const withColor = render(result, { color: true });
      const withoutColor = render(result, { color: false });

      assert.ok(withColor.includes("\x1b["));
      assert.ok(!withoutColor.includes("\x1b["));
      assert.strictEqual(
        withoutColor.replace(/\x1b\[[0-9;]*m/g, ""),
        withColor.replace(/\x1b\[[0-9;]*m/g, "")
      );
    });

    it("does not include ANSI codes when color is off by default in non-TTY", () => {
      const result: ExplainResultInput = {
        summary: "test.txt — file, 10.00 B",
        facts: ["Entry type: file"],
        assumptions: [],
      };

      // In test environment, stdout is not a TTY, so colors should be off by default
      const output = render(result);
      assert.ok(!output.includes("\x1b["));
    });
  });

  describe("determinism", () => {
    it("produces identical output for identical input", () => {
      const result: ExplainResultInput = {
        summary: "app.ts — file, 42.00 B",
        facts: ["Name: app.ts", "Size: 42.00 B"],
        assumptions: ['The ".ts" extension typically indicates a plain-text file.'],
      };

      const first = render(result);
      const second = render(result);

      assert.strictEqual(first, second);
    });
  });
});

// Type alias for test convenience (ExplainResult imported from dist would need types)
type ExplainResultInput = {
  summary: string;
  facts: string[];
  assumptions: string[];
};
