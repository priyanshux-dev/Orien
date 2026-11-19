"use client";

import { useRef } from "react";
import Link from "next/link";

export type WorkspaceMode = "opensource" | "project";

type HeaderProps = {
  repoName: string;
  hasFiles: boolean;
  workspaceMode: WorkspaceMode;
  hasProjectWriteHandle: boolean;
  onSelectWorkspaceMode: (mode: WorkspaceMode) => void;
  showAsk: boolean;
  showProposalChat: boolean;
  onToggleAsk: () => void;
  onToggleProposalChat: () => void;
  splitView: boolean;
  hasProposal: boolean;
  onToggleSplit: () => void;
  onAddFiles: (files: File[]) => void;
  onResetWorkspace: () => void;
  hasConfiguredKeys: boolean;
  onOpenKeyModal: () => void;
};

export default function Header({
  repoName,
  hasFiles,
  workspaceMode,
  hasProjectWriteHandle,
  onSelectWorkspaceMode,
  showAsk,
  showProposalChat,
  onToggleAsk,
  onToggleProposalChat,
  splitView,
  hasProposal,
  onToggleSplit,
  onAddFiles,
  onResetWorkspace,
  hasConfiguredKeys,
  onOpenKeyModal,
}: HeaderProps) {
  const addFileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <header className="absolute top-0 left-0 right-0 z-20 h-14 px-5 flex items-center justify-between gap-3 border-b border-white/10 bg-[#09090b]/85 backdrop-blur-md">
      {/* Left: Brand Link + Repo Pill + Open Source vs Project Mode Toggle */}
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/"
          title="Back to Orien Overview"
          className="text-sm font-bold tracking-tight text-white hover:text-blue-300 transition shrink-0"
        >
          Orien
        </Link>

        {repoName && (
          <span className="hidden md:inline-block truncate max-w-[160px] rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-mono text-zinc-300">
            {repoName}
          </span>
        )}

        {/* Workspace Safety Mode Switcher */}
        <div
          className="flex items-center rounded-lg bg-black/50 p-0.5 border border-white/10 text-xs shrink-0"
          title="Open Source Mode locks direct disk writes; Project Mode lets you apply changes directly to a linked local folder."
        >
          <button
            type="button"
            onClick={() => onSelectWorkspaceMode("opensource")}
            className={`px-2.5 py-1 rounded-md transition ${
              workspaceMode === "opensource"
                ? "bg-blue-600 text-white font-medium"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Open Source
          </button>
          <button
            type="button"
            onClick={() => onSelectWorkspaceMode("project")}
            className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 ${
              workspaceMode === "project"
                ? "bg-emerald-600 text-white font-medium"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <span>Project</span>
            {hasProjectWriteHandle && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-200" />
            )}
          </button>
        </div>
      </div>

      {/* Right: BYOK Keys + File Actions + Panel Toggles */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenKeyModal}
          title="Configure your CoArena & Google AI Studio API keys"
          className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
            hasConfiguredKeys
              ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
              : "border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
          }`}
        >
          {hasConfiguredKeys ? "🔑 Keys" : "🔑 Add Keys"}
        </button>

        {hasFiles && (
          <>
            <input
              ref={addFileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length > 0) {
                  onAddFiles(files);
                }
                e.target.value = "";
              }}
            />

            <button
              type="button"
              onClick={() => addFileInputRef.current?.click()}
              title="Add extra files into this workspace"
              className="rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-2.5 py-1 text-xs text-zinc-200 transition"
            >
              + Files
            </button>

            <button
              type="button"
              onClick={onResetWorkspace}
              title="Close current repository and reset workspace"
              className="rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 px-2.5 py-1 text-xs font-medium text-red-300 transition"
            >
              Reset
            </button>
          </>
        )}

        {hasProposal && (
          <button
            type="button"
            onClick={onToggleSplit}
            className={`rounded-lg border px-2.5 py-1 text-xs transition ${
              splitView
                ? "border-blue-500/40 bg-blue-500/15 text-blue-200"
                : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
            }`}
          >
            {splitView ? "Card View" : "Split Diff"}
          </button>
        )}

        <button
          type="button"
          onClick={onToggleAsk}
          className={`rounded-lg border px-2.5 py-1 text-xs transition ${
            showAsk
              ? "border-white/20 bg-white/10 text-white"
              : "border-white/10 bg-transparent text-zinc-400 hover:text-white"
          }`}
        >
          Ask Orien
        </button>

        <button
          type="button"
          onClick={onToggleProposalChat}
          className={`rounded-lg border px-2.5 py-1 text-xs transition ${
            showProposalChat
              ? "border-white/20 bg-white/10 text-white"
              : "border-white/10 bg-transparent text-zinc-400 hover:text-white"
          }`}
        >
          Proposal Chat
        </button>

        <Link
          href="/docs"
          className="rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-2.5 py-1 text-xs text-zinc-300 transition"
        >
          Docs
        </Link>
      </div>
    </header>
  );
}