import * as fs from "fs/promises";
import * as path from "path";
import {
  ProjectDetection,
  ProjectType,
  Confidence,
} from "./types.ts";
import { PROJECT_MARKERS } from "./utils.ts";

const LOCKFILE_PACKAGE_MANAGERS: Record<string, string> = {
  "package-lock.json": "npm",
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "bun.lockb": "bun",
};

const FRAMEWORK_NAMES: Record<string, string> = {
  react: "React",
  vite: "Vite",
  next: "Next.js",
};

const PYTHON_FRAMEWORK_PACKAGES: Record<string, string> = {
  django: "Django",
};

// Primary markers independently indicate a project type.
// tsconfig.json is intentionally NOT here — it alone does not prove Node.js.
const PRIMARY_MARKER_FILENAMES = new Set([
  "package.json",
  "pyproject.toml",
  "setup.py",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
]);

// Supporting markers only add confidence when a primary marker exists.
const SUPPORTING_MARKER_FILENAMES = new Set(["tsconfig.json"]);

async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function readJsonFile<T = unknown>(
  filePath: string
): Promise<T | null> {
  const content = await readTextFile(filePath);
  if (content === null) return null;
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

function detectPackageManagers(
  files: string[]
): string[] {
  const managers: string[] = [];
  for (const [lockfile, manager] of Object.entries(LOCKFILE_PACKAGE_MANAGERS)) {
    if (files.includes(lockfile)) {
      managers.push(manager);
    }
  }
  return managers;
}

function detectFrameworksFromDeps(
  deps: Record<string, string> | undefined
): string[] {
  const frameworks: string[] = [];
  if (!deps) return frameworks;
  for (const [depName] of Object.entries(deps)) {
    const lower = depName.toLowerCase();
    if (lower in FRAMEWORK_NAMES) {
      frameworks.push(FRAMEWORK_NAMES[lower]);
    }
  }
  return frameworks;
}

function detectPythonFrameworksFromContent(
  content: string
): string[] {
  const frameworks: string[] = [];
  const lower = content.toLowerCase();
  for (const [dep, name] of Object.entries(PYTHON_FRAMEWORK_PACKAGES)) {
    if (lower.includes(dep)) {
      frameworks.push(name);
    }
  }
  return frameworks;
}

function determineProjectType(
  types: ProjectType[]
): ProjectType {
  const priority: ProjectType[] = [
    "node",
    "python",
    "rust",
    "go",
    "java",
  ];
  for (const t of priority) {
    if (types.includes(t)) return t;
  }
  return "unknown";
}

function determineConfidence(
  primaryMarkerCount: number,
  frameworkCount: number,
  packageManagerCount: number,
  typeCount: number
): Confidence {
  // Evidence-based: frameworks, package managers, and multiple ecosystems
  // are stronger signals than raw marker count.
  const score =
    primaryMarkerCount +
    frameworkCount +
    packageManagerCount +
    Math.max(0, typeCount - 1);
  if (score >= 5) return "high";
  if (score >= 3) return "medium";
  return "low";
}

export async function detectProject(
  dirPath: string
): Promise<ProjectDetection> {
  const detectedTypes = new Set<ProjectType>();
  const markers: string[] = []; // Primary markers only (+ tsconfig.json when primary exists)
  const frameworks: string[] = [];
  const packageManagers: string[] = [];
  const languages: Set<string> = new Set();

  let packageJsonDeps: Record<string, string> | undefined;
  let packageJsonDevDeps: Record<string, string> | undefined;
  let hasPrimaryNodeMarker = false;

  // --- Pass 1: Primary markers (independently indicate a project type) ---
  for (const marker of PROJECT_MARKERS) {
    if (!PRIMARY_MARKER_FILENAMES.has(marker.filename)) continue;

    const markerPath = path.join(dirPath, marker.filename);
    const content = await readTextFile(markerPath);
    if (content === null) continue;

    markers.push(marker.filename);
    detectedTypes.add(marker.type);
    for (const lang of marker.languages) {
      languages.add(lang);
    }

    if (marker.filename === "package.json") {
      hasPrimaryNodeMarker = true;
      const pkg = await readJsonFile<{
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      }>(markerPath);
      if (pkg) {
        packageJsonDeps = pkg.dependencies;
        packageJsonDevDeps = pkg.devDependencies;
      }
    }
  }

  const hasAnyPrimaryMarker = markers.length > 0;

  // --- Pass 2: Supporting markers (only add confidence when primary exists) ---
  if (hasAnyPrimaryMarker) {
    for (const marker of PROJECT_MARKERS) {
      if (!SUPPORTING_MARKER_FILENAMES.has(marker.filename)) continue;

      const markerPath = path.join(dirPath, marker.filename);
      const content = await readTextFile(markerPath);
      if (content === null) continue;

      markers.push(marker.filename);
      // tsconfig.json does not add a project type on its own,
      // but adds TypeScript language when Node.js is already detected.
      if (marker.filename === "tsconfig.json" && hasPrimaryNodeMarker) {
        languages.add("TypeScript");
      }
    }
  }

  // --- Pass 3: Detect package managers from ALL lockfiles ---
  // Lockfiles are checked for package managers but do NOT independently
  // set detected=true or add to markers.
  const allLockfileFilenames = Object.keys(LOCKFILE_PACKAGE_MANAGERS);
  for (const lockfile of allLockfileFilenames) {
    const lockfilePath = path.join(dirPath, lockfile);
    const content = await readTextFile(lockfilePath);
    if (content !== null) {
      const manager = LOCKFILE_PACKAGE_MANAGERS[lockfile];
      packageManagers.push(manager);
    }
  }

  // Detect frameworks from package.json dependencies
  const allDeps = {
    ...packageJsonDeps,
    ...packageJsonDevDeps,
  };
  const depFrameworks = detectFrameworksFromDeps(allDeps);
  for (const fw of depFrameworks) {
    frameworks.push(fw);
  }

  // Detect Python frameworks from pyproject.toml / requirements.txt content
  for (const filename of ["pyproject.toml", "requirements.txt", "setup.py"]) {
    const markerPath = path.join(dirPath, filename);
    const content = await readTextFile(markerPath);
    if (content === null) continue;
    const pyFrameworks = detectPythonFrameworksFromContent(content);
    for (const fw of pyFrameworks) {
      if (!frameworks.includes(fw)) {
        frameworks.push(fw);
      }
    }
  }

  const detected = markers.length > 0;
  const types = Array.from(detectedTypes);
  const type = detected ? determineProjectType(types) : "unknown";
  const confidence = detected
    ? determineConfidence(
        markers.filter((m) => PRIMARY_MARKER_FILENAMES.has(m)).length,
        frameworks.length,
        packageManagers.length,
        types.length
      )
    : "low";

  return {
    detected,
    type,
    types,
    markers,
    languages: Array.from(languages),
    frameworks,
    packageManagers,
    confidence,
  };
}
