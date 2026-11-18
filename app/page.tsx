"use client";

import { useCallback, useState } from "react";
import { getContextStatus, getFilePath, type OrienEngine } from "@/lib/context";
import {
  analyzeRepository,
  type RepositoryAnalysis,
} from "@/lib/repositoryAnalyzer";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import Workspace from "@/components/Workspace";
import ProposalPanel from "@/components/ProposalPanel";
import AskOrienPanel from "@/components/AskOrienPanel";
import ProposalChatPanel from "@/components/ProposalChatPanel";
import DependencyGraph from "@/components/DependencyGraph";
import type { EditProposal } from "@/lib/type";

export default function Home() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [activeFile, setActiveFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState("");
  const [previewFileName, setPreviewFileName] = useState("");

  // Context files + Undo/Redo history stack
  const [contextFiles, setContextFiles] = useState<File[]>([]);
  const [undoStack, setUndoStack] = useState<File[][]>([]);
  const [redoStack, setRedoStack] = useState<File[][]>([]);

  // Repository & Dependencies Analysis (lifted so it moves smoothly between Main Screen & Ask Orien)
  const [analysis, setAnalysis] = useState<RepositoryAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [analysisTab, setAnalysisTab] = useState<"graph" | "overview">("graph");

  const [proposal, setProposal] = useState<EditProposal | null>(null);
  const [engine, setEngine] = useState<OrienEngine>("carbon");

  // Split view (original vs proposed)
  const [splitView, setSplitView] = useState(false);

  // Panel visibility
  const [showAsk, setShowAsk] = useState(true);
  const [showProposalChat, setShowProposalChat] = useState(true);

  const repoName =
    selectedFiles.length > 0
      ? (selectedFiles[0].webkitRelativePath || "").split("/")[0]
      : "";

  // Helper to update contextFiles while recording Undo/Redo snapshots
  const commitContextChange = useCallback(
    (updater: (current: File[]) => File[]) => {
      setContextFiles((current) => {
        const next = updater(current);
        const currentKeys = current.map(getFilePath).join("|");
        const nextKeys = next.map(getFilePath).join("|");

        if (currentKeys === nextKeys) {
          return current;
        }

        setUndoStack((prev) => [...prev.slice(-24), current]);
        setRedoStack([]);
        return next;
      });
    },
    []
  );

  function handleUndoContext() {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, contextFiles]);
    setContextFiles(previous);
  }

  function handleRedoContext() {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, contextFiles]);
    setContextFiles(next);
  }

  async function handleSelectFile(file: File) {
    const content = await file.text();

    setActiveFile(file);
    setFilePreview(content);
    setPreviewFileName(file.webkitRelativePath || file.name);
  }

  function handleToggleContext(file: File) {
    const key = getFilePath(file);

    commitContextChange((current) => {
      const alreadySelected = current.some(
        (item) => getFilePath(item) === key
      );

      return alreadySelected
        ? current.filter((item) => getFilePath(item) !== key)
        : [...current, file];
    });
  }

  function handleRemoveContextPath(path: string) {
    commitContextChange((current) =>
      current.filter((item) => getFilePath(item) !== path)
    );
  }

  function handleAddPathsToContext(paths: string[]) {
    const targetPaths = new Set(paths);
    const matchingFiles = selectedFiles.filter(
      (file) =>
        targetPaths.has(getFilePath(file)) && getContextStatus(file) === "ok"
    );

    commitContextChange((current) => {
      const merged = new Map(
        current.map((file) => [getFilePath(file), file])
      );
      matchingFiles.forEach((file) => {
        merged.set(getFilePath(file), file);
      });
      return Array.from(merged.values());
    });
  }

  function handleAddFiles(incomingFiles: File[]) {
    setSelectedFiles((current) => {
      const merged = new Map(
        current.map((file) => [getFilePath(file), file])
      );

      incomingFiles.forEach((file) => {
        merged.set(getFilePath(file), file);
      });

      return Array.from(merged.values());
    });
  }

  async function handleFilesSelected(files: File[]) {
    setSelectedFiles(files);
    setContextFiles([]);
    setUndoStack([]);
    setRedoStack([]);
    setAnalysis(null);
    setAnalysisError("");
    setProposal(null);
    setSplitView(false);

    if (files.length > 0) {
      await handleSelectFile(files[0]);
    } else {
      setActiveFile(null);
      setFilePreview("");
      setPreviewFileName("");
    }
  }

  async function handleAnalyzeRepository() {
    if (selectedFiles.length === 0) return;
    setIsAnalyzing(true);
    setAnalysisError("");

    try {
      const result = await analyzeRepository(selectedFiles);
      setAnalysis(result);
    } catch (error) {
      console.error(error);
      setAnalysisError("Repository analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  const contextFilePaths = contextFiles.map((file) => getFilePath(file));

  // Reusable Dependencies & Analysis Card (renders in Main Screen before proposal, moves to Ask Orien after proposal)
  const dependenciesSection =
    selectedFiles.length > 0 ? (
      <div className="border border-white/10 rounded-2xl p-6 bg-white/[0.02]">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
          <div>
            <h3 className="font-semibold text-lg">
              File Dependencies &amp; Repository Analysis
            </h3>
            <p className="text-sm text-zinc-500 mt-1">
              Select any file to see the exact symbols and modules it imports.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {analysis && (
              <div className="flex rounded-lg bg-black/40 p-1 border border-white/10 text-xs">
                <button
                  type="button"
                  onClick={() => setAnalysisTab("graph")}
                  className={`px-3 py-1 rounded-md transition ${
                    analysisTab === "graph"
                      ? "bg-white/10 text-white font-medium"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  File Imports
                </button>
                <button
                  type="button"
                  onClick={() => setAnalysisTab("overview")}
                  className={`px-3 py-1 rounded-md transition ${
                    analysisTab === "overview"
                      ? "bg-white/10 text-white font-medium"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Stack &amp; Packages
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleAnalyzeRepository}
              disabled={isAnalyzing}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-5 py-2 rounded-lg text-sm font-medium transition"
            >
              {isAnalyzing
                ? "Analyzing..."
                : analysis
                ? "Refresh"
                : "Analyze Dependencies"}
            </button>
          </div>
        </div>

        {analysisError && (
          <p className="text-red-400 text-sm mb-4">{analysisError}</p>
        )}

        {analysis && analysisTab === "graph" && (
          <DependencyGraph
            graph={analysis.graph}
            activeFilePath={previewFileName}
            contextFilePaths={contextFilePaths}
            onAddPathsToContext={handleAddPathsToContext}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            onUndo={handleUndoContext}
            onRedo={handleRedoContext}
          />
        )}

        {analysis && analysisTab === "overview" && (
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-semibold mb-2">
                Programming Languages
              </h4>
              <div className="flex flex-wrap gap-2">
                {analysis.languages.length > 0 ? (
                  analysis.languages.map((language) => (
                    <span
                      key={language}
                      className="bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full text-sm"
                    >
                      {language}
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-zinc-500">
                    No languages detected.
                  </p>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">
                Detected Frameworks
              </h4>
              <div className="flex flex-wrap gap-2">
                {analysis.frameworks.length > 0 ? (
                  analysis.frameworks.map((framework) => (
                    <span
                      key={framework}
                      className="bg-purple-500/10 text-purple-400 px-3 py-1 rounded-full text-sm"
                    >
                      {framework}
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-zinc-500">
                    No frameworks detected.
                  </p>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">
                External Dependencies
              </h4>
              {analysis.externalDependencies.length > 0 ? (
                <div className="space-y-3">
                  {analysis.externalDependencies.map((dependency) => (
                    <div
                      key={dependency.name}
                      className="border border-white/10 rounded-lg p-4"
                    >
                      <h5 className="text-sm font-semibold text-white">
                        {dependency.name}
                      </h5>
                      {dependency.declaredIn.length > 0 && (
                        <p className="text-xs text-zinc-500 mt-2">
                          Declared in: {dependency.declaredIn.join(", ")}
                        </p>
                      )}
                      {dependency.usedBy.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs text-zinc-500">
                            Imported or used in:
                          </p>
                          {dependency.usedBy.map((usage) => (
                            <p
                              key={`${usage.file}-${usage.line}`}
                              className="text-xs text-zinc-400"
                            >
                              {usage.file} — Line {usage.line}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-500 mt-2">
                          No source imports detected.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">
                  No external dependencies detected.
                </p>
              )}
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">
                Important Configuration Files
              </h4>
              {analysis.importantFiles.length > 0 ? (
                <ul className="space-y-2">
                  {analysis.importantFiles.map((file) => (
                    <li key={file} className="text-sm text-zinc-400">
                      📄 {file}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">
                  No recognized configuration files found.
                </p>
              )}
            </div>

            <p className="text-xs text-zinc-500">
              Analysis completed. {analysis.totalFiles} files inspected.
            </p>
          </div>
        )}
      </div>
    ) : null;

  return (
    <main className="h-screen overflow-hidden bg-[#09090b] text-white flex [color-scheme:dark] [&_*]:[scrollbar-width:none] [&_*::-webkit-scrollbar]:hidden">
      {/* Left: logo, token meter, undo/redo, selected files drawer, workspace tree */}
      <Sidebar
        files={selectedFiles}
        contextFiles={contextFiles}
        engine={engine}
        onEngineChange={setEngine}
        onSelect={handleSelectFile}
        onToggleContext={handleToggleContext}
        onRemoveContextPath={handleRemoveContextPath}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndoContext}
        onRedo={handleRedoContext}
      />

      {/* Right of the sidebar */}
      <div className="relative flex-1 min-w-0 min-h-0 flex">
        <Header
          repoName={repoName}
          showAsk={showAsk}
          showProposalChat={showProposalChat}
          onToggleAsk={() => setShowAsk((value) => !value)}
          onToggleProposalChat={() =>
            setShowProposalChat((value) => !value)
          }
          splitView={splitView}
          hasProposal={proposal !== null}
          onToggleSplit={() => setSplitView((value) => !value)}
        />

        {/* Center: Main Screen (Dependencies before proposal; Proposal once called) + Ask Orien below */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {proposal === null && selectedFiles.length > 0 ? (
            <section className="flex-1 min-h-0 overflow-y-auto pt-20 px-6 pb-6">
              {dependenciesSection}
            </section>
          ) : (
            <ProposalPanel
              proposal={proposal}
              splitView={splitView}
              selectedFiles={selectedFiles}
            />
          )}

          <AskOrienPanel
            visible={showAsk}
            onClose={() => setShowAsk(false)}
          >
            <Workspace
              selectedFiles={selectedFiles}
              contextFiles={contextFiles}
              engine={engine}
              analysis={analysis}
              dependenciesSlot={proposal !== null ? dependenciesSection : null}
              onFilesSelected={handleFilesSelected}
              onAddFiles={handleAddFiles}
              activeFile={activeFile}
              filePreview={filePreview}
              previewFileName={previewFileName}
              onProposalChange={setProposal}
            />
          </AskOrienPanel>
        </div>

        {/* Right: proposal chat */}
        <ProposalChatPanel
          visible={showProposalChat}
          onClose={() => setShowProposalChat(false)}
        />
      </div>
    </main>
  );
}