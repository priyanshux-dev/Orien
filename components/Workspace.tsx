"use client";

import { useMemo, useState, type ReactNode } from "react";

import type { RepositoryAnalysis } from "@/lib/repositoryAnalyzer";
import type { EditProposal } from "@/lib/type";

import {
  ENGINE_CONFIG,
  MAX_FILE_CHARS,
  estimateContextTotalTokens,
  getContextStatus,
  getFilePath,
  type OrienEngine,
} from "@/lib/context";

type WorkspaceProps = {
  selectedFiles: File[];
  contextFiles: File[];
  engine: OrienEngine;
  analysis: RepositoryAnalysis | null;
  dependenciesSlot?: ReactNode;
  onFilesSelected: (files: File[]) => void;
  onAddFiles?: (files: File[]) => void;
  activeFile: File | null;
  filePreview: string;
  previewFileName: string;
  onProposalChange: (proposal: EditProposal | null) => void;
};

export default function Workspace({
  selectedFiles,
  contextFiles,
  engine,
  analysis,
  dependenciesSlot,
  onFilesSelected,
  activeFile,
  filePreview,
  previewFileName,
  onProposalChange,
}: WorkspaceProps) {
  // AI Agent State
  const [task, setTask] = useState("");
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [agentResponse, setAgentResponse] = useState("");
  const [agentError, setAgentError] = useState("");

  // Edit Proposal State
  const [isProposing, setIsProposing] = useState(false);
  const [proposalError, setProposalError] = useState("");

  const activeEngine = ENGINE_CONFIG[engine];

  const estimatedContextTokens = useMemo(
    () => estimateContextTotalTokens(contextFiles),
    [contextFiles]
  );

  const isOverEngineLimit = estimatedContextTokens > activeEngine.targetLimit;

  // Build Repository Context (strictly bounded by activeEngine.maxChars including metadata)
  async function buildRepositoryContext(): Promise<string> {
    const contextParts: string[] = [];
    let totalCharacters = 0;

    if (analysis) {
      const selectedPathSet = new Set(contextFiles.map(getFilePath));
      const relevantDeps = analysis.dependencies.filter((dep) =>
        selectedPathSet.has(dep.file)
      );

      const compactAnalysis = {
        languages: analysis.languages,
        frameworks: analysis.frameworks,
        selectedFileImports: relevantDeps,
      };

      const analysisBlock =
        "REPOSITORY ANALYSIS: " + JSON.stringify(compactAnalysis);

      if (analysisBlock.length <= 800) {
        contextParts.push(analysisBlock);
        totalCharacters += analysisBlock.length;
      }
    }

    for (const file of contextFiles) {
      if (getContextStatus(file) !== "ok") {
        continue;
      }

      if (totalCharacters >= activeEngine.maxChars) {
        break;
      }

      const content = await file.text();
      const remaining = activeEngine.maxChars - totalCharacters;
      const available = Math.min(MAX_FILE_CHARS, remaining);
      const safeContent = content.slice(0, available);

      const fileBlock = `FILE: ${getFilePath(file)}\n${safeContent}`;
      contextParts.push(fileBlock);
      totalCharacters += fileBlock.length;
    }

    return contextParts.join("\n\n");
  }

  // Send Repository Context to AI (/chat)
  async function handleStartAgent() {
    if (!task.trim()) {
      setAgentError("Please describe what you want Orien to do.");
      return;
    }

    if (selectedFiles.length === 0) {
      setAgentError("Please upload a repository first.");
      return;
    }

    if (contextFiles.length === 0) {
      setAgentError(
        "Select at least one file to send (use the checkboxes in the sidebar)."
      );
      return;
    }

    if (isOverEngineLimit) {
      setAgentError(
        `Blocked: ~${estimatedContextTokens.toLocaleString()} tokens exceeds ${activeEngine.name}'s ${activeEngine.targetLimit.toLocaleString()}-token limit.`
      );
      return;
    }

    setIsAgentRunning(true);
    setAgentError("");
    setAgentResponse("");

    try {
      const repositoryContext = await buildRepositoryContext();

      const response = await fetch("http://127.0.0.1:8000/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: task,
          repository_context: repositoryContext,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Orien could not complete the request."
        );
      }

      if (!data.success || typeof data.answer !== "string") {
        throw new Error("The AI returned an unexpected response.");
      }

      setAgentResponse(data.answer);
    } catch (error) {
      console.warn("Agent error:", error);
      setAgentError(
        error instanceof Error
          ? error.message
          : "Something went wrong while contacting Orien."
      );
    } finally {
      setIsAgentRunning(false);
    }
  }

  // Request Edit Proposal from AI (/edit routed to Carbon or Horizon)
  async function handleProposeEdit() {
    if (!task.trim()) {
      setProposalError("Please describe what you want Orien to change.");
      return;
    }

    if (selectedFiles.length === 0) {
      setProposalError("Please upload a repository first.");
      return;
    }

    if (contextFiles.length === 0) {
      setProposalError(
        "Select at least one file to send (use the checkboxes in the sidebar)."
      );
      return;
    }

    if (isOverEngineLimit) {
      setProposalError(
        `Blocked: ~${estimatedContextTokens.toLocaleString()} tokens exceeds ${activeEngine.name}'s ${activeEngine.targetLimit.toLocaleString()}-token limit.`
      );
      return;
    }

    setIsProposing(true);
    setProposalError("");
    onProposalChange(null);

    try {
      const repositoryContext = await buildRepositoryContext();

      const response = await fetch("http://127.0.0.1:8000/edit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: task,
          repository_context: repositoryContext,
          engine,
          reasoning_effort: activeEngine.reasoningEffort,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Orien could not generate an edit proposal."
        );
      }

      if (!data.success || !Array.isArray(data.changes)) {
        throw new Error("The AI returned an unexpected response.");
      }

      onProposalChange({
        summary: data.summary,
        changes: data.changes,
      });
    } catch (error) {
      console.warn("Edit proposal error:", error);
      setProposalError(
        error instanceof Error
          ? error.message
          : "Something went wrong while contacting Orien."
      );
    } finally {
      setIsProposing(false);
    }
  }

  // Calculate Repository Statistics
  const folderPaths = new Set<string>();

  selectedFiles.forEach((file) => {
    const path = file.webkitRelativePath || file.name;
    const parts = path.split("/");

    parts.slice(0, -1).forEach((_, index) => {
      folderPaths.add(parts.slice(0, index + 1).join("/"));
    });
  });

  const folderCount = folderPaths.size;

  const codeExtensions = [
    ".js", ".jsx", ".ts", ".tsx",
    ".py", ".java", ".cpp", ".c",
    ".html", ".css", ".json",
    ".go", ".rs", ".php",
  ];

  const codeFileCount = selectedFiles.filter((file) =>
    codeExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))
  ).length;

  return (
    <div className="p-6">
      {/* Repository Upload */}
      <div className="border border-dashed border-zinc-700 rounded-2xl p-10 text-center mb-8">
        <h3 className="text-lg font-medium mb-3">
          {selectedFiles.length > 0
            ? "Repository Loaded"
            : "Start with a repository"}
        </h3>

        <p className="text-sm text-zinc-500 mb-6">
          {selectedFiles.length > 0
            ? `${selectedFiles.length} files loaded into Orien.`
            : "Bring your project files into Orien."}
        </p>

        <label className="inline-block bg-white text-black px-5 py-3 rounded-lg text-sm font-bold cursor-pointer hover:bg-zinc-200 transition">
          Upload Repository
          <input
            type="file"
            className="hidden"
            multiple
            ref={(element) => {
              element?.setAttribute("webkitdirectory", "");
            }}
            onChange={(event) => {
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

              const files = Array.from(event.target.files ?? []).filter(
                (file) => {
                  const path = file.webkitRelativePath || file.name;
                  return !path
                    .split("/")
                    .some((part) => ignoredFolders.includes(part));
                }
              );

              onFilesSelected(files);
              event.target.value = "";
            }}
          />
        </label>

        {/* File Preview */}
        {activeFile && (
          <div className="mt-8 text-left">
            <h4 className="text-sm font-semibold mb-3">
              Previewing: {previewFileName}
            </h4>

            <pre className="bg-black/40 border border-white/10 rounded-xl p-4 text-xs text-green-400 overflow-auto max-h-96 whitespace-pre-wrap break-words">
              {filePreview}
            </pre>
          </div>
        )}
      </div>

      {/* Repository Statistics */}
      {selectedFiles.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="border border-white/10 rounded-xl p-5">
            <p className="text-sm text-zinc-500">Total Files</p>
            <h3 className="text-2xl font-semibold mt-2">
              {selectedFiles.length}
            </h3>
          </div>

          <div className="border border-white/10 rounded-xl p-5">
            <p className="text-sm text-zinc-500">Folders</p>
            <h3 className="text-2xl font-semibold mt-2">{folderCount}</h3>
          </div>

          <div className="border border-white/10 rounded-xl p-5">
            <p className="text-sm text-zinc-500">Code Files</p>
            <h3 className="text-2xl font-semibold mt-2">{codeFileCount}</h3>
          </div>
        </div>
      )}

      {/* Dependencies Graph moves here automatically once a Proposal is generated */}
      {dependenciesSlot && <div className="mb-8">{dependenciesSlot}</div>}

      {/* Task Description & AI Agent */}
      <div className="border border-white/10 rounded-2xl p-6 bg-white/[0.02]">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="font-medium">Describe your problem</h3>

          <span
            className={`text-[11px] font-mono rounded-full px-2.5 py-0.5 border ${
              engine === "horizon"
                ? "text-sky-300 border-sky-500/30 bg-sky-500/10"
                : "text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
            }`}
          >
            {engine === "horizon" ? "🌌" : "⚡"} {activeEngine.name} · max{" "}
            {activeEngine.targetLimit.toLocaleString()}t
          </span>
        </div>

        <textarea
          value={task}
          onChange={(event) => setTask(event.target.value)}
          placeholder="Explain the issue you want Orien to solve..."
          className="w-full h-32 bg-transparent border border-white/10 rounded-xl p-4 text-sm outline-none resize-none"
        />

        {isOverEngineLimit && (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-300">
            🛑 Request blocked: selected context is{" "}
            <span className="font-mono font-semibold">
              ~{estimatedContextTokens.toLocaleString()} tokens
            </span>
            , exceeding{" "}
            <span className="font-semibold">{activeEngine.name}</span>&apos;s{" "}
            <span className="font-mono font-semibold">
              {activeEngine.targetLimit.toLocaleString()}-token
            </span>{" "}
            limit. Click <span className="font-semibold">↩ Undo</span> in the
            sidebar or untick files to stay within limit.
          </div>
        )}

        <div className="flex justify-between items-center mt-4">
          <p className="text-xs text-zinc-500">{activeEngine.providerLabel}</p>

          <div className="flex gap-3">
            <button
              onClick={handleStartAgent}
              disabled={
                isAgentRunning ||
                isProposing ||
                isOverEngineLimit ||
                selectedFiles.length === 0 ||
                !task.trim()
              }
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm transition"
            >
              {isAgentRunning ? "Orien is thinking..." : "Start Agent"}
            </button>

            <button
              onClick={handleProposeEdit}
              disabled={
                isAgentRunning ||
                isProposing ||
                isOverEngineLimit ||
                selectedFiles.length === 0 ||
                !task.trim()
              }
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm transition"
            >
              {isProposing
                ? `Running ${activeEngine.name}...`
                : "Propose Edit"}
            </button>
          </div>
        </div>

        {agentError && (
          <p className="text-sm text-red-400 mt-4">{agentError}</p>
        )}

        {proposalError && (
          <p className="text-sm text-red-400 mt-4">{proposalError}</p>
        )}

        {agentResponse && (
          <div className="mt-6 border border-white/10 rounded-xl p-5 bg-black/30">
            <h4 className="font-semibold text-white mb-3">
              Orien&apos;s Analysis
            </h4>

            <pre className="text-sm text-zinc-300 whitespace-pre-wrap break-words font-sans">
              {agentResponse}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}