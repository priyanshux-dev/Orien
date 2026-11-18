"use client";

import { useMemo, useState } from "react";
import {
  estimateFileTokens,
  formatCompactTokens,
  getContextStatus,
  getFilePath,
} from "@/lib/context";

type TreeNode = {
  name: string;
  path: string;
  children: TreeNode[];
  file?: File;
};

type Props = {
  files: File[];
  contextFiles: File[];
  selectedCount: number;
  remainingGatewayTokens: number;
  onSelect: (file: File) => void;
  onToggleContext: (file: File) => void;
};

export default function FileExplorer({
  files,
  contextFiles,
  selectedCount,
  remainingGatewayTokens,
  onSelect,
  onToggleContext,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set([""]));
  const selected = useMemo(
    () => new Set(contextFiles.map(getFilePath)),
    [contextFiles]
  );

  const root: TreeNode = { name: "root", path: "", children: [] };
  for (const file of files) {
    const parts = getFilePath(file).split(/[\\/]+/).filter(Boolean);
    let current = root;
    parts.forEach((part, index) => {
      let node = current.children.find((child) => child.name === part);
      if (!node) {
        node = { name: part, path: parts.slice(0, index + 1).join("/"), children: [] };
        current.children.push(node);
      }
      if (index === parts.length - 1) node.file = file;
      current = node;
    });
  }

  function toggleFolder(path: string) {
    setExpanded((old) => {
      const next = new Set(old);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function render(nodes: TreeNode[], depth = 0): React.ReactNode {
    return nodes.map((node) => {
      const file = node.file;
      const isExpanded = expanded.has(node.path);
      const status = file ? getContextStatus(file) : null;
      const checked = file ? selected.has(getFilePath(file)) : false;
      const fileTokens = file && status === "ok" ? estimateFileTokens(file) : 0;

      // Only lock unchecked files if adding them would exceed CoArena's 115k input limit.
      const exceedsGateway =
        !checked &&
        status === "ok" &&
        selectedCount > 0 &&
        fileTokens > remainingGatewayTokens;

      const isDisabled = status !== "ok" || exceedsGateway;

      return (
        <div key={node.path}>
          <div
            className="flex items-center gap-1 rounded-lg pr-2 hover:bg-white/5"
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
          >
            {file ? (
              <>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={isDisabled}
                  title={
                    status === "ignored"
                      ? "Excluded for safety or unsupported file type"
                      : status === "too_large"
                      ? "File is too large for AI context"
                      : exceedsGateway
                      ? `Adding this (~${fileTokens.toLocaleString()} tokens) exceeds the 115k gateway safety limit`
                      : `Include in AI context (~${fileTokens.toLocaleString()} tokens)`
                  }
                  onChange={() => onToggleContext(file)}
                  className="accent-blue-500 disabled:opacity-40"
                />
                <button
                  type="button"
                  onClick={() => onSelect(file)}
                  className="flex-1 min-w-0 flex items-center gap-2 py-2 text-left text-sm text-zinc-400"
                >
                  <span>📄</span>
                  <span className="truncate">{node.name}</span>
                </button>
                {status === "ok" ? (
                  <span
                    className={`shrink-0 font-mono text-[10px] ${
                      checked
                        ? "text-blue-400"
                        : exceedsGateway
                        ? "text-zinc-700"
                        : "text-zinc-600"
                    }`}
                  >
                    {formatCompactTokens(fileTokens)}t
                  </span>
                ) : (
                  <span className="shrink-0 text-[10px] text-zinc-600">
                    {status === "ignored" ? "excluded" : "large"}
                  </span>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => toggleFolder(node.path)}
                className="w-full flex items-center gap-2 py-2 text-left text-sm text-zinc-400"
              >
                <span>{isExpanded ? "📂" : "📁"}</span>
                <span>{node.name}</span>
              </button>
            )}
          </div>
          {!file && isExpanded && <div>{render(node.children, depth + 1)}</div>}
        </div>
      );
    });
  }

  return <div className="w-full">{render(root.children)}</div>;
}