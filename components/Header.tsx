"use client";

type HeaderProps = {
  repoName: string;
  showAsk: boolean;
  showProposalChat: boolean;
  onToggleAsk: () => void;
  onToggleProposalChat: () => void;
  splitView: boolean;
  hasProposal: boolean;
  onToggleSplit: () => void;
};

// Shared look for every floating container.
const pill =
  "pointer-events-auto rounded-full border border-white/10 bg-[#0c0c0f]/70 backdrop-blur-xl shadow-lg shadow-black/30";

function PanelToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={active ? `Hide ${label}` : `Show ${label}`}
      className={`px-3.5 py-1.5 rounded-full text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
        active
          ? "bg-white/10 text-white"
          : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
      }`}
    >
      {label}
    </button>
  );
}

// Green and red are still placeholders. They get wired up in a later step.

const placeholderControls = [
  {
    label: "Add another file (coming soon)",
    color: "bg-emerald-500",
  },
  {
    label: "Reset everything (coming soon)",
    color: "bg-red-500",
  },
];

export default function Header({
  repoName,
  showAsk,
  showProposalChat,
  onToggleAsk,
  onToggleProposalChat,
  splitView,
  hasProposal,
  onToggleSplit,
}: HeaderProps) {
  return (
    <header className="absolute top-0 inset-x-0 z-30 pointer-events-none">

      {/* Soft fade so scrolling content melts away under the pills */}

      <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#09090b] via-[#09090b]/70 to-transparent" />

      <div className="relative px-4 pt-3 flex items-center justify-between gap-3">

        {/* Breadcrumb */}

        <div className={`${pill} px-4 py-2 min-w-0`}>
          <p className="text-sm text-zinc-500 truncate">
            Workspace
            {repoName && (
              <>
                <span className="mx-2 text-zinc-700">/</span>
                <span className="text-zinc-200">{repoName}</span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">

          {/* Panel toggles */}

          <div className={`${pill} p-1 flex items-center gap-1`}>
            <PanelToggle
              label="Ask Orien"
              active={showAsk}
              onClick={onToggleAsk}
            />

            <PanelToggle
              label="Proposal chat"
              active={showProposalChat}
              onClick={onToggleProposalChat}
            />
          </div>

          {/* Fixed circles */}

          <div className={`${pill} px-3.5 py-2.5 flex items-center gap-2.5`}>

            {/* White: split view */}

            <button
              type="button"
              onClick={onToggleSplit}
              disabled={!hasProposal}
              aria-pressed={splitView}
              aria-label="Split view: original and proposed"
              title={
                !hasProposal
                  ? "Split view (available once a proposal exists)"
                  : splitView
                  ? "Back to proposal cards"
                  : "Split view: original and proposed"
              }
              className={`w-4 h-4 rounded-full bg-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 ${
                !hasProposal
                  ? "opacity-40 cursor-not-allowed"
                  : splitView
                  ? "ring-2 ring-blue-500"
                  : "hover:scale-110"
              }`}
            />

            {/* Green and red: coming soon */}

            {placeholderControls.map((control) => (
              <button
                key={control.label}
                type="button"
                disabled
                title={control.label}
                aria-label={control.label}
                className={`w-4 h-4 rounded-full opacity-40 cursor-not-allowed ${control.color}`}
              />
            ))}

          </div>

        </div>

      </div>

    </header>
  );
}