export const MAX_FILE_CHARS = 250_000;
export const MAX_TOTAL_CHARS = 111_000;
export const CHARS_PER_TOKEN = 3.7;
export const PROMPT_OVERHEAD_TOKENS = 500;
export const HARD_GATEWAY_TOKEN_LIMIT = 115_000;

export type OrienEngine = "carbon" | "horizon";

export const ENGINE_CONFIG: Record<
  OrienEngine,
  {
    name: string;
    shortLabel: string;
    providerLabel: string;
    greenLimit: number;
    targetLimit: number;
    maxChars: number;
    reasoningEffort: "low" | "medium" | "high";
  }
> = {
  carbon: {
    name: "Orien Carbon",
    shortLabel: "Carbon · 6k",
    providerLabel: "CoArena · DeepSeek V4.1 Flash",
    greenLimit: 4_500,
    targetLimit: 6_000,
    maxChars: 22_200,
    reasoningEffort: "medium",
  },
  horizon: {
    name: "Orien Horizon",
    shortLabel: "Horizon · 30k",
    providerLabel: "AI Studio · Gemini 4 Hydrogen",
    greenLimit: 18_000,
    targetLimit: 30_000,
    maxChars: 111_000,
    reasoningEffort: "medium",
  },
};

const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "coverage",
  "__pycache__", ".venv", "venv",
]);
const IGNORED_NAMES = new Set([
  ".env", ".env.local", ".env.development", ".env.production",
  ".env.test", "id_rsa", "id_ed25519", "credentials", "secrets",
]);
const IGNORED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".tiff",
  ".pdf", ".zip", ".tar", ".gz", ".7z", ".rar", ".exe", ".dll",
  ".so", ".dylib", ".bin", ".dat", ".mp3", ".mp4", ".mov", ".avi",
  ".wav", ".woff", ".woff2", ".ttf", ".otf",
]);

export type ContextFileStatus = "ok" | "ignored" | "too_large";

export function getFilePath(file: File): string {
  return file.webkitRelativePath || file.name;
}

export function estimateFileTokens(file: File): number {
  if (!file || file.size <= 0) return 0;
  const effectiveChars = Math.min(file.size, MAX_FILE_CHARS);
  return Math.ceil(effectiveChars / CHARS_PER_TOKEN);
}

export function formatCompactTokens(tokens: number): string {
  if (tokens < 1_000) return `${tokens}`;
  if (tokens < 10_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return `${Math.round(tokens / 1_000)}k`;
}

export function getContextStatus(file: File): ContextFileStatus {
  const parts = getFilePath(file).split(/[\\/]+/).filter(Boolean);
  const normalized = parts.map((part) => part.toLowerCase());
  const name = normalized.at(-1) ?? "";
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";

  if (
    normalized.some((part) => IGNORED_DIRS.has(part)) ||
    IGNORED_NAMES.has(name) ||
    name.startsWith(".env.") ||
    [".pem", ".key", ".p12", ".pfx"].some((ext) => name.endsWith(ext)) ||
    normalized.includes(".ssh") ||
    IGNORED_EXTENSIONS.has(extension)
  ) return "ignored";

  if (file.size > MAX_FILE_CHARS * 4) return "too_large";
  return "ok";
}

export function estimateContextTotalTokens(files: File[]): number {
  const filesTotal = files
    .filter((file) => getContextStatus(file) === "ok")
    .reduce((sum, file) => sum + estimateFileTokens(file), 0);

  return filesTotal > 0 ? filesTotal + PROMPT_OVERHEAD_TOKENS : 0;
}