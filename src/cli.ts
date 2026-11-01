import * as fs from "fs/promises";
import { inspectPath } from "./inspect.ts";
import { analyzeDirectory } from "./directory.ts";
import { explain } from "./explain.ts";
import { render } from "./render.ts";
import { InspectPathResult } from "./types.ts";

const VERSION = "0.1.0";

interface ParsedArgs {
  path: string | null;
  help: boolean;
  version: boolean;
  color: boolean;
  error: string | null;
}

function parseArgs(argv: string[]): ParsedArgs {
  let path: string | null = null;
  let help = false;
  let version = false;
  let color = true;
  let error: string | null = null;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--version" || arg === "-v") {
      version = true;
    } else if (arg === "--no-color") {
      color = false;
    } else if (arg.startsWith("--color=")) {
      const val = arg.slice("--color=".length);
      color = val !== "false";
    } else if (arg.startsWith("-") && arg.length > 1) {
      // Combined short flags like -hv
      for (let j = 1; j < arg.length; j++) {
        if (arg[j] === "h") {
          help = true;
        } else if (arg[j] === "v") {
          version = true;
        } else {
          error = `Unknown option: -${arg[j]}`;
          break;
        }
      }
    } else if (path === null) {
      path = arg;
    } else {
      error = `Multiple paths not supported: ${arg}`;
    }
  }

  return { path, help, version, color, error };
}

function printHelp(): void {
  console.log("Usage: checkthis <path>");
  console.log("");
  console.log("Inspect files and directories from the command line.");
  console.log("");
  console.log("Options:");
  console.log("  -h, --help       Show this help message");
  console.log("  -v, --version    Show version number");
  console.log("  --no-color       Disable colored output");
  console.log("");
  console.log("Examples:");
  console.log("  checkthis README.md");
  console.log("  checkthis ./src");
  console.log("  checkthis .");
}

function printVersion(): void {
  console.log(VERSION);
}

async function inspect(
  filePath: string,
  color: boolean
): Promise<void> {
  let result: InspectPathResult;

  try {
    const stat = await fs.lstat(filePath);

    if (stat.isDirectory()) {
      const dirStats = await analyzeDirectory(filePath);
      result = {
        entry: dirStats,
        explanation: { summary: "", facts: [], assumptions: [] },
      };
    } else {
      result = await inspectPath(filePath, { followSymlinks: false });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    process.exit(1);
  }

  const explanation = explain(result);
  const output = render(explanation, { color });
  console.log(output);
}

export { main, parseArgs };

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.error) {
    console.error(`Error: ${args.error}`);
    console.error("Run 'checkthis --help' for usage information.");
    process.exit(1);
  }

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.version) {
    printVersion();
    process.exit(0);
  }

  if (!args.path) {
    console.error("Error: No path provided.");
    console.error("Usage: checkthis <path>");
    console.error("Run 'checkthis --help' for usage information.");
    process.exit(1);
  }

  await inspect(args.path, args.color);
}
