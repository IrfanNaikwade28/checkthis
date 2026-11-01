import type {
  AIConfig,
  AIStatus,
  ModelMetadata,
} from "./types.ts";

export interface AIStatusInfo {
  status: AIStatus;
  isEnabled: boolean;
  canPrompt: boolean;
  model?: ModelMetadata;
}

export function getAIStatus(config: AIConfig | null): AIStatusInfo {
  if (config === null) {
    return {
      status: "not_configured",
      isEnabled: false,
      canPrompt: true,
    };
  }

  const isEnabled = config.status === "installed" && config.model !== undefined;
  const canPrompt =
    config.status === "not_configured" ||
    config.status === "setup_pending" ||
    config.status === "setup_failed" ||
    (config.status === "installed" && config.model === undefined);

  return {
    status: config.status,
    isEnabled,
    canPrompt,
    model: config.model,
  };
}

export function isAIEnabled(config: AIConfig | null): boolean {
  return getAIStatus(config).isEnabled;
}

export function canPrompt(config: AIConfig | null): boolean {
  return getAIStatus(config).canPrompt;
}

export function isSetupPending(config: AIConfig | null): boolean {
  return config?.status === "setup_pending";
}

export function isSetupFailed(config: AIConfig | null): boolean {
  return config?.status === "setup_failed";
}

export function isDeclined(config: AIConfig | null): boolean {
  return config?.status === "declined";
}

export function isInstalled(config: AIConfig | null): boolean {
  return config?.status === "installed";
}
