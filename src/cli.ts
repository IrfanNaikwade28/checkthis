import * as fs from "fs/promises";
import * as path from "path";
import { inspectPath } from "./inspect.ts";
import { analyzeDirectory } from "./directory.ts";
import { explain } from "./explain.ts";
import { render, renderTree, toJson } from "./render.ts";
import {
  InspectPathResult,
  DirectoryStats,
} from "./types.ts";

const VERSION = "0.1.0";

interface ParsedArgs {
  path: string | null;
  help: boolean;
  version: boolean;
  color: boolean;
  tree: boolean;
  json: boolean;
  error: string | null;
}

function parseArgs(argv: string[]): ParsedArgs {
  let path: string | null = null;
  let help = false;
  let version = false;
  let color = true;
  let tree = false;
  let json = false;
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
    } else if (arg === "--tree") {
      tree = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg.startsWith("--")) {
      // Long option not recognized
      error = `Unknown option: ${arg}`;
      break;
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

  // --json and --tree are mutually exclusive
  if (json && tree) {
    error = "Cannot use --json and --tree together";
  }

  return { path, help, version, color, tree, json, error };
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
  console.log("  --tree           Display directory contents as a tree");
  console.log("  --json           Output machine-readable JSON");
  console.log("");
  console.log("Examples:");
  console.log("  checkthis README.md");
  console.log("  checkthis ./src");
  console.log("  checkthis .");
  console.log("  checkthis --tree .");
  console.log("  checkthis --json .");
}

function printVersion(): void {
  console.log(VERSION);
}

async function inspect(
  filePath: string,
  color: boolean,
  tree: boolean,
  json: boolean
): Promise<void> {
  let result: InspectPathResult;

  try {
    const stat = await fs.lstat(filePath);

    if (stat.isDirectory()) {
      const dirStats = await analyzeDirectory(filePath, { tree });

      if (json) {
        console.log(toJson({ entry: dirStats, explanation: { summary: "", facts: [], assumptions: [] } }));
        return;
      }

      if (tree) {
        const output = renderTree(dirStats, { color });
        console.log(output);
        return;
      }

      result = {
        entry: dirStats,
        explanation: { summary: "", facts: [], assumptions: [] },
      };
    } else {
      result = await inspectPath(filePath, { followSymlinks: false });
    }
  } catch (err) {
    if (json) {
      const error = err as NodeJS.ErrnoException;
      console.log(
        toJson({
          entry: {
            kind: "file",
            name: path.basename(filePath),
            path: filePath,
            absolutePath: path.resolve(filePath),
            isHidden: false,
            isSymlink: false,
            extension: "",
            size: 0,
            modifiedAt: new Date(),
            category: "unknown",
            readable: false,
            error: {
              code: error.code ?? "UNKNOWN",
              message: error.message,
              path: filePath,
              recoverable: error.code === "ENOENT" || error.code === "EACCES",
            },
          },
          explanation: {
            summary: `Unable to inspect ${path.basename(filePath)}`,
            facts: [`${error.code}: ${error.message}`],
            assumptions: [],
          },
        })
      );
      process.exit(1);
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    process.exit(1);
  }

  if (json) {
    console.log(toJson(result));
    return;
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

  await inspect(args.path, args.color, args.tree, args.json);
}
