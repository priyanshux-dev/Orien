export type OrienEngine = "carbon" | "horizon";

export const MAX_FILE_CHARS = 24000;
export const HARD_GATEWAY_TOKEN_LIMIT = 30000;
export const PROMPT_OVERHEAD_TOKENS = 350;

export const ENGINE_CONFIG: Record<
  OrienEngine,
  {
    label: string;
    modelLabel: string;
    targetLimit: number;
    maxTokens: number;
    maxChars: number;
    reasoningEffort: "low" | "medium" | "high";
  }
> = {
  carbon: {
    label: "Orien Carbon",
    modelLabel: "6k Token Engine",
    targetLimit: 6000,
    maxTokens: 6000,
    maxChars: 22000,
    reasoningEffort: "medium",
  },
  horizon: {
    label: "Orien Horizon",
    modelLabel: "30k Token Engine",
    targetLimit: 30000,
    maxTokens: 30000,
    maxChars: 115000,
    reasoningEffort: "medium",
  },
};

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".svg",
  ".pdf",
  ".zip",
  ".gz",
  ".tar",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".pyc",
  ".pyo",
  ".whl",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp3",
  ".mp4",
  ".wav",
  ".sqlite",
  ".db",
]);

export function getFilePath(file: File): string {
  return file.webkitRelativePath || file.name;
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateFileTokens(file: File): number {
  if (file.size === 0) return 0;
  const cappedChars = Math.min(file.size, MAX_FILE_CHARS);
  return Math.max(1, Math.ceil(cappedChars / 4));
}

export function formatCompactTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  return (tokens / 1000).toFixed(1).replace(/\.0$/, "") + "k";
}

export function getContextStatus(file: File): "ok" | "binary" | "empty" {
  if (file.size === 0) return "empty";
  const lower = file.name.toLowerCase();
  const dotIdx = lower.lastIndexOf(".");
  if (dotIdx !== -1 && BINARY_EXTENSIONS.has(lower.slice(dotIdx))) {
    return "binary";
  }
  return "ok";
}