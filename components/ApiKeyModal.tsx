"use client";

import { useEffect, useState } from "react";
import {
  loadByokConfig,
  saveByokConfig,
  type OrienByokConfig,
} from "@/lib/api";

type ApiKeyModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved?: (config: OrienByokConfig) => void;
};

export default function ApiKeyModal({
  open,
  onClose,
  onSaved,
}: ApiKeyModalProps) {
  const [coarenaKey, setCoarenaKey] = useState("");
  const [googleStudioKey, setGoogleStudioKey] = useState("");
  const [ownerPasscode, setOwnerPasscode] = useState("");
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    if (!open) return;
    const current = loadByokConfig();
    setCoarenaKey(current.coarenaKey);
    setGoogleStudioKey(current.googleStudioKey);
    setOwnerPasscode(current.ownerPasscode);
    setSavedToast(false);
  }, [open]);

  if (!open) return null;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const nextConfig: OrienByokConfig = {
      coarenaKey: coarenaKey.trim(),
      googleStudioKey: googleStudioKey.trim(),
      ownerPasscode: ownerPasscode.trim(),
    };
    saveByokConfig(nextConfig);
    setSavedToast(true);
    onSaved?.(nextConfig);
    setTimeout(() => {
      setSavedToast(false);
      onClose();
    }, 600);
  }

  function handleClear() {
    const empty: OrienByokConfig = {
      coarenaKey: "",
      googleStudioKey: "",
      ownerPasscode: "",
    };
    setCoarenaKey("");
    setGoogleStudioKey("");
    setOwnerPasscode("");
    saveByokConfig(empty);
    onSaved?.(empty);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#111115] shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">
              🔑 Orien API Keys
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Stored locally in your browser · Never saved on Orien&apos;s
              servers
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white text-sm px-2 py-1"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3.5 text-xs text-blue-200 leading-relaxed">
            Orien handles all engine routing, reasoning budgets, and safety
            guardrails automatically—you only need to provide your{" "}
            <strong className="text-white">CoArena</strong> key (for{" "}
            <span className="font-mono text-blue-300">Orien Carbon</span>,{" "}
            <span className="font-mono text-blue-300">Ask Orien</span> &amp;{" "}
            <span className="font-mono text-blue-300">Issue Drafter</span>) and{" "}
            <strong className="text-white">Google AI Studio</strong> key (for{" "}
            <span className="font-mono text-purple-300">Orien Horizon</span>).
          </div>

          {/* Key 1: CoArena */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-200 block">
              1. CoArena API Key{" "}
              <span className="text-zinc-500 font-normal">
                (Can be Claimed For Free 😊)
              </span>
            </label>
            <input
              type="password"
              value={coarenaKey}
              onChange={(e) => setCoarenaKey(e.target.value)}
              placeholder="Paste your CoArena API key..."
              className="w-full bg-black/40 border border-white/10 focus:border-blue-500 rounded-xl px-3.5 py-2 text-xs font-mono text-white placeholder:text-zinc-600 outline-none"
            />
          </div>

          {/* Key 2: Google AI Studio */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-200 block">
              2. Google AI Studio API Key{" "}
              <span className="text-zinc-500 font-normal">
                (Can be Claimed for Free 😊)
              </span>
            </label>
            <input
              type="password"
              value={googleStudioKey}
              onChange={(e) => setGoogleStudioKey(e.target.value)}
              placeholder="AIzaSy... (Paste your Google AI Studio key)"
              className="w-full bg-black/40 border border-white/10 focus:border-purple-500 rounded-xl px-3.5 py-2 text-xs font-mono text-white placeholder:text-zinc-600 outline-none"
            />
          </div>

          {/* Optional Owner Passcode */}
          <div className="pt-2 border-t border-white/10 space-y-1.5">
            <label className="text-xs font-medium text-zinc-400 block">
              Owner Passcode{" "}
              <span className="text-zinc-600">
                (Optional — unlocks server .env keys for repository owner)
              </span>
            </label>
            <input
              type="password"
              value={ownerPasscode}
              onChange={(e) => setOwnerPasscode(e.target.value)}
              placeholder="Leave blank if using your own keys above"
              className="w-full bg-black/40 border border-white/10 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs font-mono text-white placeholder:text-zinc-600 outline-none"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-zinc-500 hover:text-red-400 transition"
            >
              Clear stored keys
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs font-medium text-zinc-300 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-semibold text-white transition"
              >
                {savedToast ? "✓ Keys Saved!" : "Save Keys Locally"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}