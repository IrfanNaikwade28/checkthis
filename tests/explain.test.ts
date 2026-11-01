import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { explain } from "../dist/explain.js";
import { inspectPath } from "../dist/inspect.js";
import { analyzeDirectory } from "../dist/directory.js";
import {
  mkdtemp,
  writeFile,
  mkdir,
  rm,
  symlink,
  chmod,
} from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

describe("explain", () => {
  describe("file explanations", () => {
    it("explains a TypeScript source file", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, "app.ts");
      await writeFile(filePath, "const x: number = 1;");

      const result = await inspectPath(filePath);
      const explanation = explain(result);

      assert.ok(explanation.summary.includes("app.ts"));
      assert.ok(
        explanation.facts.some((f) => f.includes("Extension: .ts"))
      );
      assert.ok(
        explanation.facts.some((f) => f.includes("Size:"))
      );
      assert.ok(
        explanation.facts.some((f) => f.includes("Entry type: file"))
      );
      assert.ok(
        explanation.assumptions.some((a) =>
          a.includes("plain-text file")
        )
      );

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("explains a Markdown file", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, "README.md");
      await writeFile(filePath, "# Hello");

      const result = await inspectPath(filePath);
      const explanation = explain(result);

      assert.ok(explanation.facts.some((f) => f.includes("Extension: .md")));
      assert.ok(
        explanation.assumptions.some((a) =>
          a.includes("plain-text file")
        )
      );

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("explains an unknown extension", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, "data.xyz");
      await writeFile(filePath, "binary stuff");

      const result = await inspectPath(filePath);
      const explanation = explain(result);

      assert.ok(explanation.facts.some((f) => f.includes("Extension: .xyz")));
      assert.ok(
        explanation.assumptions.some((a) =>
          a.includes("could not be determined")
        )
      );

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("explains an empty file", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, "empty.txt");
      await writeFile(filePath, "");

      const result = await inspectPath(filePath);
      const explanation = explain(result);

      assert.ok(explanation.facts.some((f) => f.includes("Size: 0 B")));
      assert.ok(
        explanation.assumptions.some((a) => a.includes("empty (0 bytes)"))
      );

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("explains a hidden file", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, ".env");
      await writeFile(filePath, "SECRET=1");

      const result = await inspectPath(filePath);
      const explanation = explain(result);

      assert.ok(explanation.facts.some((f) => f.includes("Hidden: yes")));
      assert.ok(explanation.facts.some((f) => f.includes("Name: .env")));

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("explains a symbolic link", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const target = join(tmpDir, "target.txt");
      await writeFile(target, "target content");
      const linkPath = join(tmpDir, "link.txt");
      await symlink(target, linkPath);

      const result = await inspectPath(linkPath);
      const explanation = explain(result);

      assert.ok(
        explanation.facts.some((f) => f.includes("Entry type: symlink"))
      );
      assert.ok(
        explanation.facts.some((f) => f.includes("Symbolic link target:"))
      );

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("explains a missing file with error", async () => {
      const result = await inspectPath("/nonexistent/file.txt");
      const explanation = explain(result);

      assert.ok(
        explanation.facts.some((f) => f.includes("Inspection error:"))
      );
      assert.ok(explanation.facts.some((f) => f.includes("ENOENT")));
    });

    it("separates facts from assumptions", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      const filePath = join(tmpDir, "test.txt");
      await writeFile(filePath, "hello");

      const result = await inspectPath(filePath);
      const explanation = explain(result);

      for (const fact of explanation.facts) {
        assert.ok(
          fact.includes("Name:") ||
          fact.includes("Path:") ||
          fact.includes("Entry type:") ||
          fact.includes("Size:") ||
          fact.includes("Extension:") ||
          fact.includes("Hidden:") ||
          fact.includes("Modified:") ||
          fact.includes("Readable:") ||
          fact.includes("Symbolic link target:") ||
          fact.includes("Inspection error:")
        );
      }

      for (const assumption of explanation.assumptions) {
        assert.ok(
          assumption.includes("typically") ||
          assumption.includes("appears") ||
          assumption.includes("could not be determined")
        );
      }

      await rm(tmpDir, { recursive: true, force: true });
    });
  });

  describe("directory explanations", () => {
    it("explains an empty directory", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));

      const result = await analyzeDirectory(tmpDir);
      const explanation = explain({ entry: result, explanation: { summary: "", facts: [], assumptions: [] } });

      assert.ok(explanation.facts.some((f) => f.includes("Files: 0")));
      assert.ok(explanation.facts.some((f) => f.includes("Empty: yes")));
      assert.ok(
        explanation.assumptions.some((a) =>
          a.includes("no files or subdirectories")
        )
      );

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("explains a directory with mixed file types", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(join(tmpDir, "a.ts"), "x");
      await writeFile(join(tmpDir, "b.ts"), "y");
      await writeFile(join(tmpDir, "c.json"), "{}");
      await mkdir(join(tmpDir, "sub"));
      await writeFile(join(tmpDir, "sub", "d.ts"), "z");

      const result = await analyzeDirectory(tmpDir);
      const explanation = explain({ entry: result, explanation: { summary: "", facts: [], assumptions: [] } });

      assert.ok(explanation.facts.some((f) => f.includes("Files: 4")));
      assert.ok(explanation.facts.some((f) => f.includes("Subdirectories: 1")));
      assert.ok(
        explanation.facts.some((f) => f.includes("Extension distribution:"))
      );
      assert.ok(
        explanation.assumptions.some((a) => a.includes("dominated by"))
      );

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("explains a directory with warnings", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));

      const result = await analyzeDirectory(tmpDir);
      const explanation = explain({ entry: result, explanation: { summary: "", facts: [], assumptions: [] } });

      assert.ok(explanation.summary.includes(tmpDir.split("/").pop()!));
      assert.ok(explanation.facts.length > 0);

      await rm(tmpDir, { recursive: true, force: true });
    });
  });
});
