import Link from "next/link";

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-[#09090b] text-white [color-scheme:dark]">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-20 h-14 border-b border-white/10 bg-[#0c0c0f]/90 backdrop-blur px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-2xl font-semibold tracking-tight hover:opacity-90 transition"
          >
            Orien<span className="text-blue-500">.</span>
          </Link>
          <span className="text-xs font-mono rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-blue-300">
            Documentation
          </span>
        </div>

        <Link
          href="/"
          className="rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-3.5 py-1.5 text-xs font-medium text-zinc-200 transition"
        >
          ← Back to Workspace
        </Link>
      </header>

      {/* Main Content Layout */}
      <div className="max-w-5xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-10">
        {/* Sticky Sidebar Index */}
        <aside className="hidden md:block">
          <div className="sticky top-24 space-y-2 text-xs">
            <p className="font-semibold uppercase tracking-wider text-zinc-500 mb-3">
              On This Page
            </p>
            <a
              href="#overview"
              className="block py-1 text-zinc-400 hover:text-white transition"
            >
              1. What is Orien?
            </a>
            <a
              href="#engines"
              className="block py-1 text-zinc-400 hover:text-white transition"
            >
              2. Dual-Engine Routing
            </a>
            <a
              href="#guardrails"
              className="block py-1 text-zinc-400 hover:text-white transition"
            >
              3. Token Guardrails &amp; Undo
            </a>
            <a
              href="#dependencies"
              className="block py-1 text-zinc-400 hover:text-white transition"
            >
              4. File Dependencies View
            </a>
            <a
              href="#workflow"
              className="block py-1 text-zinc-400 hover:text-white transition"
            >
              5. Recommended Workflow
            </a>
          </div>
        </aside>

        {/* Documentation Sections */}
        <div className="space-y-12">
          {/* 1. Overview */}
          <section id="overview" className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight">
              Orien<span className="text-blue-500">.</span> Engineering Workbench
            </h1>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Orien is a precision, human-in-the-loop AI bug-finding and code-proposal
              workbench built with <span className="text-zinc-200 font-medium">Next.js</span> and{" "}
              <span className="text-zinc-200 font-medium">FastAPI</span>. Instead of
              blindly dumping entire repositories into an LLM, Orien gives engineers
              surgical control over file context, strict client- and server-side token
              caps, single-file import tracing, and side-by-side diff inspection before
              any code is applied.
            </p>
          </section>

          {/* 2. Dual-Engine Routing */}
          <section id="engines" className="space-y-4">
            <h2 className="text-xl font-semibold">
              Dual-Engine Routing: Carbon vs. Horizon
            </h2>
            <p className="text-sm text-zinc-400">
              Different debugging tasks require different context budgets. Orien lets you
              switch engines on the fly depending on the scope of your investigation:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.05] p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-emerald-300">
                    ⚡ Orien Carbon
                  </h3>
                  <span className="text-xs font-mono text-emerald-400">
                    6,000t Cap
                  </span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Powered by <span className="text-zinc-200">DeepSeek V4.1 Flash</span>{" "}
                  with medium reasoning effort. Built for fast, surgical single-file or
                  two-file bug fixes with minimal latency and tight quota efficiency.
                </p>
              </div>

              <div className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.05] p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sky-300">
                    🌌 Orien Horizon
                  </h3>
                  <span className="text-xs font-mono text-sky-400">
                    30,000t Cap
                  </span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Powered by <span className="text-zinc-200">Gemini 4 Hydrogen</span>{" "}
                  (up to 64k output tokens) with medium reasoning effort. Engineered for
                  cross-module scans, multi-file refactors, and tracing upstream callers.
                </p>
              </div>
            </div>
          </section>

          {/* 3. Token Meter, Guardrails & Undo */}
          <section id="guardrails" className="space-y-3">
            <h2 className="text-xl font-semibold">
              Real-Time Token Guardrails &amp; Undo/Redo
            </h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Every file checked in the workspace sidebar is measured in real time
              (including system prompt overhead) and validated on both the browser and
              the FastAPI gateway before making an API call.
            </p>
            <ul className="space-y-2 text-sm text-zinc-300 list-disc pl-5">
              <li>
                <span className="font-medium text-white">Dual-Layer Blocking:</span>{" "}
                Requests exceeding 6k (Carbon) or 30k (Horizon) are blocked immediately
                with clear recovery guidance.
              </li>
              <li>
                <span className="font-medium text-white">Selected Files Drawer:</span>{" "}
                Click <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded">Selected files (N)</code>{" "}
                below the token meter to inspect every queued file and remove heavy files
                in one click.
              </li>
              <li>
                <span className="font-medium text-white">Context Undo / Redo:</span>{" "}
                Accidentally loaded too many imports? Hit{" "}
                <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded">↩ Undo</code>{" "}
                to snap back to your previous token budget instantly.
              </li>
            </ul>
          </section>

          {/* 4. File Dependencies View */}
          <section id="dependencies" className="space-y-3">
            <h2 className="text-xl font-semibold">
              Focused Single-File Dependencies
            </h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Orien parses Python (<code className="text-xs text-zinc-200">from X import This</code>)
              and TypeScript/JavaScript (<code className="text-xs text-zinc-200">import &#123; This &#125; from &quot;...&quot;</code>)
              statements client-side without burning LLM tokens. Selecting any file
              highlights the exact symbols it imports, lets you jump directly into
              internal modules, and automatically moves into the Ask Orien panel once a
              code proposal is generated.
            </p>
          </section>

          {/* 5. Recommended Workflow */}
          <section id="workflow" className="space-y-3">
            <h2 className="text-xl font-semibold">
              Recommended Bug-Hunting Workflow
            </h2>
            <ol className="space-y-2 text-sm text-zinc-300 list-decimal pl-5">
              <li>
                <span className="font-medium text-white">Load &amp; Analyze:</span>{" "}
                Upload a local repository folder and click{" "}
                <span className="text-blue-400 font-medium">Analyze Dependencies</span>.
              </li>
              <li>
                <span className="font-medium text-white">Scope Tightly:</span> Select
                your target file and pull in only the relevant imported modules via{" "}
                <span className="text-emerald-400 font-medium">+ Context</span> while
                watching the token meter.
              </li>
              <li>
                <span className="font-medium text-white">Generate &amp; Inspect Diff:</span>{" "}
                Run <span className="text-emerald-400 font-medium">Propose Edit</span>{" "}
                and inspect every change in Split View.
              </li>
              <li>
                <span className="font-medium text-white">Verify Locally:</span>{" "}
                Validate the patch with your local test suite and linter (e.g.,{" "}
                <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded">pytest</code>{" "}
                and <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded">ruff</code>)
                before opening an upstream PR.
              </li>
            </ol>
          </section>
        </div>
      </div>
    </main>
  );
}