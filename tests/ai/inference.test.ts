import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EventEmitter } from "events";
import * as child_process from "child_process";
import {
  InferenceError,
  LlamaCppProvider,
} from "../../src/ai/inference.ts";

const MODEL_PATH = "/tmp/checkthis-test/model.gguf";
const RUNTIME_PATH = "/tmp/checkthis-test/llama-cli";

function makeMockProcess(
  stdout: string,
  stderr: string = "",
  exitCode: number = 0,
  delayMs: number = 0
): child_process.ChildProcess {
  const proc = new EventEmitter() as unknown as child_process.ChildProcess;
  proc.killed = false;
  proc.stdout = new EventEmitter() as NodeJS.ReadWriteStream;
  proc.stderr = new EventEmitter() as NodeJS.ReadWriteStream;
  proc.stdin = new EventEmitter() as NodeJS.WriteStream;
  proc.pid = 12345;
  proc.kill = (signal?: string) => {
    proc.killed = true;
    proc.stdout.emit("end");
    proc.stderr.emit("end");
    proc.emit("close", exitCode);
  };
  proc.ref = () => proc;
  proc.unref = () => proc;

  setTimeout(() => {
    proc.stdout.emit("data", Buffer.from(stdout, "utf8"));
    proc.stderr.emit("data", Buffer.from(stderr, "utf8"));
    proc.emit("close", exitCode);
  }, delayMs);

  return proc;
}

describe("LlamaCppProvider", () => {
  describe("successful inference", () => {
    it("returns summarized text from llama-cli output", async () => {
      const proc = makeMockProcess("This is a test summary.\n");
      const provider = new LlamaCppProvider(MODEL_PATH, RUNTIME_PATH, () => proc);
      const result = await provider.summarize("Explain what this file does in one sentence.");
      assert.strictEqual(result.text, "This is a test summary.");
      assert.strictEqual(result.model, MODEL_PATH);
      assert.ok(result.durationMs > 0);
      assert.ok(result.durationMs < 30000);
    });

    it("passes correct arguments to spawn", async () => {
      let capturedCmd: string = "";
      let capturedArgs: string[] = [];

      const provider = new LlamaCppProvider(MODEL_PATH, RUNTIME_PATH, (cmd, args) => {
        capturedCmd = cmd;
        capturedArgs = args;
        return makeMockProcess("This is a test summary.\n");
      });
      await provider.summarize("Test prompt");

      assert.strictEqual(capturedCmd, RUNTIME_PATH);
      assert.ok(capturedArgs.includes("-m"));
      assert.ok(capturedArgs.includes(MODEL_PATH));
      assert.ok(capturedArgs.includes("-p"));
      assert.ok(capturedArgs.includes("Test prompt"));
      assert.ok(capturedArgs.includes("-n"));
      assert.ok(capturedArgs.includes("256"));
      assert.ok(capturedArgs.includes("-c"));
      assert.ok(capturedArgs.includes("2048"));
    });

    it("includes model path and prompt in args", async () => {
      let capturedArgs: string[] = [];

      const provider = new LlamaCppProvider(MODEL_PATH, RUNTIME_PATH, (cmd, args) => {
        capturedArgs = args;
        return makeMockProcess("Output text.\n");
      });
      await provider.summarize("Hello world");

      assert.ok(capturedArgs.includes(MODEL_PATH));
      assert.ok(capturedArgs.includes("Hello world"));
    });
  });

  describe("error handling", () => {
    it("throws when runtime binary is missing", async () => {
      const provider = new LlamaCppProvider(MODEL_PATH, "/nonexistent/llama-cli", () => {
        const err = new Error("enoent") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        err.errno = -2;
        err.syscall = "spawn llama-cli";
        throw err;
      });
      await assert.rejects(
        provider.summarize("Test prompt"),
        (err: Error) => err instanceof InferenceError && err.code === "SPAWN_ERROR"
      );
    });

    it("throws when llama-cli exits with non-zero code", async () => {
      const proc = makeMockProcess("", "Error: model file not found", 1);
      const provider = new LlamaCppProvider(MODEL_PATH, RUNTIME_PATH, () => proc);
      await assert.rejects(
        provider.summarize("Test prompt"),
        (err: Error) => err instanceof InferenceError && err.code === "EXIT_CODE"
      );
    });

    it("throws when output is empty", async () => {
      const proc = makeMockProcess("");
      const provider = new LlamaCppProvider(MODEL_PATH, RUNTIME_PATH, () => proc);
      await assert.rejects(
        provider.summarize("Test prompt"),
        (err: Error) => err instanceof InferenceError && err.code === "EMPTY_RESPONSE"
      );
    });

    it("strips echoed prompt from output", async () => {
      const proc = makeMockProcess("Explain this file: This is the answer.\n");
      const provider = new LlamaCppProvider(MODEL_PATH, RUNTIME_PATH, () => proc);
      const result = await provider.summarize("Explain this file:");
      assert.strictEqual(result.text, "This is the answer.");
    });
  });

  describe("timeout handling", () => {
    it("aborts and kills process on timeout", async () => {
      const proc = makeMockProcess("", "", 0, 5000);
      const provider = new LlamaCppProvider(MODEL_PATH, RUNTIME_PATH, () => proc, 10);
      await assert.rejects(
        provider.summarize("Test prompt"),
        (err: Error) => err instanceof InferenceError && err.code === "TIMEOUT"
      );
      assert.strictEqual(proc.killed, true);
    });
  });

  describe("cleanup", () => {
    it("does not kill process on success", async () => {
      const proc = makeMockProcess("Success.\n");
      const provider = new LlamaCppProvider(MODEL_PATH, RUNTIME_PATH, () => proc);
      await provider.summarize("Test prompt");
      assert.strictEqual(proc.killed, false);
    });

    it("does not kill process on error (process exits on its own)", async () => {
      const proc = makeMockProcess("", "error", 1);
      const provider = new LlamaCppProvider(MODEL_PATH, RUNTIME_PATH, () => proc);
      await assert.rejects(
        provider.summarize("Test prompt"),
        (err: Error) => err instanceof InferenceError
      );
      // Process exited on its own, we didn't kill it
      assert.strictEqual(proc.killed, false);
    });
  });

  describe("special characters", () => {
    it("handles prompts with special characters", async () => {
      let capturedArgs: string[] = [];
      const provider = new LlamaCppProvider(MODEL_PATH, RUNTIME_PATH, (cmd, args) => {
        capturedArgs = args;
        return makeMockProcess("Processed special chars.\n");
      });
      const result = await provider.summarize('File: test"file".ts\nPath: /home/user/file.ts');
      assert.strictEqual(result.text, "Processed special chars.");
    });
  });
});
