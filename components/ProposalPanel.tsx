"use client";

import { useEffect, useState } from "react";
import ProposalCard from "@/components/ProposalCard";
import SplitView from "@/components/SplitView";
import type { EditProposal } from "@/lib/types";

type ProposalPanelProps = {
  proposal: EditProposal | null;
  splitView: boolean;
  selectedFiles: File[];
};

const dotStyles = {
  modify: "bg-yellow-400",
  create: "bg-emerald-400",
  delete: "bg-red-400",
};

export default function ProposalPanel({
  proposal,
  splitView,
  selectedFiles,
}: ProposalPanelProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  // Start at the first file whenever a new proposal arrives.

  useEffect(() => {
    setActiveIndex(0);
  }, [proposal]);

  const showSplit =
    splitView && proposal !== null && proposal.changes.length > 0;

  const safeIndex = proposal
    ? Math.min(activeIndex, Math.max(proposal.changes.length - 1, 0))
    : 0;

  return (
    <section className="flex-1 min-h-0 overflow-auto px-6 pt-[72px] pb-6">

      <div className={showSplit ? "" : "max-w-5xl"}>

        {/* Title (scrolls with the content) */}

        <div className="flex items-start justify-between gap-4 mb-5">

          <div className="min-w-0">
            <h2 className="text-lg font-semibold">
              Proposal
            </h2>

            <p className="text-sm text-zinc-500 mt-1">
              {showSplit
                ? "Split view: original on the left, proposed on the right."
                : "Review every change before anything is applied."}
            </p>
          </div>

          {proposal && (
            <span className="shrink-0 text-xs text-zinc-400 border border-white/10 rounded-full px-3 py-1">
              {proposal.changes.length}{" "}
              {proposal.changes.length === 1 ? "change" : "changes"}
            </span>
          )}

        </div>

        {/* Empty state */}

        {!proposal && (
          <div className="min-h-48 border border-dashed border-zinc-800 rounded-2xl flex flex-col items-center justify-center text-center px-6 py-10">
            <p className="text-sm text-zinc-300">
              No proposal yet
            </p>

            <p className="text-xs text-zinc-500 mt-2 max-w-sm">
              Upload a repository, describe a change in Ask Orien, and
              select Propose Edit. Orien&apos;s proposal will appear here.
            </p>
          </div>
        )}

        {/* Proposal */}

        {proposal && (
          <div className="space-y-4">

            <div className="border border-white/10 rounded-xl p-5 bg-white/[0.02]">
              <p className="text-sm text-zinc-300">
                {proposal.summary}
              </p>
            </div>

            {proposal.changes.length === 0 && (
              <p className="text-sm text-zinc-500">
                Orien did not propose any changes for this task.
              </p>
            )}

            {/* Split view: tab bar + side by side */}

            {showSplit && (
              <>
                <div className="flex items-center gap-2 overflow-x-auto">
                  {proposal.changes.map((change, index) => {
                    const name =
                      change.file.split("/").pop() || change.file;

                    return (
                      <button
                        key={`${change.action}-${change.file}`}
                        type="button"
                        onClick={() => setActiveIndex(index)}
                        title={change.file}
                        aria-pressed={index === safeIndex}
                        className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                          index === safeIndex
                            ? "bg-white/10 border-white/20 text-white"
                            : "border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${dotStyles[change.action]}`}
                        />
                        {name}
                      </button>
                    );
                  })}
                </div>

                <SplitView
                  key={`${proposal.changes[safeIndex].action}-${proposal.changes[safeIndex].file}`}
                  change={proposal.changes[safeIndex]}
                  selectedFiles={selectedFiles}
                />
              </>
            )}

            {/* Card view: all changes in a list */}

            {!showSplit &&
              proposal.changes.map((change) => (
                <ProposalCard
                  key={`${change.action}-${change.file}`}
                  change={change}
                />
              ))}

          </div>
        )}

      </div>

    </section>
  );
}