"use client";

import type { ReactNode } from "react";
import PanelHeader from "@/components/PanelHeader";

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
  // The panel is hidden with CSS instead of being removed,
  // so the uploaded repository, analysis, and task text are not lost.

  return (
    <section
      className={`${
        visible ? "flex" : "hidden"
      } h-[45%] min-h-[280px] shrink-0 flex-col border-t border-white/10`}
    >

      <PanelHeader
        title="Ask Orien"
        description="Questions about your repository"
        onClose={onClose}
      />

      <div className="flex-1 min-h-0 overflow-auto">
        {children}
      </div>

    </section>
  );
}