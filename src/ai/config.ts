import * as fs from "fs/promises";
import * as path from "path";
import { AI_CONFIG_SCHEMA_VERSION } from "./types.ts";
import type {
  AIConfig,
  AIStatus,
  ModelMetadata,
} from "./types.ts";
import { getConfigPath } from "./paths.ts";

const DEFAULT_CONFIG: AIConfig = {
  version: AI_CONFIG_SCHEMA_VERSION,
  status: "not_configured",
  updatedAt: new Date().toISOString(),
};

function isValidStatus(status: unknown): status is AIStatus {
  return [
    "not_configured",
    "declined",
    "setup_pending",
    "installed",
    "setup_failed",
  ].includes(status as AIStatus);
}

function isValidConfig(config: unknown): config is AIConfig {
  if (!config || typeof config !== "object") return false;
  const c = config as Record<string, unknown>;
  if (typeof c.version !== "number" || c.version !== AI_CONFIG_SCHEMA_VERSION)
    return false;
  if (!isValidStatus(c.status)) return false;
  if (typeof c.updatedAt !== "string") return false;
  if (c.model !== undefined) {
    if (!c.model || typeof c.model !== "object") return false;
    const m = c.model as Record<string, unknown>;
    if (typeof m.name !== "string") return false;
    if (typeof m.size !== "number") return false;
    if (typeof m.quantization !== "string") return false;
    if (typeof m.checksum !== "string") return false;
    if (typeof m.source !== "string") return false;
    if (typeof m.downloadedAt !== "string") return false;
  }
  return true;
}

export async function readConfig(
  configPath?: string
): Promise<AIConfig | null> {
  const resolvedPath = configPath ?? getConfigPath();
  let raw: string;
  try {
    raw = await fs.readFile(resolvedPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isValidConfig(parsed)) return null;

  return parsed as AIConfig;
}

export async function writeConfig(
  config: AIConfig,
  configPath?: string
): Promise<void> {
  const resolvedPath = configPath ?? getConfigPath();
  const configDir = path.dirname(resolvedPath);

  await fs.mkdir(configDir, { recursive: true });

  const tempPath = resolvedPath + ".tmp";
  const content = JSON.stringify(config, null, 2);

  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, resolvedPath);
}

export function createDefaultConfig(): AIConfig {
  return {
    ...DEFAULT_CONFIG,
    updatedAt: new Date().toISOString(),
  };
}

export function setStatus(
  config: AIConfig,
  status: AIStatus
): AIConfig {
  return {
    ...config,
    status,
    updatedAt: new Date().toISOString(),
  };
}

export function setModel(
  config: AIConfig,
  model: ModelMetadata
): AIConfig {
  return {
    ...config,
    model,
    updatedAt: new Date().toISOString(),
  };
}

export function clearModel(config: AIConfig): AIConfig {
  const { model, ...rest } = config;
  return {
    ...rest,
    model: undefined,
    updatedAt: new Date().toISOString(),
  };
}

export { DEFAULT_CONFIG };
