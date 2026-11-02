import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as child_process from "child_process";
import { EventEmitter } from "events";
import { getRuntimeVersion } from "../../src/ai/runtime.ts";

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

describe("getRuntimeVersion", () => {
  describe("successful version detection", () => {
    it("returns version string from llama-cli --help output", async () => {
      const proc = makeMockProcess(
        "llama.cpp v0.8.0\nsome other output\n",
        "",
        0,
        10
      );
      const spawnFn = (
        command: string,
        args: string[]
      ): child_process.ChildProcess => {
        assert.strictEqual(command, RUNTIME_PATH);
        assert.ok(args.includes("--help"));
        return proc;
      };
      const version = await getRuntimeVersion(RUNTIME_PATH, spawnFn);
      assert.strictEqual(version, "0.8.0");
    });

    it("returns null when no version match found", async () => {
      const proc = makeMockProcess(
        "some output without version\n",
        "",
        0,
        10
      );
      const spawnFn = (
        command: string,
        args: string[]
      ): child_process.ChildProcess => {
        return proc;
      };
      const version = await getRuntimeVersion(RUNTIME_PATH, spawnFn);
      assert.strictEqual(version, null);
    });
  });

  describe("error handling", () => {
    it("returns null on non-zero exit code", async () => {
      const proc = makeMockProcess(
        "",
        "Error: unknown option\n",
        1,
        10
      );
      const spawnFn = (
        command: string,
        args: string[]
      ): child_process.ChildProcess => {
        return proc;
      };
      const version = await getRuntimeVersion(RUNTIME_PATH, spawnFn);
      assert.strictEqual(version, null);
    });

    it("returns null on spawn error", async () => {
      const spawnFn = () => {
        const err = new Error("ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        err.errno = -2;
        err.syscall = "spawn llama-cli";
        throw err;
      };
      const version = await getRuntimeVersion(RUNTIME_PATH, spawnFn);
      assert.strictEqual(version, null);
    });

    it("returns null on process timeout", async () => {
      // Create a process that never emits close
      const proc = new EventEmitter() as unknown as child_process.ChildProcess;
      proc.killed = false;
      proc.stdout = new EventEmitter() as NodeJS.ReadWriteStream;
      proc.stderr = new EventEmitter() as NodeJS.ReadWriteStream;
      proc.stdin = new EventEmitter() as NodeJS.WriteStream;
      proc.pid = 99999;
      proc.kill = (signal?: string) => {
        proc.killed = true;
      };
      proc.ref = () => proc;
      proc.unref = () => proc;

      const spawnFn = (
        command: string,
        args: string[]
      ): child_process.ChildProcess => {
        return proc;
      };
      const version = await getRuntimeVersion(RUNTIME_PATH, spawnFn);
      assert.strictEqual(version, null);
      assert.ok(proc.killed, "Process should have been killed on timeout");
    });

    it("clears timer after normal completion", async () => {
      const proc = makeMockProcess("llama.cpp v0.9.0\n", "", 0, 5);
      const spawnFn = (
        command: string,
        args: string[]
      ): child_process.ChildProcess => {
        return proc;
      };
      const version = await getRuntimeVersion(RUNTIME_PATH, spawnFn);
      assert.strictEqual(version, "0.9.0");
      // If the timer wasn't cleared, the timeout would fire and kill the process
      // after 5 seconds, but since this completes quickly, proc.killed should be false
      assert.ok(!proc.killed, "Process should not be killed on normal completion");
    });
  });
});
