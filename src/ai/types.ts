export type AIStatus =
  | "not_configured"
  | "declined"
  | "setup_pending"
  | "installed"
  | "setup_failed";

export const AI_CONFIG_SCHEMA_VERSION = 1;

export interface ModelMetadata {
  name: string;
  size: number;
  quantization: string;
  checksum: string;
  source: string;
  downloadedAt: string;
}

export interface AIConfig {
  version: number;
  status: AIStatus;
  model?: ModelMetadata;
  updatedAt: string;
}

export interface InferenceResult {
  text: string;
  tokens: number;
  model: string;
  durationMs: number;
}

export interface AIProvider {
  summarize(prompt: string): Promise<InferenceResult>;
}

export interface AIStatusInfo {
  status: AIStatus;
  isEnabled: boolean;
  canPrompt: boolean;
  model?: ModelMetadata;
}
