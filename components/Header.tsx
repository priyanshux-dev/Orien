"use client";

import { useRef, useState } from "react";

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
}: HeaderProps) {
  const addFilesInputRef = useRef<HTMLInputElement | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [addedNotice, setAddedNotice] = useState("");

  function handleExtraFilesPicked(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    const ignoredFolders = [
      "node_modules",
      ".git",
      ".next",
      "dist",
      "build",
      "coverage",
      "__pycache__",
      ".venv",
    ];

    const validFiles = Array.from(fileList).filter((file) => {
      const path = file.webkitRelativePath || file.name;
      return !path.split("/").some((part) => ignoredFolders.includes(part));
    });

    if (validFiles.length > 0) {
      onAddFiles(validFiles);
      setAddedNotice(
        `+${validFiles.length} ${validFiles.length === 1 ? "file" : "files"} added`
      );
      setTimeout(() => setAddedNotice(""), 3000);
    }
  }

  function confirmWorkspaceReset() {
    setShowResetModal(false);
    onResetWorkspace();
  }

  return (
    <>
      <header className="absolute top-0 left-0 right-0 z-20 h-16 px-6 flex items-center justify-between pointer-events-none">
        {/* Left: Workspace Breadcrumb + Open Source vs Project Mode Switch */}
        <div className="pointer-events-auto flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#121216]/90 backdrop-blur px-4 py-1.5 text-xs">
            <span className="text-zinc-400">Workspace</span>
            {repoName && (
              <>
                <span className="text-zinc-600">/</span>
                <span className="font-semibold text-white">{repoName}</span>
              </>
            )}
            {addedNotice && (
              <span className="ml-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-mono text-emerald-300">
                {addedNotice}
              </span>
            )}
          </div>

          {/* Open Source vs Project Mode Pill */}
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-[#121216]/90 backdrop-blur p-1 text-[11px]">
            <button
              type="button"
              onClick={() => onSelectWorkspaceMode("opensource")}
              title="Open Source Mode: Direct disk edits locked. Download .patch or draft verified GitHub Issues."
              className={`px-2.5 py-0.5 rounded-full font-medium transition ${
                workspaceMode === "opensource"
                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Open Source
            </button>
            <button
              type="button"
              onClick={() => onSelectWorkspaceMode("project")}
              title="Project Mode: Link local project folder via browser File System Access to apply fixes in 1 click."
              className={`px-2.5 py-0.5 rounded-full font-medium transition flex items-center gap-1 ${
                workspaceMode === "project"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <span>Project</span>
              {workspaceMode === "project" && hasProjectWriteHandle && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              )}
            </button>
          </div>
        </div>

        {/* Right: Panel Toggles + Docs Link + Traffic-Light Action Circles */}
        <div className="pointer-events-auto flex items-center gap-2.5">
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-[#121216]/90 backdrop-blur p-1 text-xs">
            <button
              type="button"
              onClick={onToggleAsk}
              className={`px-3 py-1 rounded-full font-medium transition ${
                showAsk
                  ? "bg-white/10 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Ask Orien
            </button>

            <button
              type="button"
              onClick={onToggleProposalChat}
              className={`px-3 py-1 rounded-full font-medium transition ${
                showProposalChat
                  ? "bg-white/10 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Proposal chat
            </button>

            <a
              href="/docs"
              target="_blank"
              rel="noopener noreferrer"
              title="Open Orien Documentation in a new tab"
              className="px-3 py-1 rounded-full font-medium text-blue-300 hover:bg-blue-500/15 transition"
            >
              Docs ↗
            </a>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#121216]/90 backdrop-blur px-3 py-2">
            <button
              type="button"
              onClick={onToggleSplit}
              disabled={!hasProposal}
              title={
                hasProposal
                  ? splitView
                    ? "Switch to Unified Diff View"
                    : "Switch to Split Diff View"
                  : "Split View available once a proposal is generated"
              }
              className={`w-3 h-3 rounded-full transition ${
                !hasProposal
                  ? "bg-zinc-600 opacity-50 cursor-not-allowed"
                  : splitView
                  ? "bg-blue-400 ring-2 ring-blue-400/40 cursor-pointer"
                  : "bg-zinc-400 hover:bg-zinc-200 cursor-pointer"
              }`}
            />

            <button
              type="button"
              onClick={() => addFilesInputRef.current?.click()}
              title="Add extra files to workspace"
              className="w-3 h-3 rounded-full bg-emerald-500 hover:bg-emerald-400 hover:scale-110 transition cursor-pointer"
            />

            <button
              type="button"
              onClick={() => setShowResetModal(true)}
              disabled={!hasFiles}
              title={
                hasFiles
                  ? "Reset workspace and clear loaded repository"
                  : "Workspace is already empty"
              }
              className={`w-3 h-3 rounded-full transition ${
                hasFiles
                  ? "bg-red-500 hover:bg-red-400 hover:scale-110 cursor-pointer"
                  : "bg-red-500/30 cursor-not-allowed"
              }`}
            />

            <input
              ref={addFilesInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                handleExtraFilesPicked(event.target.files);
                event.target.value = "";
              }}
            />
          </div>
        </div>
      </header>

      {/* Confirmation Modal for Red Reset Circle */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#121216] p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-white">
              Reset Workspace?
            </h3>
            <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
              This will clear{" "}
              <span className="font-mono text-zinc-200">
                {repoName || "the current repository"}
              </span>
              , your selected context files, dependency analysis, and any active
              edit proposal.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-3.5 py-1.5 text-xs font-medium text-zinc-300 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmWorkspaceReset}
                className="rounded-lg bg-red-600 hover:bg-red-500 px-3.5 py-1.5 text-xs font-semibold text-white transition"
              >
                Reset Workspace
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}