export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

export type OrienByokConfig = {
  coarenaKey: string;
  googleStudioKey: string;
  ownerPasscode: string;
};

const BYOK_STORAGE_KEY = "orien_byok_config_v1";

export function loadByokConfig(): OrienByokConfig {
  if (typeof window === "undefined") {
    return { coarenaKey: "", googleStudioKey: "", ownerPasscode: "" };
  }
  try {
    const raw = window.localStorage.getItem(BYOK_STORAGE_KEY);
    if (!raw) {
      return { coarenaKey: "", googleStudioKey: "", ownerPasscode: "" };
    }
    const parsed = JSON.parse(raw);
    return {
      coarenaKey: typeof parsed.coarenaKey === "string" ? parsed.coarenaKey : "",
      googleStudioKey:
        typeof parsed.googleStudioKey === "string"
          ? parsed.googleStudioKey
          : "",
      ownerPasscode:
        typeof parsed.ownerPasscode === "string" ? parsed.ownerPasscode : "",
    };
  } catch {
    return { coarenaKey: "", googleStudioKey: "", ownerPasscode: "" };
  }
}

export function saveByokConfig(config: OrienByokConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BYOK_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore storage quota issues
  }
}

export function getOrienHeaders(): Record<string, string> {
  const cfg = loadByokConfig();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cfg.coarenaKey.trim()) {
    headers["X-Coarena-Key"] = cfg.coarenaKey.trim();
  }
  if (cfg.googleStudioKey.trim()) {
    headers["X-Google-Studio-Key"] = cfg.googleStudioKey.trim();
  }
  if (cfg.ownerPasscode.trim()) {
    headers["X-Owner-Passcode"] = cfg.ownerPasscode.trim();
  }
  return headers;
}