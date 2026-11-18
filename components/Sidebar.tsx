"use client";

import { useMemo, useState } from "react";
import FileExplorer from "./FileExplorer";
import {
  ENGINE_CONFIG,
  HARD_GATEWAY_TOKEN_LIMIT,
  PROMPT_OVERHEAD_TOKENS,
  estimateFileTokens,
  formatCompactTokens,
  getContextStatus,
  getFilePath,
  type OrienEngine,
} from "@/lib/context";

type Props = {
  files: File[];
  contextFiles: File[];
  engine: OrienEngine;
  onEngineChange: (engine: OrienEngine) => void;
  onSelect: (file: File) => void;
  onToggleContext: (file: File) => void;
  onRemoveContextPath: (path: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

export default function Sidebar({
  files,
  contextFiles,
  engine,
  onEngineChange,
  onSelect,
  onToggleContext,
  onRemoveContextPath,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: Props) {
  const [showSelectedFiles, setShowSelectedFiles] = useState(false);
  const config = ENGINE_CONFIG[engine];

  const tokenSummary = useMemo(() => {
    const validFiles = contextFiles.filter(
      (file) => getContextStatus(file) === "ok"
    );
    const perFile = validFiles.map((file) => ({
      file,
      path: getFilePath(file),
      name: getFilePath(file).split("/").pop() || file.name,
      tokens: estimateFileTokens(file),
    }));

    const filesTotal = perFile.reduce((sum, item) => sum + item.tokens, 0);
    const grandTotal = filesTotal > 0 ? filesTotal + PROMPT_OVERHEAD_TOKENS : 0;
    const ratio = Math.min(
      100,
      Math.round((grandTotal / config.targetLimit) * 100)
    );
    const remainingGatewayTokens = Math.max(
      0,
      HARD_GATEWAY_TOKEN_LIMIT - grandTotal
    );

    let breakdown = "";
    if (perFile.length === 1) {
      breakdown = `(${perFile[0].tokens.toLocaleString()})`;
    } else if (perFile.length > 1 && perFile.length <= 4) {
      breakdown = `(${perFile.map((item) => item.tokens.toLocaleString()).join(" + ")})`;
    } else if (perFile.length > 4) {
      const head = perFile
        .slice(0, 3)
        .map((item) => item.tokens.toLocaleString())
        .join(" + ");
      breakdown = `(${head} + ${perFile.length - 3} more)`;
    }

    return {
      items: perFile,
      count: validFiles.length,
      filesTotal,
      grandTotal,
      ratio,
      remainingGatewayTokens,
      breakdown,
    };
  }, [contextFiles, config.targetLimit]);

  const isOverTarget = tokenSummary.grandTotal > config.targetLimit;
  const isWarningZone =
    !isOverTarget && tokenSummary.grandTotal > config.greenLimit;

  const barColor = isOverTarget
    ? "bg-red-500"
    : isWarningZone
    ? "bg-yellow-400"
    : engine === "horizon"
    ? "bg-sky-400"
    : "bg-emerald-500";

  const badgeText = isOverTarget
    ? "text-red-400"
    : isWarningZone
    ? "text-yellow-400"
    : engine === "horizon"
    ? "text-sky-400"
    : "text-emerald-400";

  const statusLabel =
    engine === "carbon"
      ? isOverTarget
        ? "Blocked (>6k) — Undo or Horizon"
        : isWarningZone
        ? "4.5k–6k · medium reasoning"
        : "Carbon optimal · medium"
      : isOverTarget
      ? "Blocked (>30k) — Undo or untick"
      : isWarningZone
      ? "18k–30k scan · medium"
      : "Horizon optimal · 64k out";

  return (
    <aside className="w-72 h-screen shrink-0 bg-[#0c0c0f] border-r border-white/10 flex flex-col">
      <div className="h-14 shrink-0 px-6 flex items-center border-b border-white/10">
        <h1 className="text-[28px] leading-none font-semibold tracking-tight">
          Orien<span className="text-blue-500">.</span>
        </h1>
      </div>

      <div className="flex-1 min-h-0 flex flex-col px-3 pt-5">
        <div className="flex items-center justify-between px-3 mb-2">
          <p className="text-sm font-medium text-zinc-300">Workspace</p>
          <span className="text-xs text-zinc-500">{files.length} files</span>
        </div>

        {/* Orien Carbon vs Orien Horizon Engine Switcher + Token Meter + Undo/Redo + Selected Files Drawer */}
        <div className="mx-2 mb-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="flex items-center justify-between gap-1 mb-2 rounded-lg bg-black/40 p-1 border border-white/5">
            <button
              type="button"
              onClick={() => onEngineChange("carbon")}
              title="Orien Carbon: CoArena · DeepSeek V4.1 Flash · 6k hard limit · medium reasoning"
              className={`flex-1 py-1 rounded-md text-[10px] font-medium transition ${
                engine === "carbon"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              ⚡ Carbon · 6k
            </button>
            <button
              type="button"
              onClick={() => onEngineChange("horizon")}
              title="Orien Horizon: Google AI Studio · Gemini 4 Hydrogen · 30k hard limit · 64k output"
              className={`flex-1 py-1 rounded-md text-[10px] font-medium transition ${
                engine === "horizon"
                  ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              🌌 Horizon · 30k
            </button>
          </div>

          <p className="mb-2 text-[10px] font-mono text-zinc-500 truncate">
            {config.providerLabel}
          </p>

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400">
              {tokenSummary.count}{" "}
              {tokenSummary.count === 1 ? "file" : "files"} selected
            </span>
            <span
              className={`font-mono font-semibold ${
                tokenSummary.count > 0 ? badgeText : "text-zinc-500"
              }`}
            >
              ~{tokenSummary.grandTotal.toLocaleString()} /{" "}
              {formatCompactTokens(config.targetLimit)}
            </span>
          </div>

          {tokenSummary.count > 0 ? (
            <>
              <p
                className="mt-1 font-mono text-[10px] text-zinc-400 truncate"
                title={`${tokenSummary.filesTotal.toLocaleString()} file tokens ${tokenSummary.breakdown} + ~${PROMPT_OVERHEAD_TOKENS} prompt tokens`}
              >
                {tokenSummary.filesTotal.toLocaleString()}{" "}
                {tokenSummary.breakdown} + {PROMPT_OVERHEAD_TOKENS}
              </p>

              <div className="mt-2 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full transition-all duration-200 ${barColor}`}
                  style={{ width: `${Math.max(4, tokenSummary.ratio)}%` }}
                />
              </div>

              <div className="mt-1.5 flex items-center justify-between text-[10px]">
                <span className={badgeText}>{statusLabel}</span>
                <span className="text-zinc-500">{tokenSummary.ratio}%</span>
              </div>
            </>
          ) : (
            <p className="mt-1 text-[10px] text-zinc-600">
              {engine === "carbon"
                ? "Hard 6k cap · medium reasoning."
                : "Hard 30k cap · medium reasoning · 64k out."}
            </p>
          )}

          {/* Undo / Redo + Click-to-View Selected Files Bar */}
          <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={() => setShowSelectedFiles((prev) => !prev)}
              className={`flex-1 flex items-center justify-between px-2 py-1 rounded-md text-[10px] font-medium border transition ${
                showSelectedFiles
                  ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                  : "bg-black/30 text-zinc-400 border-white/10 hover:text-zinc-200"
              }`}
            >
              <span>Selected files ({tokenSummary.count})</span>
              <span>{showSelectedFiles ? "▴" : "▾"}</span>
            </button>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                title="Undo last file selection change"
                className="px-2 py-1 rounded-md text-[10px] font-medium border border-white/10 bg-black/30 text-zinc-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed transition"
              >
                ↩ Undo
              </button>
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                title="Redo file selection change"
                className="px-2 py-1 rounded-md text-[10px] font-medium border border-white/10 bg-black/30 text-zinc-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed transition"
              >
                ↪
              </button>
            </div>
          </div>

          {/* Expandable Selected Files List (ONLY shown when clicked!) */}
          {showSelectedFiles && (
            <div className="mt-2 rounded-lg border border-white/10 bg-black/50 p-2 max-h-36 overflow-y-auto space-y-1">
              {tokenSummary.items.length > 0 ? (
                tokenSummary.items.map((item) => (
                  <div
                    key={item.path}
                    className="flex items-center justify-between gap-1.5 rounded px-1.5 py-1 hover:bg-white/5 text-[11px]"
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(item.file)}
                      title={item.path}
                      className="min-w-0 flex-1 text-left font-mono text-zinc-200 truncate hover:text-blue-300"
                    >
                      {item.name}
                    </button>
                    <span className="font-mono text-[10px] text-zinc-500 shrink-0">
                      {formatCompactTokens(item.tokens)}t
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveContextPath(item.path)}
                      title={`Remove ${item.name} from context`}
                      className="text-zinc-500 hover:text-red-400 px-1 text-xs leading-none shrink-0"
                    >
                      ×
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-[10px] text-zinc-500 text-center py-1.5">
                  No files selected for AI call yet.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pb-4">
          {files.length ? (
            <FileExplorer
              files={files}
              contextFiles={contextFiles}
              selectedCount={tokenSummary.count}
              remainingGatewayTokens={tokenSummary.remainingGatewayTokens}
              onSelect={onSelect}
              onToggleContext={onToggleContext}
            />
          ) : (
            <p className="text-xs text-zinc-600 px-3">
              No repository loaded yet.
            </p>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 p-4">
        <div className="flex items-center gap-3 px-2">
          <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-sm font-semibold">
            P
          </div>
          <p className="text-sm text-zinc-300">Account</p>
        </div>
      </div>
    </aside>
  );
}