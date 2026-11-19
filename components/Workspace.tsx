"use client";

import { useState, useRef, type ReactNode } from "react";
import {
  ENGINE_CONFIG,
  MAX_FILE_CHARS,
  estimateTokens,
  getContextStatus,
  getFilePath,
  type OrienEngine,
} from "@/lib/context";
import type { RepositoryAnalysis } from "@/lib/repositoryAnalyzer";
import { API_BASE_URL, getOrienHeaders } from "@/lib/api";
import type { EditProposal } from "@/lib/types";

type WorkspaceProps = {
  selectedFiles: File[];
  contextFiles: File[];
  engine: OrienEngine;
  analysis: RepositoryAnalysis | null;
  dependenciesSlot?: ReactNode;
  onFilesSelected: (files: File[]) => void;
  onAddFiles: (files: File[]) => void;
  activeFile: File | null;
  filePreview: string;
  previewFileName: string;
  onProposalChange: (proposal: EditProposal | null) => void;
};

export default function Workspace({
  selectedFiles,
  contextFiles,
  engine,
  dependenciesSlot,
  onFilesSelected,
  onAddFiles,
  activeFile,
  filePreview,
  previewFileName,
  onProposalChange,
}: WorkspaceProps) {
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [task, setTask] = useState("");
  const [answer, setAnswer] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const activeEngine = ENGINE_CONFIG[engine];

  const usableFiles = contextFiles.filter(
    (file) => getContextStatus(file) === "ok"
  );

  const estimatedContextTokens = usableFiles.reduce((total, file) => {
    const cappedChars = Math.min(file.size, MAX_FILE_CHARS);
    return total + Math.max(1, Math.ceil(cappedChars / 4));
  }, 0);

  const estimatedPromptTokens =
    estimatedContextTokens + estimateTokens(task) + 350;
  const isOverEngineLimit = estimatedPromptTokens > activeEngine.maxTokens;

  async function buildRepositoryContext() {
    if (usableFiles.length === 0) {
      return "";
    }

    const contextParts: string[] = [];
    let totalCharacters = 0;

    for (const file of usableFiles) {
      if (totalCharacters >= activeEngine.maxChars) {
        break;
      }

      const content = await file.text();
      const remaining = activeEngine.maxChars - totalCharacters;
      const available = Math.min(MAX_FILE_CHARS, remaining);
      const block = `FILE: ${getFilePath(file)}\n${content.slice(0, available)}`;

      contextParts.push(block);
      totalCharacters += block.length;
    }

    return contextParts.join("\n\n");
  }

  async function handleAskOrien() {
    if (!task.trim()) {
      setErrorMessage("Please describe a problem or question first.");
      return;
    }

    setIsLoading(true);
    setAnswer("");
    setErrorMessage("");
    onProposalChange(null);

    try {
      const repositoryContext = await buildRepositoryContext();

      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: "POST",
        headers: getOrienHeaders(),
        body: JSON.stringify({
          message: task,
          repository_context: repositoryContext,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Something went wrong.");
      }

      setAnswer(data.answer);
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not reach Orien backend."
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleProposeEdit() {
    if (!task.trim()) {
      setErrorMessage("Please describe what you want Orien to change.");
      return;
    }

    if (usableFiles.length === 0) {
      setErrorMessage(
        "Select at least one text file in the sidebar before proposing edits."
      );
      return;
    }

    if (isOverEngineLimit) {
      setErrorMessage(
        `Estimated input (~${estimatedPromptTokens.toLocaleString()} tokens) exceeds ${activeEngine.label}'s ${activeEngine.maxTokens.toLocaleString()}-token cap. Deselect extra files or switch to Orien Horizon.`
      );
      return;
    }

    setIsLoading(true);
    setAnswer("");
    setErrorMessage("");
    onProposalChange(null);

    try {
      const repositoryContext = await buildRepositoryContext();

      const response = await fetch(`${API_BASE_URL}/edit`, {
        method: "POST",
        headers: getOrienHeaders(),
        body: JSON.stringify({
          message: task,
          repository_context: repositoryContext,
          engine,
          reasoning_effort: activeEngine.reasoningEffort,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Edit request failed.");
      }

      if (!data.success || !Array.isArray(data.changes)) {
        throw new Error("Orien returned an invalid edit response.");
      }

      onProposalChange({
        summary: data.summary,
        changes: data.changes,
      });
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not reach Orien backend."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border border-white/10 rounded-2xl p-6 bg-white/[0.02]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">Ask Orien</h2>
          <span
            className={`text-xs font-mono px-2.5 py-1 rounded-full border ${
              engine === "horizon"
                ? "text-purple-300 border-purple-500/30 bg-purple-500/10"
                : "text-blue-300 border-blue-500/30 bg-blue-500/10"
            }`}
          >
            {activeEngine.label} · {activeEngine.maxTokens.toLocaleString()} cap
          </span>
        </div>

        <p className="text-zinc-400 text-sm mt-1">
          Upload a repository folder or individual files, select context files
          on the left, and ask Orien or propose targeted code edits.
        </p>

        {/* Hidden Folder Input */}
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            onFilesSelected(files);
            event.target.value = "";
          }}
          {...({
            webkitdirectory: "",
            directory: "",
          } as React.InputHTMLAttributes<HTMLInputElement>)}
        />

        {/* Hidden Individual Files Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length === 0) return;
            if (selectedFiles.length > 0) {
              onAddFiles(files);
            } else {
              onFilesSelected(files);
            }
            event.target.value = "";
          }}
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            className="bg-white text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-200 transition"
          >
            Upload Repository Folder
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="border border-white/15 bg-white/5 hover:bg-white/10 text-zinc-200 px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            {selectedFiles.length > 0 ? "+ Add Files" : "Upload Files"}
          </button>

          <span className="text-sm text-zinc-400">
            {selectedFiles.length > 0
              ? `${selectedFiles.length} files loaded (${usableFiles.length} in context)`
              : "No files uploaded"}
          </span>
        </div>

        <textarea
          value={task}
          onChange={(event) => setTask(event.target.value)}
          placeholder="Describe a bug to hunt, a refactor, or a question about the selected files..."
          className="w-full h-32 mt-5 bg-black/40 border border-white/10 focus:border-blue-500 rounded-xl p-4 text-sm text-white placeholder:text-zinc-500 outline-none resize-none"
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
          <span
            className={
              isOverEngineLimit ? "text-red-400" : "text-zinc-400"
            }
          >
            Est. edit payload: ~{estimatedPromptTokens.toLocaleString()} /{" "}
            {activeEngine.maxTokens.toLocaleString()} tokens
          </span>
          <span className="text-zinc-500">
            Reasoning: {activeEngine.reasoningEffort}
          </span>
        </div>

        {isOverEngineLimit && (
          <p className="mt-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            Token guardrail active: remove files from context or switch to Orien
            Horizon (30k) before proposing edits.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleAskOrien}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-5 py-2.5 rounded-xl text-sm font-medium transition"
          >
            {isLoading ? "Thinking..." : "Ask Orien"}
          </button>

          <button
            type="button"
            onClick={handleProposeEdit}
            disabled={isLoading || isOverEngineLimit}
            className="bg-white/10 hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2.5 rounded-xl text-sm font-medium transition"
          >
            {isLoading
              ? "Thinking..."
              : `Propose Edit (${activeEngine.label})`}
          </button>
        </div>

        {errorMessage && (
          <p className="mt-4 text-sm text-red-400">{errorMessage}</p>
        )}

        {answer && (
          <div className="mt-5 border border-white/10 rounded-xl p-4 bg-black/30">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              Orien Response
            </h3>
            <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">
              {answer}
            </p>
          </div>
        )}
      </div>

      {dependenciesSlot}

      {/* Built-in Active File Preview */}
      {activeFile && (
        <div className="border border-white/10 rounded-2xl overflow-hidden bg-white/[0.02]">
          <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between gap-3 bg-black/30">
            <span className="text-xs font-mono text-zinc-200 truncate">
              {previewFileName}
            </span>
            <span className="text-[11px] font-mono text-zinc-500 shrink-0">
              {filePreview.split("\n").length} lines ·{" "}
              {filePreview.length.toLocaleString()} chars
            </span>
          </div>
          <pre className="p-5 text-xs font-mono text-zinc-300 overflow-x-auto max-h-96 whitespace-pre leading-relaxed">
            {filePreview}
          </pre>
        </div>
      )}
    </div>
  );
}