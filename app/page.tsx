"use client";

import { useState } from "react";
import Link from "next/link";
import ApiKeyModal from "@/components/ApiKeyModal";
import { loadByokConfig, type OrienByokConfig } from "@/lib/api";

export default function LandingPage() {
  const [selectedMetric, setSelectedMetric] = useState<"tokens" | "pipeline">(
    "tokens"
  );
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [byokState, setByokState] = useState<OrienByokConfig>(() =>
    loadByokConfig()
  );

  const hasAnyCredential = Boolean(
    byokState.coarenaKey ||
      byokState.googleStudioKey ||
      byokState.ownerPasscode
  );

  return (
    <div className="min-h-screen bg-[#09090b] text-white selection:bg-blue-500/30 [color-scheme:dark]">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#09090b]/85 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-white via-blue-100 to-blue-400 bg-clip-text text-transparent">
              Orien
            </span>
            <span className="hidden sm:inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-mono text-blue-300">
              Carbon 6k · Horizon 30k
            </span>
          </div>

          <nav className="flex items-center gap-3">
            <Link
              href="/docs"
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition"
            >
              Docs
            </Link>

            <button
              type="button"
              onClick={() => setShowKeyModal(true)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                hasAnyCredential
                  ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                  : "border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10"
              }`}
            >
              {hasAnyCredential ? "🔑 Keys Configured" : "🔑 API Keys"}
            </button>

            <Link
              href="/workspace"
              className="rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-1.5 text-xs font-semibold text-white transition"
            >
              Get Started →
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-14 space-y-20">
        {/* Hero Section */}
        <section className="text-center max-w-3xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1 text-xs text-zinc-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Autonomous Bug Hunter · Dependency Tracer · 2-Gate Issue Drafter
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.15]">
            Hunt Real Bugs Across Repositories Without{" "}
            <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
              Hallucinated PRs.
            </span>
          </h1>

          <p className="text-base text-zinc-400 leading-relaxed">
            Orien pairs its dual-engine token guardrail architecture (
            <span className="text-blue-300 font-mono">Orien Carbon 6k</span> +{" "}
            <span className="text-purple-300 font-mono">Orien Horizon 30k</span>
            ), live cross-file dependency tracing, and a mandatory Proposal Chat
            safety gate before drafting a single GitHub Issue or Pull Request.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/workspace"
              className="rounded-xl bg-blue-600 hover:bg-blue-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition"
            >
              🚀 Get Started with Orien →
            </Link>

            <button
              type="button"
              onClick={() => setShowKeyModal(true)}
              className="rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 px-5 py-3 text-sm font-medium text-zinc-200 transition"
            >
              🔑 Configure API Keys
            </button>

            <Link
              href="/docs"
              className="rounded-xl border border-white/10 hover:bg-white/5 px-5 py-3 text-sm font-medium text-zinc-400 hover:text-white transition"
            >
              Architecture Docs
            </Link>
          </div>
        </section>

        {/* Interactive Visual Graphs: Dual-Engine Token Budget & Safety Pipeline */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">
                📊 Inside Orien&apos;s Engine &amp; Guardrail Architecture
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Dual-engine routing, token guardrails, and safety verification
                built natively into Orien.
              </p>
            </div>

            <div className="flex rounded-lg bg-black/50 p-1 border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setSelectedMetric("tokens")}
                className={`px-3 py-1.5 rounded-md transition ${
                  selectedMetric === "tokens"
                    ? "bg-white/10 text-white font-medium"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Token Capacity Graph
              </button>
              <button
                type="button"
                onClick={() => setSelectedMetric("pipeline")}
                className={`px-3 py-1.5 rounded-md transition ${
                  selectedMetric === "pipeline"
                    ? "bg-white/10 text-white font-medium"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                4-Stage Safety Flow
              </button>
            </div>
          </div>

          {selectedMetric === "tokens" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              {/* Bar Comparison Card */}
              <div className="rounded-xl border border-white/10 bg-[#0c0c10] p-5 space-y-5">
                <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                  Input Context Window Guardrails (Hard-Enforced)
                </h3>

                {/* Orien Carbon Bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-blue-300">
                      ⚡ Orien Carbon · Fast Precision Engine
                    </span>
                    <span className="font-mono text-white">6,000 tokens</span>
                  </div>
                  <div className="h-4 w-full rounded-full bg-white/5 overflow-hidden p-0.5 border border-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400"
                      style={{ width: "20%" }}
                    />
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Optimized for fast single-file surgical fixes, self-healing
                    traceback loops, and low-latency edits (~22k chars max).
                  </p>
                </div>

                {/* Orien Horizon Bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-purple-300">
                      🔭 Orien Horizon · Deep Repository Engine
                    </span>
                    <span className="font-mono text-white">30,000 tokens</span>
                  </div>
                  <div className="h-4 w-full rounded-full bg-white/5 overflow-hidden p-0.5 border border-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-600 via-indigo-500 to-pink-400"
                      style={{ width: "100%" }}
                    />
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    5× wider context window for multi-file bug hunting across
                    complex modules and imported dependencies (~115k chars max).
                  </p>
                </div>

                {/* Per-File Cap Bar */}
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-emerald-300">
                      🛡️ Single-File Truncation Shield
                    </span>
                    <span className="font-mono text-zinc-300">
                      24,000 chars / file
                    </span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500/80"
                      style={{ width: "80%" }}
                    />
                  </div>
                </div>
              </div>

              {/* Architecture Telemetry Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-white/10 bg-[#0c0c10] p-5 flex flex-col justify-between">
                  <span className="text-xs font-mono text-zinc-500">
                    SAFETY GATES
                  </span>
                  <p className="text-3xl font-bold text-white my-2">2-Gate</p>
                  <p className="text-xs text-zinc-400">
                    Proposal Chat must verify every diff before GitHub Issue or
                    PR drafting unlocks.
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#0c0c10] p-5 flex flex-col justify-between">
                  <span className="text-xs font-mono text-zinc-500">
                    WORKSPACE MODES
                  </span>
                  <p className="text-3xl font-bold text-emerald-400 my-2">
                    2 Modes
                  </p>
                  <p className="text-xs text-zinc-400">
                    Read-only <span className="text-white">Open Source</span>{" "}
                    mode vs. granular <span className="text-white">Project</span>{" "}
                    disk writes.
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#0c0c10] p-5 flex flex-col justify-between">
                  <span className="text-xs font-mono text-zinc-500">
                    CONTEXT HISTORY
                  </span>
                  <p className="text-3xl font-bold text-blue-400 my-2">
                    25-Step
                  </p>
                  <p className="text-xs text-zinc-400">
                    Full Undo/Redo stack on selected context files and imported
                    dependencies.
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#0c0c10] p-5 flex flex-col justify-between">
                  <span className="text-xs font-mono text-zinc-500">
                    KEY STORAGE
                  </span>
                  <p className="text-3xl font-bold text-purple-400 my-2">
                    Local
                  </p>
                  <p className="text-xs text-zinc-400">
                    Your API keys stay strictly inside your own browser&apos;s{" "}
                    <span className="font-mono">localStorage</span>.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
              {[
                {
                  step: "01",
                  title: "Trace Dependencies",
                  desc: "Inspect exact symbols & local modules imported by any file and pull them into context with 1 click.",
                  color: "border-blue-500/30 text-blue-300",
                },
                {
                  step: "02",
                  title: "Generate Surgical Diff",
                  desc: "Orien Carbon (6k) or Orien Horizon (30k) produces verbatim original_code → proposed_code patches.",
                  color: "border-purple-500/30 text-purple-300",
                },
                {
                  step: "03",
                  title: "Skeptical Audit & Test",
                  desc: "Challenge edge cases in stateful Proposal Chat and run local ruff & pytest self-healing.",
                  color: "border-amber-500/30 text-amber-300",
                },
                {
                  step: "04",
                  title: "Draft & Save PR",
                  desc: "Select atomic files, match org screenshot templates, and export maintainer-ready Markdown.",
                  color: "border-emerald-500/30 text-emerald-300",
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className={`rounded-xl border bg-[#0c0c10] p-5 space-y-2.5 ${item.color}`}
                >
                  <span className="text-xs font-mono opacity-80">
                    STAGE {item.step}
                  </span>
                  <h3 className="text-sm font-semibold text-white">
                    {item.title}
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Transparent Matrix: What Orien Can Do vs. What Orien Deliberately Won't Do */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* CAN DO */}
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.03] p-6 sm:p-7 space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">✅</span>
              <h2 className="text-lg font-semibold text-white">
                What Orien Excels At
              </h2>
            </div>

            <ul className="space-y-3 text-xs sm:text-sm text-zinc-300 leading-relaxed">
              <li className="flex items-start gap-2.5">
                <span className="text-emerald-400 font-bold mt-0.5">•</span>
                <span>
                  <strong className="text-white">
                    Surgical Bug Isolation:
                  </strong>{" "}
                  Scans cross-file Python/TypeScript imports to catch subtle
                  state mutations, type mismatches, and edge-case regressions.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-emerald-400 font-bold mt-0.5">•</span>
                <span>
                  <strong className="text-white">
                    Granular File Control:
                  </strong>{" "}
                  Apply individual file proposals in{" "}
                  <span className="font-mono text-emerald-300">Project</span>{" "}
                  mode or cherry-pick atomic files for a single GitHub PR.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-emerald-400 font-bold mt-0.5">•</span>
                <span>
                  <strong className="text-white">
                    Org-Matched Issue &amp; PR Drafting:
                  </strong>{" "}
                  Paste a screenshot of an upstream repo&apos;s PR template and
                  Orien mirrors its exact headings and tone.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-emerald-400 font-bold mt-0.5">•</span>
                <span>
                  <strong className="text-white">
                    Local Self-Healing Loop:
                  </strong>{" "}
                  Runs local <span className="font-mono">ruff</span> &amp;{" "}
                  <span className="font-mono">pytest</span> checks and feeds
                  tracebacks back into Orien to auto-repair failing patches.
                </span>
              </li>
            </ul>
          </div>

          {/* CANNOT / WILL NOT DO */}
          <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.03] p-6 sm:p-7 space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">🛑</span>
              <h2 className="text-lg font-semibold text-white">
                What Orien Deliberately Won&apos;t Do
              </h2>
            </div>

            <ul className="space-y-3 text-xs sm:text-sm text-zinc-300 leading-relaxed">
              <li className="flex items-start gap-2.5">
                <span className="text-red-400 font-bold mt-0.5">•</span>
                <span>
                  <strong className="text-white">
                    No Unverified PR Spam:
                  </strong>{" "}
                  If Proposal Chat identifies a false positive or architectural
                  non-bug, the backend hard-blocks Issue &amp; PR generation.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-red-400 font-bold mt-0.5">•</span>
                <span>
                  <strong className="text-white">
                    No Silent Disk Overwrites:
                  </strong>{" "}
                  <span className="font-mono text-blue-300">Open Source</span>{" "}
                  mode locks direct disk writes—only unified{" "}
                  <span className="font-mono">.patch</span> and clean file
                  downloads are allowed.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-red-400 font-bold mt-0.5">•</span>
                <span>
                  <strong className="text-white">
                    No Unbounded Token Blowups:
                  </strong>{" "}
                  Refuses to dump 500-file repositories into a single pass;
                  enforces strict 6k and 30k context budgets.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-red-400 font-bold mt-0.5">•</span>
                <span>
                  <strong className="text-white">
                    No Server-Side Key Storage:
                  </strong>{" "}
                  Your API keys never touch a database—they live strictly in
                  your own browser&apos;s local storage.
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="rounded-2xl border border-blue-500/25 bg-gradient-to-r from-blue-600/15 via-indigo-600/10 to-purple-600/15 p-8 text-center space-y-4">
          <h2 className="text-2xl font-bold text-white">
            Ready to inspect your first repository?
          </h2>
          <p className="text-sm text-zinc-300 max-w-xl mx-auto">
            Configure your keys in 15 seconds and launch the full Orien
            workspace.
          </p>
          <div className="pt-2">
            <Link
              href="/workspace"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-6 py-3 text-sm font-semibold text-white transition"
            >
              Get Started with Orien →
            </Link>
          </div>
        </section>
      </main>

      <ApiKeyModal
        open={showKeyModal}
        onClose={() => setShowKeyModal(false)}
        onSaved={(cfg) => setByokState(cfg)}
      />
    </div>
  );
}