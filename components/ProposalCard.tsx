"use client";

import type { ProposedChange } from "@/lib/types";

type DiffLine = {
  type: "same" | "added" | "removed";
  text: string;
};

// Simple line-by-line diff (no external library needed)
function diffLines(original: string, proposed: string): DiffLine[] {
  const a = original ? original.split("\n") : [];
  const b = proposed ? proposed.split("\n") : [];

  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      result.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: "removed", text: a[i] });
      i++;
    } else {
      result.push({ type: "added", text: b[j] });
      j++;
    }
  }

  while (i < a.length) result.push({ type: "removed", text: a[i++] });
  while (j < b.length) result.push({ type: "added", text: b[j++] });

  return result;
}

const badgeStyles = {
  modify: "bg-yellow-500/10 text-yellow-400",
  create: "bg-emerald-500/10 text-emerald-400",
  delete: "bg-red-500/10 text-red-400",
};

export default function ProposalCard({ change }: { change: ProposedChange }) {
  const lines = diffLines(change.original_code, change.proposed_code);

  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white/[0.03]">
        <p className="text-sm font-medium text-white">{change.file}</p>

        <span
          className={`px-3 py-1 rounded-full text-xs font-medium ${badgeStyles[change.action]}`}
        >
          {change.action}
        </span>
      </div>

      {/* Reason */}
      <p className="px-4 py-3 text-sm text-zinc-400 border-t border-white/10">
        {change.reason}
      </p>

      {/* Diff */}
      <pre className="text-xs overflow-auto max-h-96 border-t border-white/10 py-2">
        {lines.map((line, index) => (
          <div
            key={index}
            className={
              line.type === "added"
                ? "bg-emerald-500/10 text-emerald-300 px-4"
                : line.type === "removed"
                ? "bg-red-500/10 text-red-300 px-4"
                : "text-zinc-400 px-4"
            }
          >
            {line.type === "added" ? "+ " : line.type === "removed" ? "- " : "  "}
            {line.text}
          </div>
        ))}
      </pre>

      {/* Status note */}
      <p className="px-4 py-2 text-xs text-zinc-500 border-t border-white/10">
        📝 Proposed only. Nothing has been applied to your files.
      </p>

    </div>
  );
}