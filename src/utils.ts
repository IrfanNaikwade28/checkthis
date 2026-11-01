const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"];

/**
 * Convert bytes to a human-readable string (e.g., 1024 -> "1.00 KB").
 */
export function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const threshold = 1024;
  let index = 0;
  let size = bytes;

  while (size >= threshold && index < SIZE_UNITS.length - 1) {
    size /= threshold;
    index++;
  }

  return `${size.toFixed(2)} ${SIZE_UNITS[index]}`;
}

/**
 * Check if a file or directory name is hidden (starts with a dot).
 * Works on Unix, macOS, and Windows.
 */
export function isHidden(filePath: string): boolean {
  const segments = filePath.split(/[/\\]/).filter((s) => s.length > 0);
  const name = segments[segments.length - 1] ?? "";
  return name.startsWith(".");
}

/**
 * Get the file extension including the dot, lowercased.
 * Returns empty string for files with no extension.
 */
export function getExtension(filePath: string): string {
  const segments = filePath.split(/[/\\]/);
  const name = segments[segments.length - 1] ?? "";
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === name.length - 1) {
    return "";
  }
  return name.slice(dotIndex).toLowerCase();
}

/**
 * Common text file extensions. Used to guess category before reading content.
 */
const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown", ".json", ".yaml", ".yml", ".toml",
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".html", ".css", ".scss", ".less",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift",
  ".c", ".cpp", ".h", ".hpp",
  ".sh", ".bash", ".zsh", ".fish",
  ".log", ".gitignore", ".dockerfile", ".env",
  ".xml", ".csv", ".ini", ".cfg", ".conf",
]);

/**
 * Check if an extension typically indicates a text file.
 */
export function isTextExtension(extension: string): boolean {
  return TEXT_EXTENSIONS.has(extension);
}

/**
 * Format a Date to a short readable string (e.g., "Oct 31, 2026, 14:22:10").
 */
export function formatDate(date: Date): string {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Common project marker files and their associated project type + language.
 */
export interface ProjectMarker {
  filename: string;
  type: "node" | "python" | "rust" | "go" | "java";
  languages: string[];
}

export const PROJECT_MARKERS: ProjectMarker[] = [
  { filename: "package.json", type: "node", languages: ["JavaScript", "TypeScript"] },
  { filename: "package-lock.json", type: "node", languages: ["JavaScript", "TypeScript"] },
  { filename: "tsconfig.json", type: "node", languages: ["TypeScript"] },
  { filename: "pyproject.toml", type: "python", languages: ["Python"] },
  { filename: "setup.py", type: "python", languages: ["Python"] },
  { filename: "requirements.txt", type: "python", languages: ["Python"] },
  { filename: "Cargo.toml", type: "rust", languages: ["Rust"] },
  { filename: "Cargo.lock", type: "rust", languages: ["Rust"] },
  { filename: "go.mod", type: "go", languages: ["Go"] },
  { filename: "go.sum", type: "go", languages: ["Go"] },
  { filename: "pom.xml", type: "java", languages: ["Java"] },
  { filename: "build.gradle", type: "java", languages: ["Java", "Kotlin"] },
];
