"use client";

import PanelHeader from "@/components/PanelHeader";

type ProposalChatPanelProps = {
  visible: boolean;
  onClose: () => void;
};

export default function ProposalChatPanel({
  visible,
  onClose,
}: ProposalChatPanelProps) {
  return (
    <aside
      className={`${
        visible ? "flex" : "hidden"
      } w-[300px] shrink-0 flex-col min-h-0 border-l border-white/10 pt-16`}
    >

      <PanelHeader
        title="Proposal chat"
        description="Ask about fixes and why they were made"
        onClose={onClose}
      />

      {/* Messages */}

      <div className="flex-1 min-h-0 overflow-auto p-5">
        <p className="text-sm text-zinc-300">
          No messages yet
        </p>

        <p className="text-xs text-zinc-500 mt-2">
          Once a proposal is ready, you can ask Orien why it made each change.
          This chat is coming in a later step.
        </p>
      </div>

      {/* Input */}

      <div className="shrink-0 p-4 border-t border-white/10 flex gap-2">
        <input
          disabled
          placeholder="Ask about this proposal..."
          className="flex-1 bg-transparent border border-white/10 rounded-lg px-4 py-2 text-sm outline-none opacity-50 cursor-not-allowed"
        />

        <button
          type="button"
          disabled
          className="bg-blue-600 px-4 py-2 rounded-lg text-sm opacity-40 cursor-not-allowed"
        >
          Send
        </button>
      </div>

    </aside>
  );
}