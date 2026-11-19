"use client";

import type { ReactNode } from "react";

type AskOrienPanelProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
};

export default function AskOrienPanel({
  visible,
  onClose,
  children,
}: AskOrienPanelProps) {
  return (
    <section
      className={`${
        visible ? "flex" : "hidden"
      } h-[42%] min-h-[240px] shrink-0 flex-col border-t border-white/10 bg-[#09090b]`}
    >
      <div className="flex-1 min-h-0 overflow-auto p-6">
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={onClose}
            title="Minimize Ask Orien drawer to expand Proposal view"
            className="text-xs font-mono text-zinc-500 hover:text-white transition"
          >
            Minimize ✕
          </button>
        </div>
        {children}
      </div>
    </section>
  );
}