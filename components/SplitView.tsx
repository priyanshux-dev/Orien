"use client";

import { useEffect, useMemo, useState } from "react";
import { diffLines } from "@/lib/diff";
import type { ProposedChange } from "@/lib/types";

type SplitViewProps = {
  change: ProposedChange;
  selectedFiles: File[];
};

type OriginalState = {
  text: string;
  source: "loading" | "file" | "ai" | "none";
};

const CONTEXT_LINES = 3;

const badgeStyles = {
  modify: "bg-yellow-500/10 text-yellow-400",
  create: "bg-emerald-500/10 text-emerald-400",
  delete: "bg-red-500/10 text-red-400",
};

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

// Find the real uploaded file that matches the path the AI gave us.
function findUploadedFile(files: File[], path: string): File | null {
  const target = normalizePath(path);

  const exact = files.find(
    (file) =>
      normalizePath(file.webkitRelativePath || file.name) === target
  );

  if (exact) return exact;

  const partial = files.filter((file) => {
    const candidate = normalizePath(file.webkitRelativePath || file.name);

    return (
      candidate.endsWith("/" + target) ||
      target.endsWith("/" + candidate)
    );
  });

  return partial.length === 1 ? partial[0] : null;
}

// Windows files use \r\n and AI answers use \n. Make them match for display.
function normalizeText(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\n+$/, "");
}

export default function SplitView({
  change,
  selectedFiles,
}: SplitViewProps) {
  const [original, setOriginal] = useState<OriginalState>({
    text: "",
    source: "loading",
  });

  const [showAll, setShowAll] = useState(false);

  // Load the original from the real uploaded file.

  useEffect(() => {
    let cancelled = false;

    if (change.action === "create") {
      setOriginal({ text: "", source: "none" });
      return;
    }

    const file = findUploadedFile(selectedFiles, change.file);

    if (!file) {
      setOriginal({ text: change.original_code, source: "ai" });
      return;
    }

    setOriginal({ text: "", source: "loading" });

    file
      .text()
      .then((text) => {
        if (!cancelled) setOriginal({ text, source: "file" });
      })
      .catch(() => {
        if (!cancelled) {
          setOriginal({ text: change.original_code, source: "ai" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [change, selectedFiles]);

  // Compare the two versions.

  const rows = useMemo(() => {
    if (original.source === "loading") return [];

    const diff = diffLines(
      normalizeText(original.text),
      normalizeText(change.proposed_code)
    );

    let left = 0;
    let right = 0;

    return diff.map((row) => {
      if (row.type === "same") {
        left++;
        right++;
        return { ...row, left, right };
      }

      if (row.type === "removed") {
        left++;
        return { ...row, left, right: 0 };
      }

      right++;
      return { ...row, left: 0, right };
    });
  }, [original, change.proposed_code]);

  const hasChanges = rows.some((row) => row.type !== "same");

  // Decide which rows to show (changes plus a few lines of context).

  const visible = rows.map(() => showAll);

  if (!showAll) {
    rows.forEach((row, index) => {
      if (row.type === "same") return;

      const start = Math.max(0, index - CONTEXT_LINES);
      const end = Math.min(rows.length - 1, index + CONTEXT_LINES);

      for (let i = start; i <= end; i++) {
        visible[i] = true;
      }
    });
  }

  // Build the list of things to draw (rows and "unchanged lines" gaps).

  const items: Array<
    | { kind: "row"; index: number }
    | { kind: "gap"; count: number; key: string }
  > = [];

  let hidden = 0;

  rows.forEach((_, index) => {
    if (visible[index]) {
      if (hidden > 0) {
        items.push({ kind: "gap", count: hidden, key: `gap-${index}` });
        hidden = 0;
      }

      items.push({ kind: "row", index });
    } else {
      hidden++;
    }
  });

  if (hidden > 0 && hasChanges) {
    items.push({ kind: "gap", count: hidden, key: "gap-end" });
  }

  const sourceNote =
    original.source === "file"
      ? "Original: your uploaded file"
      : original.source === "ai"
      ? "Original: copy from the AI (file not found in your upload)"
      : original.source === "none"
      ? "New file"
      : "Loading original...";

  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">

      {/* Header */}

      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-white/[0.03]">

        <div className="flex items-center gap-3 min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {change.file}
          </p>

          <span
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium ${badgeStyles[change.action]}`}
          >
            {change.action}
          </span>
        </div>

        {hasChanges && (
          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            className="shrink-0 text-xs text-zinc-400 hover:text-white border border-white/10 rounded-full px-3 py-1 transition"
          >
            {showAll ? "Show changes only" : "Show full file"}
          </button>
        )}

      </div>

      {/* Reason */}

      <p className="px-4 py-3 text-sm text-zinc-400 border-t border-white/10">
        {change.reason}
      </p>

      {/* Column titles */}

      <div className="grid grid-cols-2 border-t border-white/10 text-xs text-zinc-500 divide-x divide-white/10">
        <p className="px-4 py-2">{sourceNote}</p>
        <p className="px-4 py-2">Proposed by Orien</p>
      </div>

      {/* Diff */}

      <div className="border-t border-white/10 font-mono text-xs leading-5">

        {original.source === "loading" && (
          <p className="px-4 py-6 text-zinc-500">Loading...</p>
        )}

        {original.source !== "loading" && !hasChanges && (
          <p className="px-4 py-6 text-zinc-500">
            No differences between the original and the proposal.
          </p>
        )}

        {original.source !== "loading" && hasChanges && (
          <div className="grid grid-cols-2">

            {items.map((item) => {
              if (item.kind === "gap") {
                return (
                  <div
                    key={item.key}
                    className="col-span-2 px-4 py-1 text-zinc-600 bg-white/[0.02] text-center"
                  >
                    {item.count} unchanged{" "}
                    {item.count === 1 ? "line" : "lines"}
                  </div>
                );
              }

              const row = rows[item.index];

              const leftStyle =
                row.type === "removed"
                  ? "bg-red-500/10 text-red-300"
                  : row.type === "added"
                  ? "bg-white/[0.02]"
                  : "text-zinc-400";

              const rightStyle =
                row.type === "added"
                  ? "bg-emerald-500/10 text-emerald-300"
                  : row.type === "removed"
                  ? "bg-white/[0.02]"
                  : "text-zinc-400";

              return (
                <div key={`row-${item.index}`} className="contents">

                  <div className={`flex min-w-0 ${leftStyle}`}>
                    <span className="w-10 shrink-0 text-right pr-3 text-zinc-600 select-none">
                      {row.left || ""}
                    </span>

                    <span className="flex-1 min-w-0 whitespace-pre-wrap break-all pr-3">
                      {row.type === "added" ? "" : row.text}
                    </span>
                  </div>

                  <div className={`flex min-w-0 border-l border-white/10 ${rightStyle}`}>
                    <span className="w-10 shrink-0 text-right pr-3 text-zinc-600 select-none">
                      {row.right || ""}
                    </span>

                    <span className="flex-1 min-w-0 whitespace-pre-wrap break-all pr-3">
                      {row.type === "removed" ? "" : row.text}
                    </span>
                  </div>

                </div>
              );
            })}

          </div>
        )}

      </div>

      {/* Status note */}

      <p className="px-4 py-2 text-xs text-zinc-500 border-t border-white/10">
        📝 Proposed only. Nothing has been applied to your files.
      </p>

    </div>
  );
}