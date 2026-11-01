import { spawn } from "child_process";
import type { ChildProcess } from "child_process";
import type {
  AIProvider,
  InferenceResult,
} from "./types.ts";

export class InferenceError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "InferenceError";
    this.code = code;
  }
}

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_TOKENS = 256;
const DEFAULT_CONTEXT_SIZE = 2048;
const DEFAULT_TEMPERATURE = 0.7;

export type SpawnFn = (
  command: string,
  args: string[],
  options?: object
) => ChildProcess;

export class LlamaCppProvider implements AIProvider {
  private readonly modelPath: string;
  private readonly runtimePath: string;
  private readonly spawnFn: SpawnFn;
  private readonly timeoutMs: number;

  constructor(
    modelPath: string,
    runtimePath: string,
    spawnFn: SpawnFn = spawn,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ) {
    this.modelPath = modelPath;
    this.runtimePath = runtimePath;
    this.spawnFn = spawnFn;
    this.timeoutMs = timeoutMs;
  }

  async summarize(prompt: string): Promise<InferenceResult> {
    const startTime = Date.now();

    let proc: ChildProcess;

    try {
      proc = this.spawnFn(this.runtimePath, [
        "-m",
        this.modelPath,
        "-p",
        prompt,
        "-n",
        String(DEFAULT_MAX_TOKENS),
        "-c",
        String(DEFAULT_CONTEXT_SIZE),
        "--temp",
        String(DEFAULT_TEMPERATURE),
      ]);
    } catch (err) {
      throw new InferenceError(
        `Failed to launch llama-cli: ${err instanceof Error ? err.message : String(err)}`,
        "SPAWN_ERROR"
      );
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      timedOut = true;
      abortController.abort();
    }, this.timeoutMs);

    const cleanup = () => {
      clearTimeout(timeoutId);
      abortController.signal.removeEventListener("abort", killProc);
    };

    const killProc = () => {
      try {
        proc.kill("SIGTERM");
      } catch {
        // Ignore errors during kill
      }
      setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          // Ignore errors during force kill
        }
      }, 2000);
    };

    abortController.signal.addEventListener("abort", killProc);

    try {
      await new Promise<void>((resolve, reject) => {
        proc.stdout!.on("data", (d: Buffer) => {
          stdout += d.toString("utf8");
        });
        proc.stderr!.on("data", (d: Buffer) => {
          stderr += d.toString("utf8");
        });
        proc.on("close", (code) => {
          clearTimeout(timeoutId);
          abortController.signal.removeEventListener("abort", killProc);
          if (timedOut) {
            reject(new InferenceError("Inference timed out", "TIMEOUT"));
            return;
          }
          if (code !== 0) {
            reject(
              new InferenceError(
                `llama-cli exited with code ${code}: ${stderr.trim()}`,
                "EXIT_CODE"
              )
            );
            return;
          }
          resolve();
        });
        proc.on("error", (err) => {
          clearTimeout(timeoutId);
          abortController.signal.removeEventListener("abort", killProc);
          reject(
            new InferenceError(
              `Failed to launch llama-cli: ${err.message}`,
              "SPAWN_ERROR"
            )
          );
        });
      });

      const rawOutput = stdout.trim();

      // Strip echoed prompt if llama-cli echoes it back
      let output = rawOutput;
      if (output.startsWith(prompt)) {
        output = output.slice(prompt.length).trimStart();
      }
      output = output.trim();

      if (!output) {
        throw new InferenceError(
          "Empty response from llama-cli",
          "EMPTY_RESPONSE"
        );
      }

      // Take first two sentences
      const sentences = output.split(/(?<=[.!?])\s+/);
      const summarized = sentences.slice(0, 2).join(" ").trim();

      if (!summarized) {
        throw new InferenceError(
          "Empty response after processing",
          "EMPTY_RESPONSE"
        );
      }

      return {
        text: summarized,
        tokens: -1, // llama-cli does not report token count via CLI
        model: this.modelPath,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      cleanup();
      if (err instanceof InferenceError) {
        throw err;
      }
      throw new InferenceError(
        err instanceof Error ? err.message : String(err),
        "UNKNOWN"
      );
    } finally {
      cleanup();
    }
  }
}
