import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { render, renderTree } from "../dist/render.js";

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

  describe("tree output", () => {
    it("renders a flat directory with files only", () => {
      const root: DirectoryEntryInput = {
        kind: "directory",
        name: "demo",
        path: "/tmp/demo",
        absolutePath: "/tmp/demo",
        isHidden: false,
        isSymlink: false,
        children: [
          {
            kind: "file",
            name: "README.md",
            path: "/tmp/demo/README.md",
            absolutePath: "/tmp/demo/README.md",
            isHidden: false,
            isSymlink: false,
            size: 1024,
          },
          {
            kind: "file",
            name: "app.ts",
            path: "/tmp/demo/app.ts",
            absolutePath: "/tmp/demo/app.ts",
            isHidden: false,
            isSymlink: false,
            size: 2048,
          },
        ],
      };

      const output = renderTree(root);

      assert.ok(output.includes("demo/"));
      assert.ok(output.includes("├── README.md"));
      assert.ok(output.includes("└── app.ts"));
      assert.ok(!output.includes("│"));
    });

    it("renders nested directories", () => {
      const root: DirectoryEntryInput = {
        kind: "directory",
        name: "project",
        path: "/tmp/project",
        absolutePath: "/tmp/project",
        isHidden: false,
        isSymlink: false,
        children: [
          {
            kind: "directory",
            name: "src",
            path: "/tmp/project/src",
            absolutePath: "/tmp/project/src",
            isHidden: false,
            isSymlink: false,
            children: [
              {
                kind: "file",
                name: "index.ts",
                path: "/tmp/project/src/index.ts",
                absolutePath: "/tmp/project/src/index.ts",
                isHidden: false,
                isSymlink: false,
                size: 512,
              },
              {
                kind: "file",
                name: "utils.ts",
                path: "/tmp/project/src/utils.ts",
                absolutePath: "/tmp/project/src/utils.ts",
                isHidden: false,
                isSymlink: false,
                size: 256,
              },
            ],
          },
          {
            kind: "file",
            name: "README.md",
            path: "/tmp/project/README.md",
            absolutePath: "/tmp/project/README.md",
            isHidden: false,
            isSymlink: false,
            size: 128,
          },
        ],
      };

      const output = renderTree(root);

      assert.ok(output.includes("project/"));
      assert.ok(output.includes("├── src/"));
      assert.ok(output.includes("│   ├── index.ts"));
      assert.ok(output.includes("│   └── utils.ts"));
      assert.ok(output.includes("└── README.md"));
    });

    it("renders an empty directory", () => {
      const root: DirectoryEntryInput = {
        kind: "directory",
        name: "empty",
        path: "/tmp/empty",
        absolutePath: "/tmp/empty",
        isHidden: false,
        isSymlink: false,
        children: [],
      };

      const output = renderTree(root);

      assert.strictEqual(output, "empty/");
    });

    it("renders symbolic links as leaf nodes with target", () => {
      const root: DirectoryEntryInput = {
        kind: "directory",
        name: "demo",
        path: "/tmp/demo",
        absolutePath: "/tmp/demo",
        isHidden: false,
        isSymlink: false,
        children: [
          {
            kind: "symlink",
            name: "link.txt",
            path: "/tmp/demo/link.txt",
            absolutePath: "/tmp/demo/link.txt",
            isHidden: false,
            isSymlink: true,
            target: "/tmp/target.txt",
          },
        ],
      };

      const output = renderTree(root);

      assert.ok(output.includes("└── link.txt -> /tmp/target.txt"));
    });

    it("includes hidden files", () => {
      const root: DirectoryEntryInput = {
        kind: "directory",
        name: "demo",
        path: "/tmp/demo",
        absolutePath: "/tmp/demo",
        isHidden: false,
        isSymlink: false,
        children: [
          {
            kind: "file",
            name: ".env",
            path: "/tmp/demo/.env",
            absolutePath: "/tmp/demo/.env",
            isHidden: true,
            isSymlink: false,
            size: 64,
          },
          {
            kind: "file",
            name: "visible.txt",
            path: "/tmp/demo/visible.txt",
            absolutePath: "/tmp/demo/visible.txt",
            isHidden: false,
            isSymlink: false,
            size: 128,
          },
        ],
      };

      const output = renderTree(root);

      assert.ok(output.includes(".env"));
      assert.ok(output.includes("visible.txt"));
    });

    it("produces deterministic ordering", () => {
      const root: DirectoryEntryInput = {
        kind: "directory",
        name: "demo",
        path: "/tmp/demo",
        absolutePath: "/tmp/demo",
        isHidden: false,
        isSymlink: false,
        // Children in sorted order: directories first, then alphabetical
        children: [
          {
            kind: "directory",
            name: "alpha",
            path: "/tmp/demo/alpha",
            absolutePath: "/tmp/demo/alpha",
            isHidden: false,
            isSymlink: false,
            children: [],
          },
          {
            kind: "file",
            name: "apple.txt",
            path: "/tmp/demo/apple.txt",
            absolutePath: "/tmp/demo/apple.txt",
            isHidden: false,
            isSymlink: false,
            size: 1,
          },
          {
            kind: "file",
            name: "zebra.txt",
            path: "/tmp/demo/zebra.txt",
            absolutePath: "/tmp/demo/zebra.txt",
            isHidden: false,
            isSymlink: false,
            size: 1,
          },
        ],
      };

      const first = renderTree(root);
      const second = renderTree(root);

      assert.strictEqual(first, second);

      const lines = first.split("\n");
      // Verify directories come before files in output
      const dirIndex = lines.findIndex((l) => l.includes("alpha/"));
      const firstFileIndex = lines.findIndex((l) => l.includes(".txt"));
      assert.ok(dirIndex >= 0 && firstFileIndex >= 0);
      assert.ok(dirIndex < firstFileIndex);
    });

    it("disables colors with color: false", () => {
      const root: DirectoryEntryInput = {
        kind: "directory",
        name: "demo",
        path: "/tmp/demo",
        absolutePath: "/tmp/demo",
        isHidden: false,
        isSymlink: false,
        children: [
          {
            kind: "file",
            name: "test.txt",
            path: "/tmp/demo/test.txt",
            absolutePath: "/tmp/demo/test.txt",
            isHidden: false,
            isSymlink: false,
            size: 100,
          },
        ],
      };

      const withColor = renderTree(root, { color: true });
      const withoutColor = renderTree(root, { color: false });

      assert.ok(withColor.includes("\x1b["));
      assert.ok(!withoutColor.includes("\x1b["));
      assert.strictEqual(
        withoutColor.replace(/\x1b\[[0-9;]*m/g, ""),
        withColor.replace(/\x1b\[[0-9;]*m/g, "")
      );
    });

    it("handles deeply nested directories", () => {
      const root: DirectoryEntryInput = {
        kind: "directory",
        name: "root",
        path: "/tmp/root",
        absolutePath: "/tmp/root",
        isHidden: false,
        isSymlink: false,
        children: [
          {
            kind: "directory",
            name: "level1",
            path: "/tmp/root/level1",
            absolutePath: "/tmp/root/level1",
            isHidden: false,
            isSymlink: false,
            children: [
              {
                kind: "directory",
                name: "level2",
                path: "/tmp/root/level1/level2",
                absolutePath: "/tmp/root/level1/level2",
                isHidden: false,
                isSymlink: false,
                children: [
                  {
                    kind: "file",
                    name: "deep.txt",
                    path: "/tmp/root/level1/level2/deep.txt",
                    absolutePath: "/tmp/root/level1/level2/deep.txt",
                    isHidden: false,
                    isSymlink: false,
                    size: 10,
                  },
                ],
              },
            ],
          },
        ],
      };

      const output = renderTree(root);

      assert.ok(output.includes("root/"));
      assert.ok(output.includes("└── level1/"));
      assert.ok(output.includes("    └── level2/"));
      assert.ok(output.includes("        └── deep.txt"));
    });
  });
});

// Type alias for test convenience (ExplainResult imported from dist would need types)
type ExplainResultInput = {
  summary: string;
  facts: string[];
  assumptions: string[];
};

type DirectoryEntryInput = {
  kind: "directory" | "file" | "symlink";
  name: string;
  path: string;
  absolutePath: string;
  isHidden: boolean;
  isSymlink: boolean;
  size?: number;
  target?: string;
  children?: DirectoryEntryInput[];
  inaccessible?: never[];
  warnings?: never[];
};
