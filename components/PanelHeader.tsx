"use client";

type PanelHeaderProps = {
  title: string;
  description: string;
  onClose: () => void;
  // When omitted, the clear button is shown but disabled.
  onClear?: () => void;
};

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2 2l10 10M12 2L2 12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NewChatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M6 2.5H3.5A1.5 1.5 0 0 0 2 4v6.5A1.5 1.5 0 0 0 3.5 12H10a1.5 1.5 0 0 0 1.5-1.5V8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M10.2 1.8a1.2 1.2 0 0 1 1.7 1.7L7 8.4 5 9l.6-2 4.6-5.2z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const buttonBase =
  "w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60";

export default function PanelHeader({
  title,
  description,
  onClose,
  onClear,
}: PanelHeaderProps) {
  return (
    <div className="h-14 shrink-0 px-5 flex items-center justify-between border-b border-white/10 bg-[#0c0c0f]">

      <div className="min-w-0">
        <h3 className="text-sm font-semibold truncate">
          {title}
        </h3>

        <p className="text-xs text-zinc-500 truncate">
          {description}
        </p>
      </div>

      <div className="flex items-center gap-1">

        <button
          type="button"
          onClick={onClear}
          disabled={!onClear}
          title={
            onClear
              ? "Clear memory and start a new chat"
              : "Clear memory and start a new chat (coming soon)"
          }
          aria-label="Clear memory and start a new chat"
          className={`${buttonBase} ${
            onClear
              ? "hover:bg-white/10 hover:text-white"
              : "opacity-40 cursor-not-allowed"
          }`}
        >
          <NewChatIcon />
        </button>

        <button
          type="button"
          onClick={onClose}
          title={`Hide ${title}`}
          aria-label={`Hide ${title}`}
          className={`${buttonBase} hover:bg-white/10 hover:text-white`}
        >
          <CloseIcon />
        </button>

      </div>

    </div>
  );
}