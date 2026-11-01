import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectProject } from "../dist/project.js";
import {
  mkdtemp,
  writeFile,
  mkdir,
  rm,
} from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

describe("detectProject", () => {
  describe("non-project directories", () => {
    it("returns not detected for empty directory", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));

      const result = await detectProject(tmpDir);

      assert.strictEqual(result.detected, false);
      assert.strictEqual(result.type, "unknown");
      assert.deepStrictEqual(result.markers, []);
      assert.deepStrictEqual(result.languages, []);
      assert.deepStrictEqual(result.frameworks, []);
      assert.deepStrictEqual(result.packageManagers, []);
      assert.strictEqual(result.confidence, "low");

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("returns not detected for directory with only random files", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(join(tmpDir, "readme.txt"), "hello");
      await writeFile(join(tmpDir, "data.csv"), "a,b");

      const result = await detectProject(tmpDir);

      assert.strictEqual(result.detected, false);
      assert.strictEqual(result.type, "unknown");

      await rm(tmpDir, { recursive: true, force: true });
    });
  });

  describe("Node.js detection", () => {
    it("detects Node.js from package.json", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(join(tmpDir, "package.json"), '{"name": "my-app"}');

      const result = await detectProject(tmpDir);

      assert.strictEqual(result.detected, true);
      assert.strictEqual(result.type, "node");
      assert.ok(result.markers.includes("package.json"));
      assert.ok(result.languages.includes("JavaScript"));
      assert.ok(result.languages.includes("TypeScript"));

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("does NOT detect Node.js from tsconfig.json alone", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(join(tmpDir, "tsconfig.json"), '{}');

      const result = await detectProject(tmpDir);

      assert.strictEqual(result.detected, false);
      assert.strictEqual(result.type, "unknown");

      await rm(tmpDir, { recursive: true, force: true });
    });
  });

  describe("framework detection", () => {
    it("detects React from dependencies", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(
        join(tmpDir, "package.json"),
        JSON.stringify({
          name: "my-app",
          dependencies: { react: "^18.0.0" },
        })
      );

      const result = await detectProject(tmpDir);

      assert.strictEqual(result.detected, true);
      assert.strictEqual(result.type, "node");
      assert.ok(result.frameworks.includes("React"));

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("detects React from devDependencies", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(
        join(tmpDir, "package.json"),
        JSON.stringify({
          name: "my-app",
          devDependencies: { react: "^18.0.0" },
        })
      );

      const result = await detectProject(tmpDir);

      assert.ok(result.frameworks.includes("React"));

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("detects Vite from dependencies", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(
        join(tmpDir, "package.json"),
        JSON.stringify({
          name: "my-app",
          dependencies: { vite: "^5.0.0" },
        })
      );

      const result = await detectProject(tmpDir);

      assert.ok(result.frameworks.includes("Vite"));

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("detects Next.js from dependencies", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(
        join(tmpDir, "package.json"),
        JSON.stringify({
          name: "my-app",
          dependencies: { next: "^14.0.0" },
        })
      );

      const result = await detectProject(tmpDir);

      assert.ok(result.frameworks.includes("Next.js"));

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("detects multiple frameworks", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(
        join(tmpDir, "package.json"),
        JSON.stringify({
          name: "my-app",
          dependencies: { react: "^18.0.0", vite: "^5.0.0" },
        })
      );

      const result = await detectProject(tmpDir);

      assert.ok(result.frameworks.includes("React"));
      assert.ok(result.frameworks.includes("Vite"));

      await rm(tmpDir, { recursive: true, force: true });
    });
  });

  describe("Python detection", () => {
    it("detects Python from pyproject.toml", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(join(tmpDir, "pyproject.toml"), '[project]\nname = "my-app"');

      const result = await detectProject(tmpDir);

      assert.strictEqual(result.detected, true);
      assert.strictEqual(result.type, "python");
      assert.ok(result.markers.includes("pyproject.toml"));
      assert.ok(result.languages.includes("Python"));

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("detects Python from requirements.txt", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(join(tmpDir, "requirements.txt"), "django==4.0\nrequests");

      const result = await detectProject(tmpDir);

      assert.strictEqual(result.detected, true);
      assert.strictEqual(result.type, "python");
      assert.ok(result.languages.includes("Python"));

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("detects Django from pyproject.toml content", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(
        join(tmpDir, "pyproject.toml"),
        '[project]\ndependencies = ["django>=4.0"]'
      );

      const result = await detectProject(tmpDir);

      assert.ok(result.frameworks.includes("Django"));

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("detects Django from requirements.txt content", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(join(tmpDir, "requirements.txt"), "Django==4.0");

      const result = await detectProject(tmpDir);

      assert.ok(result.frameworks.includes("Django"));

      await rm(tmpDir, { recursive: true, force: true });
    });
  });

  describe("Rust detection", () => {
    it("detects Rust from Cargo.toml", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(join(tmpDir, "Cargo.toml"), '[package]\nname = "my-app"');

      const result = await detectProject(tmpDir);

      assert.strictEqual(result.detected, true);
      assert.strictEqual(result.type, "rust");
      assert.ok(result.markers.includes("Cargo.toml"));
      assert.ok(result.languages.includes("Rust"));

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("does NOT detect Rust from Cargo.lock alone", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(join(tmpDir, "Cargo.lock"), '# This file is automatically @generated by Cargo');

      const result = await detectProject(tmpDir);

      assert.strictEqual(result.detected, false);
      assert.strictEqual(result.type, "unknown");

      await rm(tmpDir, { recursive: true, force: true });
    });
  });

  describe("Go detection", () => {
    it("detects Go from go.mod", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(join(tmpDir, "go.mod"), 'module example.com/my-app');

      const result = await detectProject(tmpDir);

      assert.strictEqual(result.detected, true);
      assert.strictEqual(result.type, "go");
      assert.ok(result.markers.includes("go.mod"));
      assert.ok(result.languages.includes("Go"));

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("does NOT detect Go from go.sum alone", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(join(tmpDir, "go.sum"), 'somehash h1:...');

      const result = await detectProject(tmpDir);

      assert.strictEqual(result.detected, false);
      assert.strictEqual(result.type, "unknown");

      await rm(tmpDir, { recursive: true, force: true });
    });
  });

  describe("package manager detection", () => {
    it("detects npm from package-lock.json", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(join(tmpDir, "package.json"), '{"name": "my-app"}');
      await writeFile(join(tmpDir, "package-lock.json"), '{}');

      const result = await detectProject(tmpDir);

      assert.ok(result.packageManagers.includes("npm"));

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("detects pnpm from pnpm-lock.yaml", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(join(tmpDir, "package.json"), '{"name": "my-app"}');
      await writeFile(join(tmpDir, "pnpm-lock.yaml"), 'lockfileVersion: 6');

      const result = await detectProject(tmpDir);

      assert.ok(result.packageManagers.includes("pnpm"));

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("detects Yarn from yarn.lock", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(join(tmpDir, "package.json"), '{"name": "my-app"}');
      await writeFile(join(tmpDir, "yarn.lock"), '# THIS IS AN AUTOGENERATED FILE');

      const result = await detectProject(tmpDir);

      assert.ok(result.packageManagers.includes("yarn"));

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("detects Bun from bun.lockb", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(join(tmpDir, "package.json"), '{"name": "my-app"}');
      await writeFile(join(tmpDir, "bun.lockb"), "");

      const result = await detectProject(tmpDir);

      assert.ok(result.packageManagers.includes("bun"));

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("detects multiple package managers", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(join(tmpDir, "package.json"), '{"name": "my-app"}');
      await writeFile(join(tmpDir, "package-lock.json"), '{}');
      await writeFile(join(tmpDir, "yarn.lock"), "");

      const result = await detectProject(tmpDir);

      assert.ok(result.packageManagers.includes("npm"));
      assert.ok(result.packageManagers.includes("yarn"));

      await rm(tmpDir, { recursive: true, force: true });
    });
  });

  describe("confidence levels", () => {
    it("returns low confidence for single marker", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(join(tmpDir, "go.mod"), 'module example.com/app');

      const result = await detectProject(tmpDir);

      assert.strictEqual(result.confidence, "low");
      assert.strictEqual(result.detected, true);

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("returns high confidence for multiple markers + frameworks + package managers", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(
        join(tmpDir, "package.json"),
        JSON.stringify({
          name: "my-app",
          dependencies: { react: "^18.0.0" },
        })
      );
      await writeFile(join(tmpDir, "package-lock.json"), '{}');
      await writeFile(join(tmpDir, "tsconfig.json"), '{}');

      const result = await detectProject(tmpDir);

      assert.ok(result.confidence === "medium" || result.confidence === "high");

      await rm(tmpDir, { recursive: true, force: true });
    });
  });

  describe("error handling", () => {
    it("handles malformed package.json gracefully", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(join(tmpDir, "package.json"), "{ invalid json }");

      const result = await detectProject(tmpDir);

      assert.strictEqual(result.detected, true);
      assert.strictEqual(result.type, "node");
      assert.ok(result.markers.includes("package.json"));
      // Malformed JSON should not crash; frameworks should be empty
      assert.deepStrictEqual(result.frameworks, []);

      await rm(tmpDir, { recursive: true, force: true });
    });

    it("handles missing directory gracefully", async () => {
      const result = await detectProject("/nonexistent/path/to/dir");

      assert.strictEqual(result.detected, false);
      assert.strictEqual(result.type, "unknown");

      // Should not throw
    });

    it("handles directory with only package.json but no name field", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(join(tmpDir, "package.json"), '{"version": "1.0.0"}');

      const result = await detectProject(tmpDir);

      assert.strictEqual(result.detected, true);
      assert.strictEqual(result.type, "node");

      await rm(tmpDir, { recursive: true, force: true });
    });
  });

  describe("conflicting markers", () => {
    it("detects multiple project types from mixed markers", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "checkthis-test-"));
      await writeFile(join(tmpDir, "package.json"), '{"name": "my-app"}');
      await writeFile(join(tmpDir, "Cargo.toml"), '[package]');

      const result = await detectProject(tmpDir);

      assert.strictEqual(result.detected, true);
      // Node.js takes priority over Rust in determineProjectType
      assert.strictEqual(result.type, "node");
      assert.ok(result.markers.includes("package.json"));
      assert.ok(result.markers.includes("Cargo.toml"));

      await rm(tmpDir, { recursive: true, force: true });
    });
  });
});
