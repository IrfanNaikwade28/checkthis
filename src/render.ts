import {
  ExplainResult,
  RenderOptions,
  DirectoryEntry,
  InspectPathResult,
} from "./types.ts";

const COLOR_SUPPORTED =
  process.stdout.isTTY &&
  process.env.NO_COLOR === undefined &&
  (process.env.FORCE_COLOR !== "0" ||
    process.env.TERM !== "dumb");

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
} as const;

function colorize(text: string, code: string, enabled: boolean): string {
  return enabled ? `${code}${text}${ANSI.reset}` : text;
}

function heading(text: string, enabled: boolean): string {
  return colorize(text, ANSI.bold, enabled);
}

function label(text: string, enabled: boolean): string {
  return colorize(text, ANSI.cyan, enabled);
}

function value(text: string, enabled: boolean): string {
  return colorize(text, ANSI.reset, enabled);
}

function warning(text: string, enabled: boolean): string {
  return colorize(text, ANSI.yellow, enabled);
}

function error(text: string, enabled: boolean): string {
  return colorize(text, ANSI.red, enabled);
}

function bullet(enabled: boolean): string {
  return colorize("•", ANSI.dim, enabled);
}

function resolveColor(options: RenderOptions = {}): boolean {
  if (options.color !== undefined) return options.color;
  if (process.env.NO_COLOR !== undefined) return false;
  return COLOR_SUPPORTED;
}

export function render(result: ExplainResult, options: RenderOptions = {}): string {
  const color = resolveColor(options);
  const lines: string[] = [];

  // Summary
  lines.push(heading(result.summary, color));
  lines.push("");

  // Facts
  if (result.facts.length > 0) {
    lines.push(heading("Facts:", color));
    for (const fact of result.facts) {
      lines.push(`  ${bullet(color)} ${fact}`);
    }
    lines.push("");
  }

  // Assumptions
  if (result.assumptions.length > 0) {
    lines.push(heading("Assumptions:", color));
    for (const assumption of result.assumptions) {
      lines.push(`  ${bullet(color)} ${assumption}`);
    }
    lines.push("");
  }

  // Remove trailing blank line
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.join("\n");
}

function formatTreeEntry(
  entry: DirectoryEntry,
  isLast: boolean,
  color: boolean
): string {
  let name = entry.name;

  if (entry.kind === "directory") {
    name += "/";
  }

  if (entry.kind === "symlink" && entry.target) {
    name += ` -> ${entry.target}`;
  }

  const connector = isLast ? "└── " : "├── ";
  const colorizedConnector = colorize(connector, ANSI.dim, color);
  const colorizedName = colorize(name, ANSI.reset, color);

  return `${colorizedConnector}${colorizedName}`;
}

function buildTreeLines(
  entry: DirectoryEntry,
  prefix: string,
  color: boolean,
  lines: string[]
): void {
  const children = entry.children ?? [];
  const lastIndex = children.length - 1;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const isLast = i === lastIndex;

    lines.push(`${prefix}${formatTreeEntry(child, isLast, color)}`);

    if (child.kind === "directory" && child.children) {
      const extension = isLast ? "    " : "│   ";
      buildTreeLines(child, prefix + extension, color, lines);
    }
  }
}

export function renderTree(
  root: DirectoryEntry,
  options: RenderOptions = {}
): string {
  const color = resolveColor(options);
  const lines: string[] = [];

  // Root directory name
  let rootName = root.name;
  if (root.kind === "directory") {
    rootName += "/";
  }
  lines.push(colorize(rootName, ANSI.bold, color));

  if (root.children) {
    buildTreeLines(root, "", color, lines);
  }

  return lines.join("\n");
}

export { colorize, heading, label, value, warning, error, bullet };

/**
 * Serialize an InspectPathResult to pretty-printed JSON.
 * Does not mutate the input result.
 */
export function toJson(result: InspectPathResult): string {
  return JSON.stringify(result, null, 2);
}
