import * as fs from "fs/promises";
import * as path from "path";
import * as readline from "readline";
import { inspectPath } from "./inspect.ts";
import { detectProject } from "./project.ts";
import { analyzeDirectory } from "./directory.ts";
import { explain } from "./explain.ts";
import { render, renderTree, toJson } from "./render.ts";
import {
  InspectPathResult,
  DirectoryStats,
} from "./types.ts";
import {
  readConfig,
  writeConfig,
  createDefaultConfig,
  setStatus,
} from "./ai/config.ts";
import {
  getAIStatus,
  isAIEnabled,
  canPrompt,
} from "./ai/status.ts";
import {
  runSetup,
  runStatus,
  getInstallPaths,
  LLAMA_CPP_VERSION,
} from "./ai/installer.ts";

const VERSION = "0.1.0";

interface ParsedArgs {
  command: "inspect" | "ai";
  aiSubcommand: "setup" | "status" | null;
  path: string | null;
  help: boolean;
  version: boolean;
  color: boolean;
  tree: boolean;
  json: boolean;
  noAI: boolean;
  error: string | null;
}

function parseArgs(argv: string[]): ParsedArgs {
  let path: string | null = null;
  let help = false;
  let version = false;
  let color = true;
  let tree = false;
  let json = false;
  let noAI = false;
  let error: string | null = null;
  let command: "inspect" | "ai" = "inspect";
  let aiSubcommand: "setup" | "status" | null = null;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "ai") {
      command = "ai";
      continue;
    }

    if (command === "ai") {
      if (arg === "setup") {
        aiSubcommand = "setup";
        continue;
      }
      if (arg === "status") {
        aiSubcommand = "status";
        continue;
      }
      if (arg === "--help" || arg === "-h") {
        help = true;
        continue;
      }
      error = `Unknown argument in ai command: ${arg}`;
      break;
    }

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
    } else if (arg === "--no-ai") {
      noAI = true;
    } else if (arg.startsWith("--")) {
      error = `Unknown option: ${arg}`;
      break;
    } else if (arg.startsWith("-") && arg.length > 1) {
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

  // --json and --no-ai together is fine (no AI in JSON output anyway)

  return {
    command,
    aiSubcommand,
    path,
    help,
    version,
    color,
    tree,
    json,
    noAI,
    error,
  };
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
  console.log("  --no-ai          Disable AI features");
  console.log("");
  console.log("AI commands:");
  console.log("  checkthis ai setup   Install optional local AI model");
  console.log("  checkthis ai status  Show AI installation status");
  console.log("");
  console.log("Examples:");
  console.log("  checkthis README.md");
  console.log("  checkthis ./src");
  console.log("  checkthis .");
  console.log("  checkthis --tree .");
  console.log("  checkthis --json .");
  console.log("  checkthis ai setup");
  console.log("  checkthis ai status");
}

function printVersion(): void {
  console.log(VERSION);
}

async function runAiSetup(
  color: boolean,
  signal?: AbortSignal
): Promise<void> {
  const result = await runSetup({
    onProgress: (progress) => {
      if (color) {
        console.log(
          `\r\x1b[2K\x1b[32m●\x1b[0m ${progress.message} (${progress.percentage}%)`
        );
      } else {
        console.log(
          `\r\x1b[2K${progress.message} (${progress.percentage}%)`
        );
      }
    },
    signal,
  });

  if (result.success) {
    console.log("AI setup complete. Local AI is now available.");
  } else {
    console.error(`AI setup failed: ${result.error}`);
    process.exit(1);
  }
}

async function runAiStatus(): Promise<void> {
  const status = await runStatus();
  console.log(`AI status: ${status.status}`);
  console.log(`AI enabled: ${status.isEnabled}`);
  console.log(`Can prompt: ${status.canPrompt}`);
  if (status.model) {
    console.log(`Model: ${status.model.name}`);
    console.log(`Quantization: ${status.model.quantization}`);
    console.log(`Size: ${status.model.size} bytes`);
  }
  console.log(`Runtime available: ${status.runtimeAvailable}`);
  console.log(`Runtime path: ${status.runtimePath ?? "not installed"}`);
}

function isInteractive(): boolean {
  return process.stdout.isTTY && !process.env.CI;
}

async function promptFirstRunAI(): Promise<boolean> {
  const config = await readConfig();
  const aiStatus = getAIStatus(config);

  // Don't prompt if already decided or AI enabled
  if (!aiStatus.canPrompt) {
    return false;
  }

  // Don't prompt in non-interactive mode
  if (!isInteractive()) {
    return false;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await new Promise<string>((resolve) => {
      rl.question(
        "Install optional local AI model? (~400 MB, one-time download, works offline) (y/n) ",
        (answer) => resolve(answer.trim().toLowerCase())
      );
    });

    if (answer === "y" || answer === "yes") {
      await writeConfig(setStatus(config ?? createDefaultConfig(), "setup_pending"));
      return true;
    }

    // User declined - save decision
    await writeConfig(setStatus(config ?? createDefaultConfig(), "declined"));
    return false;
  } finally {
    rl.close();
  }
}

async function inspect(
  filePath: string,
  color: boolean,
  tree: boolean,
  json: boolean,
  noAI: boolean
): Promise<void> {
  let result: InspectPathResult;
  let aiEnabled = false;

  try {
    const stat = await fs.lstat(filePath);

    if (stat.isDirectory()) {
      const dirStats = await analyzeDirectory(filePath, { tree });
      const project = await detectProject(filePath);

      // Check AI status for first-run prompt
      if (!noAI && isInteractive()) {
        const config = await readConfig();
        const aiStatus = getAIStatus(config);
        if (aiStatus.canPrompt) {
          const shouldSetup = await promptFirstRunAI();
          if (shouldSetup) {
            const setupResult = await runSetup({
              onProgress: (p) => {
                if (color) {
                  console.log(
                    `\r\x1b[2K\x1b[32m●\x1b[0m ${p.message} (${p.percentage}%)`
                  );
                } else {
                  console.log(
                    `\r\x1b[2K${p.message} (${p.percentage}%)`
                  );
                }
              },
            });
            if (setupResult.success) {
              aiEnabled = true;
            }
          }
        } else {
          aiEnabled = isAIEnabled(config);
        }
      } else {
        const config = await readConfig();
        aiEnabled = isAIEnabled(config) && !noAI;
      }

      if (json) {
        console.log(toJson({ entry: dirStats, explanation: { summary: "", facts: [], assumptions: [] }, project }));
        return;
      }

      if (tree) {
        const output = renderTree(dirStats, { color });
        console.log(output);
        return;
      }

      result = {
        entry: dirStats,
        project,
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

  // AI subcommands
  if (args.command === "ai") {
    if (args.aiSubcommand === "setup") {
      await runAiSetup(args.color);
      return;
    }
    if (args.aiSubcommand === "status") {
      await runAiStatus();
      return;
    }
    // ai command without subcommand
    printHelp();
    process.exit(0);
  }

  if (!args.path) {
    console.error("Error: No path provided.");
    console.error("Usage: checkthis <path>");
    console.error("Run 'checkthis --help' for usage information.");
    process.exit(1);
  }

  await inspect(args.path, args.color, args.tree, args.json, args.noAI);
}
