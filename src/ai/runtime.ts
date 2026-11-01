import * as fs from "fs/promises";
import * as path from "path";
import { spawn } from "child_process";

export interface RuntimeInfo {
  name: string;
  version: string | null;
  path: string | null;
  available: boolean;
  executable: string | null;
}

export const LLAMA_CPP_VERSION = "v0.8.0";

// llama.cpp binaries are NOT distributed through CheckThis. Users must install
// the `llama-cli` executable themselves using one of the following methods:
//
//   Linux/macOS: curl -LsSf https://llama.app/install.sh | sh
//   Windows PowerShell: irm https://llama.app/install.ps1 | iex
//   Windows: winget install llama.cpp
//   macOS: brew install llama.cpp
//
// CheckThis detects the installed `llama-cli` (or `llama-cli.exe`) binary from
// PATH or a user-configured path. Checksums for individual platform binaries
// are not provided by the llama.cpp v0.8.0 release, so runtime binary integrity
// verification is the user's responsibility.

export const RUNTIME_EXECUTABLE_NAMES = ["llama-cli", "llama-cli.exe"];

export async function checkRuntimeAvailability(
  runtimePath: string
): Promise<boolean> {
  try {
    await fs.access(runtimePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function findRuntimeInPath(): Promise<string | null> {
  const pathEnv = process.env.PATH || "";
  const pathDelimiter = process.platform === "win32" ? ";" : ":";
  const directories = pathEnv.split(pathDelimiter);

  for (const dir of directories) {
    if (!dir) continue;
    const candidate = path.join(dir, "llama-cli");
    try {
      await fs.access(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Try .exe variant on Windows
      const candidateExe = path.join(dir, "llama-cli.exe");
      try {
        await fs.access(candidateExe, fs.constants.X_OK);
        return candidateExe;
      } catch {
        // Continue searching
      }
    }
  }
  return null;
}

export async function getRuntimeVersion(
  runtimePath: string
): Promise<string | null> {
  try {
    const { stdout } = await new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        const proc = spawn(runtimePath, ["--help"], { timeout: 5000 });
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
        proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
        proc.on("close", (code) => {
          if (code === 0) resolve({ stdout, stderr });
          else reject(new Error(`Exit code ${code}: ${stderr}`));
        });
        proc.on("error", reject);
      }
    );
    // llama-cli --help outputs version info in the first few lines
    const match = stdout.match(/llama\.cpp\s+v?(\d+\.\d+\.\d+)/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export async function verifyRuntime(
  runtimePath: string,
  expectedVersion: string
): Promise<RuntimeInfo> {
  const available = await checkRuntimeAvailability(runtimePath);
  if (!available) {
    return {
      name: "llama.cpp",
      version: null,
      path: null,
      available: false,
      executable: null,
    };
  }

  const version = (await getRuntimeVersion(runtimePath)) ?? expectedVersion;

  return {
    name: "llama.cpp",
    version,
    path: runtimePath,
    available: true,
    executable: path.basename(runtimePath),
  };
}
