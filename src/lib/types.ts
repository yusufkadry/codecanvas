export type ProviderId = "openai" | "anthropic" | "openrouter" | "ollama";

/** A model as reported by the provider's own /models endpoint. */
export interface ModelInfo {
  id: string;
  label: string;
}

export interface ProjectMeta {
  id: string;
  title: string;
  updatedAt: number;
  fileCount: number;
}

export interface Keys {
  openai: string;
  anthropic: string;
  openrouter: string;
  /** Base URL of a local OpenAI-compatible server, e.g. http://localhost:11434/v1 */
  ollamaUrl: string;
  /** Model name to use on the local server, e.g. llama3.1 */
  ollamaModel: string;
  /** Model slug to use on OpenRouter, user-editable */
  openrouterModel: string;
  /** GitHub personal access token (classic or fine-grained with repo scope) */
  github: string;
}

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  estimated: boolean;
}

export interface ModelChoice {
  provider: ProviderId;
  model: string;
  reason: string;
}

export interface BuildReceipt {
  provider: ProviderId;
  model: string;
  usage: Usage;
  costUsd: number | null; // null when pricing unknown (e.g. OpenRouter passthrough)
  durationMs: number;
  fileCount: number;
}

export type Phase =
  | "landing"
  | "thinking" // model is streaming files
  | "installing" // npm install in WebContainer
  | "starting" // dev server booting
  | "ready" // preview live
  | "error";

export interface LogLine {
  kind: "info" | "cmd" | "out" | "err";
  text: string;
}

export interface VulnFinding {
  pkg: string;
  version: string;
  ids: string[];
}

export type PushStepState = "pending" | "active" | "done" | "failed";

export interface PushStep {
  label: string;
  state: PushStepState;
  detail?: string;
}
