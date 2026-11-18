"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DependencyGraphData } from "@/lib/repositoryAnalyzer";

type Props = {
  graph: DependencyGraphData;
  activeFilePath?: string;
  contextFilePaths?: string[];
  onAddPathsToContext?: (paths: string[]) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
};

export default function DependencyGraph({
  graph,
  activeFilePath,
  contextFilePaths = [],
  onAddPathsToContext,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}: Props) {
  const [selectedFileId, setSelectedFileId] = useState<string>(() => {
    const latestChecked = contextFilePaths.at(-1);
    return (
      (latestChecked &&
        graph.nodes.some((n) => n.id === latestChecked) &&
        latestChecked) ||
      activeFilePath ||
      graph.nodes.find((n) => n.importDetails.length > 0)?.id ||
      graph.nodes[0]?.id ||
      ""
    );
  });

  const [includeExternal, setIncludeExternal] = useState(false);
  const [notice, setNotice] = useState("");

  const prevPreviewRef = useRef<string | undefined>(activeFilePath);
  const prevCheckedRef = useRef<string[]>(contextFilePaths);

  useEffect(() => {
    if (
      activeFilePath &&
      activeFilePath !== prevPreviewRef.current &&
      graph.nodes.some((node) => node.id === activeFilePath)
    ) {
      setSelectedFileId(activeFilePath);
    }
    prevPreviewRef.current = activeFilePath;
  }, [activeFilePath, graph.nodes]);

  useEffect(() => {
    const prevSet = new Set(prevCheckedRef.current);
    const newlyChecked = contextFilePaths.find((path) => !prevSet.has(path));

    if (
      newlyChecked &&
      graph.nodes.some((node) => node.id === newlyChecked)
    ) {
      setSelectedFileId(newlyChecked);
    } else if (
      contextFilePaths.length > 0 &&
      !contextFilePaths.includes(selectedFileId)
    ) {
      const fallbackChecked = [...contextFilePaths]
        .reverse()
        .find((path) => graph.nodes.some((node) => node.id === path));
      if (fallbackChecked) {
        setSelectedFileId(fallbackChecked);
      }
    }

    prevCheckedRef.current = contextFilePaths;
  }, [contextFilePaths, graph.nodes, selectedFileId]);

  const activeNode = useMemo(
    () =>
      graph.nodes.find((node) => node.id === selectedFileId) ??
      graph.nodes[0] ??
      null,
    [graph.nodes, selectedFileId]
  );

  const importedItems = useMemo(() => {
    if (!activeNode) return [];

    const items: Array<{
      id: string;
      symbolName: string;
      fromModule: string;
      resolvedPath: string | null;
      isExternal: boolean;
      line: number;
    }> = [];

    for (const detail of activeNode.importDetails) {
      if (!includeExternal && detail.resolvedPath === null) {
        continue;
      }

      for (const name of detail.importedNames) {
        items.push({
          id: `${detail.line}-${detail.moduleName}-${name}`,
          symbolName: name,
          fromModule: detail.moduleName,
          resolvedPath: detail.resolvedPath,
          isExternal: detail.isExternal,
          line: detail.line,
        });
      }
    }

    return items;
  }, [activeNode, includeExternal]);

  function handleAddAllInternalToContext() {
    if (!activeNode || !onAddPathsToContext) return;
    const internalPaths = Array.from(
      new Set([activeNode.id, ...activeNode.imports])
    );
    onAddPathsToContext(internalPaths);
    setNotice(
      `Added ${activeNode.label} + ${activeNode.imports.length} imported ${
        activeNode.imports.length === 1 ? "file" : "files"
      } to AI context.`
    );
    setTimeout(() => setNotice(""), 3000);
  }

  function handleAddSingleFile(path: string, label: string) {
    if (!onAddPathsToContext) return;
    onAddPathsToContext([path]);
    setNotice(`Added ${label} to AI context.`);
    setTimeout(() => setNotice(""), 2500);
  }

  if (!activeNode) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#09090c] p-8 text-center">
        <p className="text-sm font-medium text-zinc-400">
          No dependencies detected
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Row 1: Full-Width File Selector */}
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-xs text-zinc-400 shrink-0">Selected File:</span>
        <select
          value={activeNode.id}
          onChange={(e) => setSelectedFileId(e.target.value)}
          className="flex-1 min-w-0 truncate bg-[#121216] border border-white/15 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none focus:border-blue-500"
        >
          {graph.nodes.map((node) => (
            <option key={node.id} value={node.id}>
              {node.id}
            </option>
          ))}
        </select>
      </div>

      {/* Row 2: Filter + Load + Undo/Redo Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeExternal}
            onChange={(e) => setIncludeExternal(e.target.checked)}
            className="accent-blue-500 rounded"
          />
          Show external &amp; stdlib imports
        </label>

        <div className="flex items-center gap-2">
          {onUndo && (
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo context change"
              className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed transition"
            >
              ↩ Undo
            </button>
          )}
          {onRedo && (
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo context change"
              className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed transition"
            >
              ↪ Redo
            </button>
          )}
          {onAddPathsToContext && activeNode.imports.length > 0 && (
            <button
              type="button"
              onClick={handleAddAllInternalToContext}
              className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-medium transition"
            >
              + Load File &amp; All Imports ({activeNode.imports.length})
            </button>
          )}
        </div>
      </div>

      {notice && <p className="text-xs text-emerald-400">{notice}</p>}

      {/* Clean Visual Flow: [Source File Name] ---> [Imported "This" Name] (No clutter path below!) */}
      <div className="rounded-xl border border-white/10 bg-[#09090c] p-5">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(190px,240px)_40px_1fr] items-center gap-4">
          {/* Left Node: Source File Name Only */}
          <div className="rounded-xl border border-blue-400/40 bg-blue-600/15 px-4 py-3.5 shadow-sm">
            <span className="inline-block text-[10px] font-semibold uppercase tracking-wider text-blue-300 mb-1">
              Source File
            </span>
            <p
              className="text-sm font-mono font-bold text-white truncate"
              title={activeNode.id}
            >
              {activeNode.label}
            </p>
          </div>

          {/* Center Connector Arrow */}
          <div className="flex items-center justify-center text-zinc-500">
            <svg
              className="w-7 h-7 rotate-90 lg:rotate-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke={importedItems.length > 0 ? "#34d399" : "#52525b"}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="12" x2="19" y2="12" />
              <polyline points="14 7 19 12 14 17" />
            </svg>
          </div>

          {/* Right Nodes: Clean Symbol Names Only (No Extra Path Line Below) */}
          {importedItems.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {importedItems.map((item) => {
                const isInternal = Boolean(item.resolvedPath);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition ${
                      isInternal
                        ? "border-emerald-500/30 bg-emerald-500/[0.07] hover:border-emerald-400/60"
                        : "border-white/10 bg-white/[0.03]"
                    }`}
                  >
                    <div
                      onClick={() => {
                        if (item.resolvedPath) {
                          setSelectedFileId(item.resolvedPath);
                        }
                      }}
                      title={
                        item.resolvedPath
                          ? `From ${item.resolvedPath} (Line ${item.line})`
                          : `From ${item.fromModule} (Line ${item.line})`
                      }
                      className={`min-w-0 flex-1 flex items-center gap-2 ${
                        isInternal ? "cursor-pointer" : ""
                      }`}
                    >
                      <span
                        className={`text-xs font-mono font-bold truncate ${
                          isInternal ? "text-emerald-300" : "text-zinc-200"
                        }`}
                      >
                        {item.symbolName}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                        L{item.line}
                      </span>
                    </div>

                    {item.resolvedPath && onAddPathsToContext && (
                      <button
                        type="button"
                        onClick={() =>
                          handleAddSingleFile(
                            item.resolvedPath!,
                            item.resolvedPath!.split("/").pop() || item.symbolName
                          )
                        }
                        title={`Add ${item.resolvedPath} to AI context`}
                        className="shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/30 transition"
                      >
                        + Context
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.015] px-4 py-5 text-center">
              <p className="text-xs font-mono font-medium text-zinc-400">
                No dependencies detected
              </p>
              <p className="text-[11px] text-zinc-600 mt-1">
                {activeNode.label} has no{" "}
                {includeExternal ? "internal or external" : "internal"} imports.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}