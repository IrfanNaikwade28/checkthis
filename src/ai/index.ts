// Types
export type {
  AIStatus,
  AI_CONFIG_SCHEMA_VERSION,
  AIConfig,
  ModelMetadata,
  InferenceResult,
  AIProvider,
  AIStatusInfo,
} from "./types.ts";

// Paths
export {
  getConfigDir,
  getConfigPath,
  getModelDir,
  getModelPath,
} from "./paths.ts";

// Config
export {
  readConfig,
  writeConfig,
  createDefaultConfig,
  setStatus,
  setModel,
  clearModel,
  DEFAULT_CONFIG,
} from "./config.ts";

// Status
export {
  getAIStatus,
  isAIEnabled,
  canPrompt,
  isSetupPending,
  isSetupFailed,
  isDeclined,
  isInstalled,
} from "./status.ts";

// Download
export {
  downloadArtifact,
  DownloadError,
  ChecksumError,
} from "./download.ts";
export type { DownloadArtifact, DownloadProgress } from "./download.ts";

// Runtime
export {
  verifyRuntime,
} from "./runtime.ts";
export type { RuntimeInfo } from "./runtime.ts";

// Installer
export {
  runSetup,
  runStatus,
  getInstallPaths,
  MODEL_ARTIFACT,
  LLAMA_CPP_VERSION,
} from "./installer.ts";
export type { InstallResult, InstallProgress } from "./installer.ts";

// Inference
export {
  InferenceError,
  LlamaCppProvider,
} from "./inference.ts";
