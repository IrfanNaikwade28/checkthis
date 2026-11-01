import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import {
  downloadArtifact,
  DownloadArtifact,
  DownloadError,
  ChecksumError,
} from "./download.ts";
import {
  checkRuntimeAvailability,
  findRuntimeInPath,
  getRuntimeVersion,
  verifyRuntime,
} from "./runtime.ts";
import {
  readConfig,
  writeConfig,
  setStatus,
  setModel,
  DEFAULT_CONFIG,
} from "./config.ts";
import { getConfigPath } from "./paths.ts";
import type { ModelMetadata, AIStatus } from "./types.ts";
import { getAIStatus } from "./status.ts";

export const LLAMA_CPP_VERSION = "v0.8.0";

// Model artifact: Qwen2.5-0.5B-Instruct Q4_K_M GGUF
// Verified against Hugging Face API for bartowski/Qwen2.5-0.5B-Instruct-GGUF
// Source commit: 41ba88dbac95fed2528c92514c131d73eb5a174b
export const MODEL_ARTIFACT: DownloadArtifact = {
  name: "Qwen2.5-0.5B-Instruct-Q4_K_M.gguf",
  url: "https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf",
  size: 397808192, // Verified from HF API
  sha256: "6eb923e7d26e9cea28811e1a8e852009b21242fb157b26149d3b188f3a8c8653", // SHA-256 from HF LFS metadata
  destination: "", // Set at runtime
};

// llama.cpp binaries are NOT distributed by CheckThis. Users install the
// `llama-cli` executable themselves via:
//   curl -LsSf https://llama.app/install.sh | sh     (Linux/macOS)
//   irm https://llama.app/install.ps1 | iex           (Windows PowerShell)
//   winget install llama.cpp                           (Windows)
//   brew install llama.cpp                             (macOS)
//
// CheckThis detects `llama-cli` (or `llama-cli.exe`) from PATH at runtime.
// Checksums for individual platform binaries are not available from the
// llama.cpp v0.8.0 release, so runtime binary integrity verification is
// the user's responsibility.

export interface InstallProgress {
  phase: "downloading-model" | "verifying" | "complete";
  message: string;
  percentage: number;
}

export type InstallProgressCallback = (progress: InstallProgress) => void;

export interface InstallResult {
  success: boolean;
  modelPath?: string;
  error?: string;
}

export async function getInstallPaths(): Promise<{
  configDir: string;
  modelDir: string;
  modelPath: string;
}> {
  const configDir = path.dirname(getConfigPath());
  const modelDir = path.join(configDir, "models");
  const modelPath = path.join(modelDir, MODEL_ARTIFACT.name);

  return { configDir, modelDir, modelPath };
}

export async function isModelInstalled(
  modelPath: string,
  expectedSha256: string
): Promise<boolean> {
  try {
    const hash = await computeSha256(modelPath);
    return hash === expectedSha256;
  } catch {
    return false;
  }
}

async function computeSha256(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk: Buffer) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

export async function runSetup(
  options: {
    onProgress?: InstallProgressCallback;
    signal?: AbortSignal;
  } = {}
): Promise<InstallResult> {
  const { onProgress, signal } = options;

  try {
    const { configDir, modelDir, modelPath } = await getInstallPaths();

    // Ensure directories exist
    await fsPromises.mkdir(configDir, { recursive: true });
    await fsPromises.mkdir(modelDir, { recursive: true });

    // Check current state
    const config = await readConfig();
    if (config && config.status === "installed" && config.model) {
      const modelValid = await isModelInstalled(
        modelPath,
        config.model.checksum
      );
      if (modelValid) {
        return {
          success: true,
          modelPath,
        };
      }
    }

    // Download model if needed
    onProgress?.({
      phase: "downloading-model",
      message: "Downloading Qwen2.5-0.5B model...",
      percentage: 0,
    });

    const modelDownload: DownloadArtifact = {
      ...MODEL_ARTIFACT,
      destination: modelPath,
    };

    await downloadArtifact(modelDownload, {
      retries: 3,
      retryDelayMs: 2000,
      onProgress: (p) => {
        onProgress?.({
          phase: "downloading-model",
          message: "Downloading Qwen2.5-0.5B model...",
          percentage: p.percentage,
        });
      },
      signal,
    });

    // Verify installation
    onProgress?.({
      phase: "verifying",
      message: "Verifying installation...",
      percentage: 90,
    });

    const modelValid = await isModelInstalled(
      modelPath,
      MODEL_ARTIFACT.sha256
    );
    if (!modelValid) {
      return {
        success: false,
        error: "Model verification failed",
      };
    }

    // Save configuration
    const modelMetadata: ModelMetadata = {
      name: MODEL_ARTIFACT.name,
      size: MODEL_ARTIFACT.size,
      quantization: "Q4_K_M",
      checksum: MODEL_ARTIFACT.sha256,
      source: MODEL_ARTIFACT.url,
      downloadedAt: new Date().toISOString(),
    };

    const newConfig = setModel(
      setStatus(config ?? DEFAULT_CONFIG, "installed"),
      modelMetadata
    );
    await writeConfig(newConfig);

    onProgress?.({
      phase: "complete",
      message: "AI setup complete",
      percentage: 100,
    });

    return {
      success: true,
      modelPath,
    };
  } catch (err) {
    // Save failed state
    try {
      const config = await readConfig();
      const failedConfig = setStatus(config ?? DEFAULT_CONFIG, "setup_failed");
      await writeConfig(failedConfig);
    } catch {
      // Ignore config write errors during error handling
    }

    if (err instanceof DownloadError) {
      return {
        success: false,
        error: `Download failed: ${err.message}`,
      };
    }
    if (err instanceof ChecksumError) {
      return {
        success: false,
        error: `Checksum verification failed: ${err.message}`,
      };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runStatus(): Promise<{
  status: AIStatus;
  isEnabled: boolean;
  canPrompt: boolean;
  model?: { name: string; size: number; quantization: string };
  runtimeAvailable: boolean;
  runtimePath?: string;
}> {
  const config = await readConfig();
  const aiStatus = getAIStatus(config);

  // Detect llama-cli from PATH
  let runtimeAvailable = false;
  let runtimePath: string | undefined;
  try {
    const foundPath = await findRuntimeInPath();
    if (foundPath) {
      const info = await verifyRuntime(foundPath, LLAMA_CPP_VERSION);
      runtimeAvailable = info.available;
      runtimePath = info.path ?? undefined;
    }
  } catch {
    runtimeAvailable = false;
  }

  return {
    status: aiStatus.status,
    isEnabled: aiStatus.isEnabled,
    canPrompt: aiStatus.canPrompt,
    model: aiStatus.model
      ? {
          name: aiStatus.model.name,
          size: aiStatus.model.size,
          quantization: aiStatus.model.quantization,
        }
      : undefined,
    runtimeAvailable,
    runtimePath,
  };
}
