"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import PanelHeader from "@/components/PanelHeader";
import type { EditProposal } from "@/lib/types";

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
  onMessagesChange: (messages: ProposalChatMessage[]) => void;
  autoAuditTrigger: number;
  onAuditCompleted: () => void;
};

const QUICK_PROMPTS = [
  "Verify this bug thoroughly and check if this fix is 100% safe to submit upstream: " +
  "1) Is this a genuine, valid bug in the codebase (not a false positive)? " +
  "2) Could the proposed change break any existing callers, contracts, or edge cases? ",
  "Any edge cases I should test?",
  "Write a pytest for these edge cases",
];

const SAFETY_AUDIT_PROMPT =
  "Verify this bug thoroughly and check if this fix is 100% safe to submit upstream: " +
  "1) Is this a genuine, valid bug in the codebase (not a false positive)? " +
  "2) Could the proposed change break any existing callers, contracts, or edge cases? " +
  "Give a clear SAFE or UNSAFE verdict with technical reasons.";

function renderInlineFormatting(text: string) {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  return tokens.map((token, idx) => {
    if (token.startsWith("**") && token.endsWith("**") && token.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith("`") && token.endsWith("`") && token.length > 2) {
      return (
        <code
          key={idx}
          className="rounded bg-white/10 border border-white/10 px-1.5 py-0.5 font-mono text-[11px] text-emerald-300"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={idx}>{token}</Fragment>;
  });
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="my-2 rounded-lg border border-white/10 bg-[#070709] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1 border-b border-white/10 bg-white/[0.03] text-[10px] font-mono text-zinc-400">
        <span>{lang || "code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-zinc-400 hover:text-white transition"
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-3 text-[11px] font-mono text-zinc-200 overflow-x-auto leading-relaxed">
        {code}
      </pre>
    </div>
  );
}

function FormattedAssistantMessage({ content }: { content: string }) {
  const segments = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2 text-[12.5px] leading-relaxed text-zinc-200">
      {segments.map((segment, segIdx) => {
        if (segment.startsWith("```") && segment.endsWith("```")) {
          const inner = segment.slice(3, -3);
          const firstNewline = inner.indexOf("\n");
          const lang =
            firstNewline !== -1 ? inner.slice(0, firstNewline).trim() : "";
          const code =
            firstNewline !== -1
              ? inner.slice(firstNewline + 1).trimEnd()
              : inner.trim();

          return <CodeBlock key={segIdx} code={code} lang={lang} />;
        }

        const lines = segment.split("\n");
        return (
          <div key={segIdx} className="space-y-1.5">
            {lines.map((rawLine, lineIdx) => {
              const trimmed = rawLine.trim();
              if (!trimmed) return null;

              if (/^#{1,4}\s+/.test(trimmed)) {
                const headingText = trimmed.replace(/^#{1,4}\s+/, "");
                return (
                  <p
                    key={lineIdx}
                    className="pt-1 text-xs font-semibold text-blue-300"
                  >
                    {renderInlineFormatting(headingText)}
                  </p>
                );
              }

              if (/^[-*•]\s+/.test(trimmed)) {
                const itemText = trimmed.replace(/^[-*•]\s+/, "");
                return (
                  <div key={lineIdx} className="flex items-start gap-2 pl-1">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                    <p className="min-w-0 flex-1 text-zinc-300">
                      {renderInlineFormatting(itemText)}
                    </p>
                  </div>
                );
              }

              const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
              if (numMatch) {
                return (
                  <div key={lineIdx} className="flex items-start gap-2 pl-1">
                    <span className="font-mono text-[11px] font-semibold text-blue-400 shrink-0 mt-0.5">
                      {numMatch[1]}.
                    </span>
                    <p className="min-w-0 flex-1 text-zinc-300">
                      {renderInlineFormatting(numMatch[2])}
                    </p>
                  </div>
                );
              }

              return (
                <p key={lineIdx} className="text-zinc-200">
                  {renderInlineFormatting(trimmed)}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function AssistantReplyCard({ content }: { content: string }) {
  const [copiedReply, setCopiedReply] = useState(false);

  function handleCopyReply() {
    navigator.clipboard.writeText(content);
    setCopiedReply(true);
    setTimeout(() => setCopiedReply(false), 1800);
  }

  return (
    <div className="rounded-2xl rounded-bl-sm bg-gradient-to-b from-white/[0.05] to-white/[0.025] border border-white/10 p-3.5 shadow-sm">
      <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-white/[0.07]">
        <span className="text-[13px] font-semibold tracking-tight text-white">
          Orien<span className="text-blue-500">.</span>
        </span>

        <button
          type="button"
          onClick={handleCopyReply}
          title="Copy reply"
          className="text-[10px] font-mono text-zinc-500 hover:text-zinc-200 transition"
        >
          {copiedReply ? "✓ Copied" : "Copy"}
        </button>
      </div>

      <FormattedAssistantMessage content={content} />
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
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastHandledTriggerRef = useRef<number>(0);

  useEffect(() => {
    setInput("");
    setError("");
  }, [proposal]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  function buildProposalMemoryContext(history: ProposalChatMessage[]): string {
    if (!proposal) return "";

    const changesText = proposal.changes
      .map(
        (change, index) =>
          `CHANGE ${index + 1} (${change.action.toUpperCase()}): ${change.file}\n` +
          `REASON: ${change.reason || "N/A"}\n` +
          `ORIGINAL CODE:\n${change.original_code || "(none)"}\n` +
          `PROPOSED CODE:\n${change.proposed_code || "(none)"}`
      )
      .join("\n\n---\n\n");

    const memoryLines = history
      .slice(-10)
      .map(
        (msg) =>
          `${msg.role === "user" ? "DEVELOPER" : "ORIEN"}: ${msg.content}`
      )
      .join("\n\n");

    return (
      `ACTIVE CODE PROPOSAL SUMMARY:\n${proposal.summary}\n\n` +
      `PROPOSED FILE CHANGES:\n${changesText}` +
      (memoryLines
        ? `\n\nPREVIOUS PROPOSAL CHAT MEMORY (USE THIS TO MAINTAIN CONTEXT):\n${memoryLines}`
        : "")
    );
  }

  const memoryTokensEstimate = useMemo(() => {
    if (!proposal) return 0;
    const ctx = buildProposalMemoryContext(messages);
    return Math.ceil(ctx.length / 4);
  }, [proposal, messages]);

  async function handleSend(customQuestion?: string, isSafetyAudit = false) {
    const question = (customQuestion ?? input).trim();
    if (!question || !proposal || isSending) return;

    const userMsg: ProposalChatMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      content: question,
    };

    const updatedHistory = [...messages, userMsg];
    onMessagesChange(updatedHistory);
    if (!customQuestion) {
      setInput("");
    }
    setError("");
    setIsSending(true);

    try {
      const repositoryContext = buildProposalMemoryContext(messages);

      const response = await fetch("http://127.0.0.1:8000/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: question,
          repository_context: repositoryContext,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Orien could not answer your question."
        );
      }

      if (!data.success || typeof data.answer !== "string") {
        throw new Error("Unexpected response from Orien.");
      }

      onMessagesChange([
        ...updatedHistory,
        {
          id: `${Date.now()}-assistant`,
          role: "assistant",
          content: data.answer,
        },
      ]);

      if (isSafetyAudit) {
        onAuditCompleted();
      }
    } catch (err) {
      console.warn("Proposal chat error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to reach Orien backend."
      );
    } finally {
      setIsSending(false);
    }
  }

  // Trigger Gate 1 automatic safety audit when requested from ProposalPanel
  useEffect(() => {
    if (
      autoAuditTrigger > 0 &&
      autoAuditTrigger !== lastHandledTriggerRef.current &&
      proposal &&
      !isSending
    ) {
      lastHandledTriggerRef.current = autoAuditTrigger;
      handleSend(SAFETY_AUDIT_PROMPT, true);
    }
  }, [autoAuditTrigger, proposal, isSending]);

  return (
    <aside
      className={`${
        visible ? "flex" : "hidden"
      } w-[340px] shrink-0 flex-col min-h-0 border-l border-white/10 pt-16 bg-[#0c0c0f]`}
    >
      <PanelHeader
        title="Proposal chat"
        description="Ask about fixes and why they were made"
        onClose={onClose}
      />

      {proposal && (
        <div className="shrink-0 px-4 py-2 border-b border-white/10 bg-white/[0.02] flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-mono">
              ● {messages.length} {messages.length === 1 ? "turn" : "turns"}
            </span>
            <span
              title="Only the diff + recent chat turns are sent (not full repo files)"
              className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400"
            >
              ~{memoryTokensEstimate.toLocaleString()}t mem
            </span>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              disabled={isSending}
              onClick={() => {
                onMessagesChange([]);
                setError("");
              }}
              className="text-zinc-500 hover:text-zinc-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear
            </button>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3.5">
        {!proposal ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.015] p-4">
            <p className="text-xs font-medium text-zinc-300">No proposal yet</p>
            <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">
              Generate an edit proposal first, then ask Orien why each change
              was made, check edge cases, or generate unit tests.
            </p>
          </div>
        ) : messages.length === 0 ? (
          <div className="space-y-3 pt-1">
            <p className="text-xs text-zinc-400 leading-relaxed">
              Reviewing{" "}
              <span className="text-zinc-200 font-medium">
                {proposal.changes.length}{" "}
                {proposal.changes.length === 1 ? "file change" : "file changes"}
              </span>
              . Ask anything—Orien remembers up to 10 turns of this review:
            </p>

            <div className="flex flex-col gap-1.5">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleSend(prompt)}
                  disabled={isSending}
                  className="text-left text-xs rounded-xl border border-white/10 bg-white/[0.03] hover:bg-blue-500/10 hover:border-blue-500/40 px-3.5 py-2.5 text-zinc-200 transition disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) =>
            msg.role === "user" ? (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-blue-600/25 border border-blue-500/35 px-3.5 py-2.5 text-xs leading-relaxed text-blue-50">
                  {msg.content}
                </div>
              </div>
            ) : (
              <AssistantReplyCard key={msg.id} content={msg.content} />
            )
          )
        )}

        {isSending && (
          <div className="rounded-2xl bg-white/[0.03] border border-white/10 px-3.5 py-3 text-xs text-zinc-400 animate-pulse">
            Orien is analyzing the diff...
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
            {error}
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="shrink-0 p-3.5 border-t border-white/10 bg-[#0a0a0d] flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!proposal || isSending}
          placeholder={
            proposal
              ? "Ask about this proposal..."
              : "Generate a proposal first..."
          }
          className="flex-1 min-w-0 bg-white/[0.03] border border-white/10 focus:border-blue-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-zinc-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed transition"
        />

        <button
          type="submit"
          disabled={!proposal || !input.trim() || isSending}
          className="bg-blue-600 hover:bg-blue-500 px-3.5 py-2 rounded-xl text-xs font-medium text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </form>
    </aside>
  );
}