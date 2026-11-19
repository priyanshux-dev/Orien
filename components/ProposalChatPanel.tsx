"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { EditProposal } from "@/lib/types";
import { API_BASE_URL, getOrienHeaders } from "@/lib/api";

export type ProposalChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ProposalChatPanelProps = {
  visible: boolean;
  onClose: () => void;
  proposal: EditProposal | null;
  messages: ProposalChatMessage[];
  onMessagesChange: React.Dispatch<React.SetStateAction<ProposalChatMessage[]>>;
  autoAuditTrigger: number;
  onAuditCompleted: () => void;
};

const QUICK_PROMPTS = [
  "Verify if this is a genuine bug or a false positive",
  "Check for edge cases or breaking regressions",
  "How should I test this fix with pytest?",
];

const SAFETY_AUDIT_PROMPT =
  "Perform a strict safety & validity audit on this proposed change: " +
  "(1) Is this a real bug or an intentional design / false positive? " +
  "(2) Could this patch introduce regressions, type errors, or break callers? " +
  "(3) State clearly whether it is SAFE TO OPEN A GITHUB ISSUE/PR or UNSAFE/BLOCKED.";

function renderInlineMarkdown(text: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={idx}
          className="rounded bg-black/50 border border-white/10 px-1.5 py-0.5 font-mono text-[11px] text-blue-300"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function FormattedMessageBody({ content }: { content: string }) {
  const blocks = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2 text-xs leading-relaxed text-zinc-200">
      {blocks.map((block, blockIdx) => {
        if (block.startsWith("```") && block.endsWith("```")) {
          const lines = block.slice(3, -3).split("\n");
          const firstLine = lines[0]?.trim() || "";
          const hasLang = /^[a-zA-Z0-9_-]+$/.test(firstLine);
          const codeBody = (hasLang ? lines.slice(1) : lines).join("\n").trim();

          return (
            <pre
              key={blockIdx}
              className="rounded-lg border border-white/10 bg-black/60 p-2.5 font-mono text-[11px] text-emerald-200 overflow-x-auto whitespace-pre"
            >
              {codeBody}
            </pre>
          );
        }

        const lines = block.split("\n");
        return (
          <div key={blockIdx} className="space-y-1.5">
            {lines.map((rawLine, lineIdx) => {
              const line = rawLine.trim();
              if (!line) return null;

              if (line.startsWith("### ")) {
                return (
                  <h4
                    key={lineIdx}
                    className="pt-1 text-xs font-semibold text-blue-300 tracking-tight"
                  >
                    {renderInlineMarkdown(line.slice(4))}
                  </h4>
                );
              }

              if (line.startsWith("## ")) {
                return (
                  <h3
                    key={lineIdx}
                    className="pt-1 text-[13px] font-bold text-white tracking-tight"
                  >
                    {renderInlineMarkdown(line.slice(3))}
                  </h3>
                );
              }

              if (/^[-*•]\s+/.test(line)) {
                return (
                  <div key={lineIdx} className="flex items-start gap-2 pl-1">
                    <span className="text-blue-400 mt-0.5">•</span>
                    <span className="flex-1">
                      {renderInlineMarkdown(line.replace(/^[-*•]\s+/, ""))}
                    </span>
                  </div>
                );
              }

              const numMatch = line.match(/^(\d+\.)\s+(.*)$/);
              if (numMatch) {
                return (
                  <div key={lineIdx} className="flex items-start gap-2 pl-0.5">
                    <span className="font-mono text-[11px] font-semibold text-blue-400 shrink-0">
                      {numMatch[1]}
                    </span>
                    <span className="flex-1">
                      {renderInlineMarkdown(numMatch[2])}
                    </span>
                  </div>
                );
              }

              return <p key={lineIdx}>{renderInlineMarkdown(line)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

export default function ProposalChatPanel({
  visible,
  onClose,
  proposal,
  messages,
  onMessagesChange,
  autoAuditTrigger,
  onAuditCompleted,
}: ProposalChatPanelProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [auditCompletedLocal, setAuditCompletedLocal] = useState(false);
  const lastHandledTrigger = useRef(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setInput("");
    setErrorMessage("");
    setAuditCompletedLocal(false);
    lastHandledTrigger.current = 0;
  }, [proposal]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  function buildProposalContext(): string {
    if (!proposal) return "";

    const diffSummary = proposal.changes
      .map(
        (change, i) =>
          `CHANGE ${i + 1}: [${change.action.toUpperCase()}] ${change.file}\n` +
          `REASON: ${change.reason || "N/A"}\n` +
          `ORIGINAL:\n${change.original_code || "(none)"}\n` +
          `PROPOSED:\n${change.proposed_code || "(none)"}`
      )
      .join("\n\n---\n\n");

    return `PROPOSAL SUMMARY:\n${proposal.summary}\n\nPROPOSED CHANGES:\n${diffSummary}`;
  }

  async function sendChatMessage(promptText: string, isSafetyGate = false) {
    const trimmed = promptText.trim();
    if (!trimmed || !proposal || isLoading) return;

    const userMsg: ProposalChatMessage = {
      id: `${Date.now()}-u`,
      role: "user",
      content: isSafetyGate
        ? "🛡️ Run Mandatory Bug & Regression Safety Audit"
        : trimmed,
    };

    const priorHistory = messages.slice(-10);
    onMessagesChange([...messages, userMsg]);
    setInput("");
    setErrorMessage("");
    setIsLoading(true);

    try {
      const priorTranscript = priorHistory
        .map(
          (m) => `${m.role === "user" ? "DEVELOPER" : "ORIEN"}: ${m.content}`
        )
        .join("\n\n");

      const fullContext = priorTranscript
        ? `${buildProposalContext()}\n\nPRIOR PROPOSAL REVIEW CONVERSATION:\n${priorTranscript}`
        : buildProposalContext();

      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: "POST",
        headers: getOrienHeaders(),
        body: JSON.stringify({
          message: trimmed,
          repository_context: fullContext,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Proposal chat request failed.");
      }

      const assistantMsg: ProposalChatMessage = {
        id: `${Date.now()}-a`,
        role: "assistant",
        content: data.answer,
      };

      onMessagesChange((prev) => [...prev, assistantMsg]);

      if (isSafetyGate || trimmed === SAFETY_AUDIT_PROMPT) {
        setAuditCompletedLocal(true);
        onAuditCompleted();
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not reach Orien backend."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (
      autoAuditTrigger > 0 &&
      autoAuditTrigger !== lastHandledTrigger.current &&
      proposal &&
      !isLoading
    ) {
      lastHandledTrigger.current = autoAuditTrigger;
      void sendChatMessage(SAFETY_AUDIT_PROMPT, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAuditTrigger, proposal, isLoading]);

  if (!visible) return null;

  return (
    <aside className="w-80 xl:w-[400px] shrink-0 border-l border-white/10 bg-gradient-to-b from-[#0d0d12] to-[#09090b] flex flex-col min-h-0 pt-14">
      {/* Studio Header */}
      <div className="px-4 py-3.5 border-b border-white/10 bg-white/[0.015] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-7 w-7 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-xs shrink-0">
            🛡️
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold tracking-wide text-white">
                Proposal Chat
              </h3>
              {proposal && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-mono border ${
                    auditCompletedLocal
                      ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-300"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                  }`}
                >
                  {auditCompletedLocal ? "✓ Audited" : "Gate 1"}
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 truncate">
              Skeptical diff review &amp; safety gate
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => onMessagesChange([])}
              className="rounded-md px-2 py-1 text-[11px] text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            title="Close Proposal Chat"
            className="rounded-md px-1.5 py-1 text-zinc-500 hover:text-white hover:bg-white/5 text-xs transition"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Scrollable Chat Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {!proposal ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-5 text-center space-y-2 mt-4">
            <div className="mx-auto h-9 w-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-sm">
              🔍
            </div>
            <p className="text-xs font-medium text-zinc-200">
              No active proposal yet
            </p>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Generate an edit proposal first to audit diffs, check edge cases,
              and unlock GitHub Issue &amp; PR drafting.
            </p>
          </div>
        ) : (
          <>
            {/* Primary Safety Gate Card */}
            <button
              type="button"
              onClick={() => sendChatMessage(SAFETY_AUDIT_PROMPT, true)}
              disabled={isLoading}
              className={`w-full rounded-xl border p-3 text-left transition flex items-center justify-between gap-2 disabled:opacity-50 ${
                auditCompletedLocal
                  ? "border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-200"
                  : "border-amber-500/35 bg-gradient-to-r from-amber-500/15 to-orange-500/10 hover:from-amber-500/25 hover:to-orange-500/20 text-amber-200"
              }`}
            >
              <div>
                <p className="text-xs font-semibold">
                  {auditCompletedLocal
                    ? "✅ Re-run Bug & Regression Audit"
                    : "🛡️ Run Mandatory Safety Audit"}
                </p>
                <p className="text-[10px] opacity-75 mt-0.5">
                  Verifies bug validity &amp; unlocks Gate 2 Issue Drafter
                </p>
              </div>
              <span className="text-xs font-mono opacity-80">→</span>
            </button>

            {/* Quick Prompt Pills */}
            {messages.length === 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 px-1">
                  Quick Skeptical Checks
                </p>
                {QUICK_PROMPTS.map((qp) => (
                  <button
                    key={qp}
                    type="button"
                    onClick={() => sendChatMessage(qp)}
                    disabled={isLoading}
                    className="block w-full text-left rounded-xl border border-white/10 bg-white/[0.025] hover:bg-white/[0.06] hover:border-white/20 px-3.5 py-2.5 text-xs text-zinc-300 transition"
                  >
                    {qp}
                  </button>
                ))}
              </div>
            )}

            {/* Message Bubbles */}
            {messages.map((msg) =>
              msg.role === "user" ? (
                <div
                  key={msg.id}
                  className="ml-6 rounded-2xl rounded-tr-sm bg-gradient-to-br from-blue-600/25 to-indigo-600/20 border border-blue-500/30 px-3.5 py-2.5 shadow-sm"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-blue-300">
                      You
                    </span>
                  </div>
                  <p className="text-xs text-blue-50 leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </p>
                </div>
              ) : (
                <div
                  key={msg.id}
                  className="mr-2 rounded-2xl rounded-tl-sm bg-white/[0.035] border border-white/10 px-3.5 py-3 shadow-sm"
                >
                  <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-white/5">
                    <span className="text-xs font-bold tracking-tight text-white">
                      Orien<span className="text-blue-500">.</span>
                    </span>
                  </div>
                  <FormattedMessageBody content={msg.content} />
                </div>
              )
            )}

            {isLoading && (
              <div className="mr-2 rounded-2xl border border-white/10 bg-white/[0.02] px-3.5 py-3 flex items-center gap-2.5">
                <span className="h-2 w-2 rounded-full bg-blue-400 animate-ping" />
                <span className="text-xs font-mono text-zinc-400">
                  Orien is auditing the diff...
                </span>
              </div>
            )}

            {errorMessage && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/15 p-3 text-xs text-red-200">
                🛑 {errorMessage}
              </div>
            )}

            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Composer Footer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendChatMessage(input);
        }}
        className="p-3 border-t border-white/10 bg-[#0b0b0f] flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!proposal || isLoading}
          placeholder={
            proposal
              ? "Challenge edge cases or ask a follow-up..."
              : "Generate a proposal first..."
          }
          className="flex-1 bg-black/50 border border-white/10 focus:border-blue-500 disabled:opacity-50 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-zinc-600 outline-none transition"
        />
        <button
          type="submit"
          disabled={!proposal || isLoading || !input.trim()}
          className="rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-3.5 py-2 text-xs font-semibold text-white transition shrink-0"
        >
          Send
        </button>
      </form>
    </aside>
  );
}