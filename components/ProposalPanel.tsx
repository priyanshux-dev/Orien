"use client";

import { useEffect, useState } from "react";
import ProposalCard from "@/components/ProposalCard";
import SplitView from "@/components/SplitView";
import type { WorkspaceMode } from "@/components/Header";
import type { ProposalChatMessage } from "@/components/ProposalChatPanel";
import type { EditProposal, ProposedChange } from "@/lib/types";

type ProposalPanelProps = {
  repoName: string;
  proposal: EditProposal | null;
  splitView: boolean;
  selectedFiles: File[];
  workspaceMode: WorkspaceMode;
  projectDirHandle: any | null;
  onRequestProjectFolder: () => Promise<any | null>;
  isBugAudited: boolean;
  chatMessages: ProposalChatMessage[];
  onTriggerSafetyAudit: () => void;
  onSelfHealProposal: (
    failureReport: string,
    targetPaths: string[]
  ) => Promise<void>;
};

type SavedGitHubDraft = {
  id: string;
  savedAt: string;
  files: string[];
  issueTitle: string;
  issueMarkdown: string;
  prMarkdown: string;
};

type CheckRunResult = {
  overall_passed: boolean;
  ruff_ran: boolean;
  ruff_passed: boolean;
  ruff_output: string;
  pytest_ran: boolean;
  pytest_passed: boolean;
  pytest_output: string;
  discovered_tests: string[];
  python_used: string;
};

const SAVED_DRAFTS_STORAGE_KEY = "orien_saved_github_drafts_v1";

const dotStyles = {
  modify: "bg-yellow-400",
  create: "bg-emerald-400",
  delete: "bg-red-400",
};

const badgeStyles = {
  modify: "text-yellow-300 bg-yellow-500/15 border-yellow-500/30",
  create: "text-emerald-300 bg-emerald-500/15 border-emerald-500/30",
  delete: "text-red-300 bg-red-500/15 border-red-500/30",
};

function triggerBrowserDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function findMatchingRepoFile(targetPath: string, files: File[]): File | null {
  const normalizedTarget = targetPath.replace(/\\/g, "/");
  const baseName = normalizedTarget.split("/").pop() || normalizedTarget;

  return (
    files.find(
      (f) =>
        (f.webkitRelativePath || f.name).replace(/\\/g, "/") === normalizedTarget
    ) ||
    files.find((f) => {
      const p = (f.webkitRelativePath || f.name).replace(/\\/g, "/");
      return (
        p.endsWith(`/${normalizedTarget}`) || normalizedTarget.endsWith(`/${p}`)
      );
    }) ||
    files.find((f) => f.name === baseName) ||
    null
  );
}

function buildDraftMarkdownBundle(draft: {
  issueTitle: string;
  issueMarkdown: string;
  prMarkdown: string;
  files?: string[];
}): string {
  const filesHeader =
    draft.files && draft.files.length > 0
      ? `**Target Files:** ${draft.files.map((f) => `\`${f}\``).join(", ")}\n\n`
      : "";

  return (
    `# ${draft.issueTitle}\n\n` +
    filesHeader +
    `---\n\n` +
    `## GitHub Issue Draft\n\n` +
    `${draft.issueMarkdown}\n\n` +
    `---\n\n` +
    `## Pull Request Draft\n\n` +
    `${draft.prMarkdown}\n`
  );
}

async function writeSingleChangeToDirectory(
  change: ProposedChange,
  dirHandle: any
) {
  const parts = change.file.replace(/\\/g, "/").split("/").filter(Boolean);
  const relParts =
    parts.length > 1 && parts[0] === dirHandle.name ? parts.slice(1) : parts;

  if (relParts.length === 0) {
    throw new Error(`Invalid target path: ${change.file}`);
  }

  let currentDir = dirHandle;
  for (const folder of relParts.slice(0, -1)) {
    currentDir = await currentDir.getDirectoryHandle(folder, {
      create: change.action === "create",
    });
  }

  const targetFileName = relParts[relParts.length - 1];

  if (change.action === "delete") {
    await currentDir.removeEntry(targetFileName);
    return;
  }

  const fileHandle = await currentDir.getFileHandle(targetFileName, {
    create: change.action === "create",
  });

  let nextContent = (change.proposed_code || "").replace(/\r\n/g, "\n");
  if (change.action === "modify") {
    const existingFile = await fileHandle.getFile();
    const existingText = (await existingFile.text()).replace(/\r\n/g, "\n");
    const origSnippet = (change.original_code || "").replace(/\r\n/g, "\n");

    if (origSnippet && existingText.includes(origSnippet)) {
      nextContent = existingText.replace(origSnippet, nextContent);
    } else if (origSnippet.trim() && existingText.includes(origSnippet.trim())) {
      nextContent = existingText.replace(
        origSnippet.trim(),
        nextContent.trim()
      );
    } else {
      throw new Error(
        `Could not safely match original_code inside ${relParts.join("/")}.`
      );
    }
  }

  const writable = await fileHandle.createWritable();
  await writable.write(nextContent);
  await writable.close();
}

export default function ProposalPanel({
  repoName,
  proposal,
  splitView,
  selectedFiles,
  workspaceMode,
  projectDirHandle,
  onRequestProjectFolder,
  isBugAudited,
  chatMessages,
  onTriggerSafetyAudit,
  onSelfHealProposal,
}: ProposalPanelProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [actionNotice, setActionNotice] = useState("");
  const [actionError, setActionError] = useState("");

  // Project Mode Granular Apply State
  const [applyingIndex, setApplyingIndex] = useState<number | "batch" | null>(
    null
  );
  const [appliedIndices, setAppliedIndices] = useState<number[]>([]);
  const [showProjectApplyModal, setShowProjectApplyModal] = useState(false);
  const [selectedApplyIndices, setSelectedApplyIndices] = useState<number[]>([
    0,
  ]);

  // Local Pytest & Ruff Verification + Self-Healing State
  const [localRepoPath, setLocalRepoPath] = useState("");
  const [customTestTarget, setCustomTestTarget] = useState("");
  const [isRunningChecks, setIsRunningChecks] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [checkResult, setCheckResult] = useState<CheckRunResult | null>(null);
  const [isSelfHealing, setIsSelfHealing] = useState(false);

  // 2-Gate GitHub Issue & PR Drafter Modal State
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [modalTab, setModalTab] = useState<"create" | "saved">("create");
  const [selectedDraftIndices, setSelectedDraftIndices] = useState<number[]>([
    0,
  ]);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(
    null
  );
  const [includeAiDisclosure, setIncludeAiDisclosure] = useState(false);
  const [isDraftingIssue, setIsDraftingIssue] = useState(false);
  const [draftBlockedReason, setDraftBlockedReason] = useState("");
  const [draftError, setDraftError] = useState("");
  const [draftedResult, setDraftedResult] = useState<{
    issueTitle: string;
    issueMarkdown: string;
    prMarkdown: string;
    files: string[];
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string>("");
  const [savedNotice, setSavedNotice] = useState("");
  const [savedDrafts, setSavedDrafts] = useState<SavedGitHubDraft[]>([]);

  // Load saved local disk path for this repoName
  useEffect(() => {
    if (!repoName) return;
    try {
      const savedPath = window.localStorage.getItem(
        `orien_local_repo_path_${repoName}`
      );
      if (savedPath) {
        setLocalRepoPath(savedPath);
      }
    } catch {
      // ignore
    }
  }, [repoName]);

  function handleLocalRepoPathChange(nextPath: string) {
    setLocalRepoPath(nextPath);
    if (repoName) {
      try {
        window.localStorage.setItem(
          `orien_local_repo_path_${repoName}`,
          nextPath
        );
      } catch {
        // ignore
      }
    }
  }

  // Load saved GitHub drafts from localStorage on mount
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVED_DRAFTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setSavedDrafts(parsed);
        }
      }
    } catch (err) {
      console.warn("Could not read saved drafts from localStorage:", err);
    }
  }, []);

  function persistSavedDrafts(nextDrafts: SavedGitHubDraft[]) {
    setSavedDrafts(nextDrafts);
    try {
      window.localStorage.setItem(
        SAVED_DRAFTS_STORAGE_KEY,
        JSON.stringify(nextDrafts)
      );
    } catch (err) {
      console.warn("Could not save drafts to localStorage:", err);
    }
  }

  useEffect(() => {
    setActiveIndex(0);
    setActionNotice("");
    setActionError("");
    setApplyingIndex(null);
    setAppliedIndices([]);
    setShowProjectApplyModal(false);
    setSelectedApplyIndices([0]);
    setCheckError("");
    setCheckResult(null);
    setIsSelfHealing(false);
    setShowDraftModal(false);
    setModalTab("create");
    setSelectedDraftIndices([0]);
    setReferenceImageUrl(null);
    setDraftBlockedReason("");
    setDraftError("");
    setDraftedResult(null);
    setSavedNotice("");
  }, [proposal]);

  const showSplit =
    splitView && proposal !== null && proposal.changes.length > 0;

  const safeIndex = proposal
    ? Math.min(activeIndex, Math.max(proposal.changes.length - 1, 0))
    : 0;

  function buildUnifiedPatch(): string {
    if (!proposal) return "";
    return (
      proposal.changes
        .map((change) => {
          const origLines = (change.original_code || "")
            .replace(/\r\n/g, "\n")
            .split("\n");
          const propLines = (change.proposed_code || "")
            .replace(/\r\n/g, "\n")
            .split("\n");

          const header =
            `--- a/${change.file}\n` +
            `+++ b/${change.file}\n` +
            `@@ -1,${origLines.length} +1,${propLines.length} @@`;

          const removed = change.original_code
            ? origLines.map((l) => `-${l}`).join("\n")
            : "";
          const added = change.proposed_code
            ? propLines.map((l) => `+${l}`).join("\n")
            : "";

          return [header, removed, added].filter(Boolean).join("\n");
        })
        .join("\n\n") + "\n"
    );
  }

  function handleCopyPatch() {
    const patch = buildUnifiedPatch();
    if (!patch) return;
    navigator.clipboard.writeText(patch);
    setActionError("");
    setActionNotice("Copied unified patch to clipboard!");
    setTimeout(() => setActionNotice(""), 3000);
  }

  function handleDownloadPatch() {
    const patch = buildUnifiedPatch();
    if (!patch) return;
    triggerBrowserDownload("orien-fix.patch", patch);
    setActionError("");
    setActionNotice("Downloaded orien-fix.patch");
    setTimeout(() => setActionNotice(""), 3000);
  }

  async function handleDownloadUpdatedFile(changeIndex: number) {
    if (!proposal) return;
    const change = proposal.changes[changeIndex];
    if (!change || change.action === "delete") return;

    const fileName = change.file.split("/").pop() || "updated_file.txt";
    const normalizedProposed = (change.proposed_code || "").replace(
      /\r\n/g,
      "\n"
    );

    if (change.action === "create") {
      triggerBrowserDownload(fileName, normalizedProposed);
      setActionNotice(`Downloaded new file: ${fileName}`);
      setTimeout(() => setActionNotice(""), 3000);
      return;
    }

    const matchedFile = findMatchingRepoFile(change.file, selectedFiles);
    if (!matchedFile) {
      triggerBrowserDownload(fileName, normalizedProposed);
      setActionNotice(`Downloaded proposed snippet as ${fileName}`);
      setTimeout(() => setActionNotice(""), 3000);
      return;
    }

    const originalFullText = (await matchedFile.text()).replace(/\r\n/g, "\n");
    const normalizedOriginalSnippet = (change.original_code || "").replace(
      /\r\n/g,
      "\n"
    );

    let mergedFullFile = originalFullText;
    if (
      normalizedOriginalSnippet &&
      originalFullText.includes(normalizedOriginalSnippet)
    ) {
      mergedFullFile = originalFullText.replace(
        normalizedOriginalSnippet,
        normalizedProposed
      );
      setActionNotice(`Downloaded full updated file: ${fileName}`);
    } else {
      const trimmedOrig = normalizedOriginalSnippet.trim();
      if (trimmedOrig && originalFullText.includes(trimmedOrig)) {
        mergedFullFile = originalFullText.replace(
          trimmedOrig,
          normalizedProposed.trim()
        );
        setActionNotice(`Downloaded full updated file: ${fileName}`);
      } else {
        setActionNotice(
          `Downloaded ${fileName} (snippet did not match verbatim; check .patch)`
        );
      }
    }

    triggerBrowserDownload(fileName, mergedFullFile);
    setTimeout(() => setActionNotice(""), 3500);
  }

  async function handleApplyIndicesToProjectDisk(
    indicesToApply: number[],
    modeTag: number | "batch"
  ) {
    if (!proposal || workspaceMode !== "project" || indicesToApply.length === 0)
      return;

    setActionError("");
    setActionNotice("");

    let dirHandle = projectDirHandle;
    if (!dirHandle) {
      dirHandle = await onRequestProjectFolder();
      if (!dirHandle) return;
    }

    setApplyingIndex(modeTag);
    try {
      const newlyApplied: number[] = [];

      for (const idx of indicesToApply) {
        const change = proposal.changes[idx];
        if (!change) continue;
        await writeSingleChangeToDirectory(change, dirHandle);
        newlyApplied.push(idx);
      }

      setAppliedIndices((prev) =>
        Array.from(new Set([...prev, ...newlyApplied]))
      );
      setShowProjectApplyModal(false);

      if (newlyApplied.length === 1) {
        const singleName =
          proposal.changes[newlyApplied[0]]?.file.split("/").pop() || "file";
        setActionNotice(`Applied fix directly to ${singleName}!`);
      } else {
        setActionNotice(
          `Applied ${newlyApplied.length} selected changes to ${dirHandle.name}!`
        );
      }
    } catch (err) {
      console.error("Apply to project disk failed:", err);
      setActionError(
        err instanceof Error
          ? err.message
          : "Failed to write changes to project directory."
      );
    } finally {
      setApplyingIndex(null);
    }
  }

  // Run One-Click Ruff & Pytest on local repository folder
  async function handleRunLocalChecks() {
    if (!proposal) return;
    if (!localRepoPath.trim()) {
      setCheckError(
        "Paste your local repository folder path above (e.g., C:/Users/you/project) so Orien can run ruff & pytest."
      );
      return;
    }

    setIsRunningChecks(true);
    setCheckError("");
    setCheckResult(null);

    try {
      const response = await fetch("http://127.0.0.1:8000/run-checks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          project_root: localRepoPath.trim(),
          target_files: proposal.changes.map((c) => c.file),
          run_ruff: true,
          run_pytest: true,
          custom_pytest_target: customTestTarget.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Failed to execute local checks.");
      }

      setCheckResult(data);
    } catch (err) {
      setCheckError(
        err instanceof Error
          ? err.message
          : "Could not run ruff & pytest on backend."
      );
    } finally {
      setIsRunningChecks(false);
    }
  }

  // Trigger Self-Healing Patch Regeneration using the exact Ruff/Pytest failure output
  async function handleTriggerSelfHeal() {
    if (!proposal || !checkResult || checkResult.overall_passed) return;

    const sections: string[] = [];
    if (checkResult.ruff_ran && !checkResult.ruff_passed) {
      sections.push(`RUFF LINT FAILURE:\n${checkResult.ruff_output}`);
    }
    if (checkResult.pytest_ran && !checkResult.pytest_passed) {
      sections.push(`PYTEST FAILURE TRACEBACK:\n${checkResult.pytest_output}`);
    }

    const previousSummary = proposal.changes
      .map((c) => `- ${c.file}: ${c.reason}`)
      .join("\n");

    const failureReport =
      `SELF-HEALING FIX REQUIRED: The previous patch failed automated verification.\n\n` +
      `PREVIOUS ATTEMPTED CHANGES:\n${previousSummary}\n\n` +
      `${sections.join("\n\n---\n\n")}\n\n` +
      `Fix the root cause and resolve all ruff lint issues and pytest failures cleanly.`;

    const pathsToEnsureInContext = Array.from(
      new Set([
        ...proposal.changes.map((c) => c.file),
        ...checkResult.discovered_tests,
      ])
    );

    setIsSelfHealing(true);
    setCheckError("");
    try {
      await onSelfHealProposal(failureReport, pathsToEnsureInContext);
    } catch (err) {
      setCheckError(
        err instanceof Error
          ? err.message
          : "Self-healing regeneration failed."
      );
    } finally {
      setIsSelfHealing(false);
    }
  }

  function handleOpenProjectApplyModal() {
    if (!proposal) return;
    setSelectedApplyIndices([safeIndex]);
    setActionError("");
    setShowProjectApplyModal(true);
  }

  function toggleApplyIndex(index: number) {
    setSelectedApplyIndices((prev) =>
      prev.includes(index)
        ? prev.filter((item) => item !== index)
        : [...prev, index].sort((a, b) => a - b)
    );
  }

  function handleDraftIssueButtonClick() {
    if (!proposal) return;
    if (!isBugAudited) {
      onTriggerSafetyAudit();
      return;
    }
    setModalTab("create");
    setSelectedDraftIndices([safeIndex]);
    setDraftBlockedReason("");
    setDraftError("");
    setDraftedResult(null);
    setSavedNotice("");
    setShowDraftModal(true);
  }

  function toggleDraftIndex(index: number) {
    setDraftedResult(null);
    setDraftBlockedReason("");
    setDraftError("");
    setSavedNotice("");
    setSelectedDraftIndices((prev) =>
      prev.includes(index)
        ? prev.filter((item) => item !== index)
        : [...prev, index].sort((a, b) => a - b)
    );
  }

  function selectAllDraftIndices() {
    if (!proposal) return;
    setDraftedResult(null);
    setDraftBlockedReason("");
    setDraftError("");
    setSavedNotice("");
    setSelectedDraftIndices(proposal.changes.map((_, idx) => idx));
  }

  function handleReferenceImageFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setReferenceImageUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleGenerateIssueDraft() {
    if (!proposal || selectedDraftIndices.length === 0) return;

    const chosenChanges = selectedDraftIndices
      .map((idx) => proposal.changes[idx])
      .filter(Boolean);

    if (chosenChanges.length === 0) return;

    const focusedSummary =
      chosenChanges.length === proposal.changes.length
        ? proposal.summary
        : chosenChanges
            .map((c) => `${c.file}: ${c.reason || proposal.summary}`)
            .join(" | ");

    setIsDraftingIssue(true);
    setDraftBlockedReason("");
    setDraftError("");
    setDraftedResult(null);
    setSavedNotice("");

    try {
      const response = await fetch("http://127.0.0.1:8000/draft-issue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          proposal_summary: focusedSummary,
          changes: chosenChanges,
          chat_history: chatMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          reference_image_url: referenceImageUrl,
          include_ai_disclosure: includeAiDisclosure,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to draft GitHub Issue.");
      }

      if (!data.safe) {
        setDraftBlockedReason(
          data.blocked_reason ||
            "Safety audit in Proposal Chat flagged this fix as unsafe or unverified."
        );
        return;
      }

      setDraftedResult({
        issueTitle: data.issue_title,
        issueMarkdown: data.issue_markdown,
        prMarkdown: data.pr_markdown,
        files: chosenChanges.map((c) => c.file),
      });
    } catch (err) {
      setDraftError(
        err instanceof Error ? err.message : "Error contacting /draft-issue."
      );
    } finally {
      setIsDraftingIssue(false);
    }
  }

  function handleSaveDraftToVault() {
    if (!draftedResult) return;

    const newEntry: SavedGitHubDraft = {
      id: `${Date.now()}`,
      savedAt: new Date().toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      files: draftedResult.files,
      issueTitle: draftedResult.issueTitle,
      issueMarkdown: draftedResult.issueMarkdown,
      prMarkdown: draftedResult.prMarkdown,
    };

    persistSavedDrafts([newEntry, ...savedDrafts.slice(0, 29)]);
    setSavedNotice("Saved to Orien Drafts!");
    setTimeout(() => setSavedNotice(""), 2500);
  }

  function handleDownloadDraftMarkdown(draft: {
    issueTitle: string;
    issueMarkdown: string;
    prMarkdown: string;
    files?: string[];
  }) {
    const slug =
      draft.issueTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48) || "github-draft";

    triggerBrowserDownload(`${slug}.md`, buildDraftMarkdownBundle(draft));
  }

  function handleDeleteSavedDraft(id: string) {
    persistSavedDrafts(savedDrafts.filter((d) => d.id !== id));
  }

  function handleLoadSavedDraftIntoEditor(draft: SavedGitHubDraft) {
    setDraftedResult({
      issueTitle: draft.issueTitle,
      issueMarkdown: draft.issueMarkdown,
      prMarkdown: draft.prMarkdown,
      files: draft.files,
    });
    setDraftBlockedReason("");
    setDraftError("");
    setModalTab("create");
  }

  function copyDraftText(key: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(key);
    setTimeout(() => setCopiedField(""), 2000);
  }

  return (
    <>
      <section className="flex-1 min-h-0 overflow-auto px-6 pt-[72px] pb-6">
        <div className={showSplit ? "" : "max-w-5xl"}>
          {/* Title + Mode-Aware Actions */}
          <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">Proposal</h2>
              <p className="text-sm text-zinc-500 mt-1">
                {workspaceMode === "project"
                  ? "Project Mode: Apply individual file changes, run ruff & pytest, and self-heal failures."
                  : "Open Source Mode: Direct writes locked. Verify in Proposal Chat, export patch, or draft issue."}
              </p>
            </div>

            {proposal && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {proposal.changes.length > 0 && (
                  <>
                    {/* Project Mode: Granular Apply Controls */}
                    {workspaceMode === "project" && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            handleApplyIndicesToProjectDisk(
                              [safeIndex],
                              safeIndex
                            )
                          }
                          disabled={applyingIndex !== null}
                          title="Apply only this active file change to your local project folder"
                          className="rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3.5 py-1 text-xs font-semibold text-white transition"
                        >
                          {applyingIndex === safeIndex
                            ? "Applying..."
                            : appliedIndices.includes(safeIndex)
                            ? `✓ Applied ${proposal.changes[safeIndex].file
                                .split("/")
                                .pop()}`
                            : `⚡ Apply ${proposal.changes[safeIndex].file
                                .split("/")
                                .pop()}`}
                        </button>

                        {proposal.changes.length > 1 && (
                          <button
                            type="button"
                            onClick={handleOpenProjectApplyModal}
                            disabled={applyingIndex !== null}
                            title="Choose which proposed files to apply to your project folder"
                            className="rounded-full border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-50 px-3 py-1 text-xs font-medium text-emerald-200 transition"
                          >
                            Select Files to Apply...
                          </button>
                        )}
                      </>
                    )}

                    {/* Open Source Mode: 2-Gate GitHub Issue & PR Drafter */}
                    {workspaceMode === "opensource" && (
                      <button
                        type="button"
                        onClick={handleDraftIssueButtonClick}
                        title={
                          isBugAudited
                            ? "Safety audit completed — choose files and draft GitHub Issue & PR"
                            : "Step 1: Runs mandatory safety verification in Proposal Chat first"
                        }
                        className={`rounded-full px-3.5 py-1 text-xs font-medium transition ${
                          isBugAudited
                            ? "bg-blue-600 hover:bg-blue-500 text-white"
                            : "bg-amber-500/20 border border-amber-500/40 text-amber-200 hover:bg-amber-500/30"
                        }`}
                      >
                        {isBugAudited
                          ? "2. Draft GitHub Issue →"
                          : "1. Verify & Draft Issue"}
                      </button>
                    )}

                    {proposal.changes[safeIndex]?.action !== "delete" && (
                      <button
                        type="button"
                        onClick={() => handleDownloadUpdatedFile(safeIndex)}
                        title="Download complete updated file"
                        className="rounded-full border border-emerald-500/30 bg-emerald-500/15 hover:bg-emerald-500/25 px-3 py-1 text-xs font-medium text-emerald-200 transition"
                      >
                        ↓ {proposal.changes[safeIndex].file.split("/").pop()}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleCopyPatch}
                      title="Copy unified diff patch to clipboard"
                      className="rounded-full border border-white/15 bg-white/5 hover:bg-white/10 px-3 py-1 text-xs font-medium text-zinc-200 transition"
                    >
                      Copy .patch
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadPatch}
                      title="Download orien-fix.patch"
                      className="rounded-full border border-white/15 bg-white/5 hover:bg-white/10 px-3 py-1 text-xs font-medium text-zinc-200 transition"
                    >
                      ↓ .patch
                    </button>
                  </>
                )}

                <span className="text-xs text-zinc-400 border border-white/10 rounded-full px-3 py-1">
                  {proposal.changes.length}{" "}
                  {proposal.changes.length === 1 ? "change" : "changes"}
                </span>
              </div>
            )}
          </div>

          {actionNotice && (
            <p className="mb-4 text-xs font-mono text-emerald-400">
              ✓ {actionNotice}
            </p>
          )}
          {actionError && (
            <p className="mb-4 text-xs font-mono text-red-400">
              🛑 {actionError}
            </p>
          )}

          {/* Empty state */}
          {!proposal && (
            <div className="min-h-48 border border-dashed border-zinc-800 rounded-2xl flex flex-col items-center justify-center text-center px-6 py-10">
              <p className="text-sm text-zinc-300">No proposal yet</p>
              <p className="text-xs text-zinc-500 mt-2 max-w-sm">
                Upload a repository, describe a change in Ask Orien, and select
                Propose Edit. Orien&apos;s proposal will appear here.
              </p>
            </div>
          )}

          {/* Proposal */}
          {proposal && (
            <div className="space-y-4">
              <div className="border border-white/10 rounded-xl p-5 bg-white/[0.02]">
                <p className="text-sm text-zinc-300">{proposal.summary}</p>
              </div>

              {/* One-Click Ruff & Pytest Verification + Self-Healing Loop */}
              {proposal.changes.length > 0 && (
                <div className="border border-white/10 rounded-xl p-4 bg-[#0c0c10] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-semibold text-white">
                        🧪 Local Verification Loop (ruff &amp; pytest)
                      </h3>
                      <p className="text-[11px] text-zinc-500">
                        Apply your patch first, then run ruff &amp; pytest on
                        disk. If checks fail, self-heal in 1 click.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleRunLocalChecks}
                      disabled={isRunningChecks || isSelfHealing}
                      className="rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-3.5 py-1.5 text-xs font-semibold text-white transition"
                    >
                      {isRunningChecks
                        ? "Running ruff & pytest..."
                        : "▶ Run Ruff & Pytest"}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      value={localRepoPath}
                      onChange={(e) =>
                        handleLocalRepoPathChange(e.target.value)
                      }
                      placeholder={`Local repo path (e.g., C:/Users/you/${
                        repoName || "project"
                      })`}
                      className="bg-black/40 border border-white/10 focus:border-blue-500 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 outline-none"
                    />

                    <input
                      value={customTestTarget}
                      onChange={(e) => setCustomTestTarget(e.target.value)}
                      placeholder="Optional test path (auto-discovers test_*.py if blank)"
                      className="bg-black/40 border border-white/10 focus:border-blue-500 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 outline-none"
                    />
                  </div>

                  {checkError && (
                    <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                      {checkError}
                    </p>
                  )}

                  {checkResult && (
                    <div className="space-y-2.5 pt-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                          {checkResult.ruff_ran && (
                            <span
                              className={`px-2 py-0.5 rounded border ${
                                checkResult.ruff_passed
                                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                                  : "border-red-500/30 bg-red-500/15 text-red-300"
                              }`}
                            >
                              {checkResult.ruff_passed
                                ? "✓ ruff passed"
                                : "✕ ruff failed"}
                            </span>
                          )}

                          <span
                            className={`px-2 py-0.5 rounded border ${
                              !checkResult.pytest_ran
                                ? "border-zinc-700 bg-zinc-800/60 text-zinc-400"
                                : checkResult.pytest_passed
                                ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                                : "border-red-500/30 bg-red-500/15 text-red-300"
                            }`}
                          >
                            {!checkResult.pytest_ran
                              ? "⚠ no test file matched"
                              : checkResult.pytest_passed
                              ? `✓ pytest passed (${checkResult.discovered_tests.join(
                                  ", "
                                )})`
                              : `✕ pytest failed (${checkResult.discovered_tests.join(
                                  ", "
                                )})`}
                          </span>
                        </div>

                        {/* Self-Heal Button Appears Immediately When Checks Fail */}
                        {!checkResult.overall_passed && (
                          <button
                            type="button"
                            onClick={handleTriggerSelfHeal}
                            disabled={isSelfHealing}
                            className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 px-3.5 py-1.5 text-xs font-bold text-black transition"
                          >
                            {isSelfHealing
                              ? "🩺 Self-Healing Patch..."
                              : "🩺 Self-Heal with Orien"}
                          </button>
                        )}
                      </div>

                      {checkResult.ruff_ran && !checkResult.ruff_passed && (
                        <pre className="rounded-lg border border-red-500/20 bg-black/50 p-3 text-[11px] font-mono text-red-200 whitespace-pre-wrap max-h-36 overflow-y-auto">
                          {checkResult.ruff_output}
                        </pre>
                      )}

                      {checkResult.pytest_output && (
                        <pre
                          className={`rounded-lg border p-3 text-[11px] font-mono whitespace-pre-wrap max-h-44 overflow-y-auto ${
                            checkResult.pytest_passed
                              ? "border-white/10 bg-black/40 text-zinc-300"
                              : "border-red-500/25 bg-black/50 text-red-200"
                          }`}
                        >
                          {checkResult.pytest_output}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )}

              {proposal.changes.length === 0 && (
                <p className="text-sm text-zinc-500">
                  Orien did not propose any changes for this task.
                </p>
              )}

              {showSplit && (
                <>
                  <div className="flex items-center gap-2 overflow-x-auto">
                    {proposal.changes.map((change, index) => {
                      const name = change.file.split("/").pop() || change.file;
                      const isApplied = appliedIndices.includes(index);

                      return (
                        <button
                          key={`${change.action}-${change.file}-${index}`}
                          type="button"
                          onClick={() => setActiveIndex(index)}
                          title={change.file}
                          aria-pressed={index === safeIndex}
                          className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border transition ${
                            index === safeIndex
                              ? "bg-white/10 border-white/20 text-white"
                              : "border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${dotStyles[change.action]}`}
                          />
                          <span>{name}</span>
                          {isApplied && (
                            <span className="text-[10px] font-mono text-emerald-400">
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <SplitView
                    key={`${proposal.changes[safeIndex].action}-${proposal.changes[safeIndex].file}-${safeIndex}`}
                    change={proposal.changes[safeIndex]}
                    selectedFiles={selectedFiles}
                  />
                </>
              )}

              {!showSplit &&
                proposal.changes.map((change, index) => {
                  const shortName = change.file.split("/").pop() || change.file;
                  const isApplied = appliedIndices.includes(index);

                  return (
                    <div
                      key={`${change.action}-${change.file}-${index}`}
                      className="space-y-2"
                    >
                      <ProposalCard change={change} />
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {workspaceMode === "project" && (
                          <button
                            type="button"
                            onClick={() =>
                              handleApplyIndicesToProjectDisk([index], index)
                            }
                            disabled={applyingIndex !== null}
                            className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                              isApplied
                                ? "border border-emerald-500/40 bg-emerald-500/20 text-emerald-200"
                                : "bg-emerald-600 hover:bg-emerald-500 text-white"
                            } disabled:opacity-50`}
                          >
                            {applyingIndex === index
                              ? `Applying ${shortName}...`
                              : isApplied
                              ? `✓ Applied to ${shortName}`
                              : `⚡ Apply only to ${shortName}`}
                          </button>
                        )}

                        {change.action !== "delete" && (
                          <button
                            type="button"
                            onClick={() => handleDownloadUpdatedFile(index)}
                            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-300 transition"
                          >
                            ↓ Download full updated {shortName}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </section>

      {/* Project Mode Selective File Apply Modal */}
      {showProjectApplyModal && proposal && workspaceMode === "project" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#111115] shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">
                  Select Files to Apply to Project
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Choose exactly which proposed changes to write to{" "}
                  <span className="font-mono text-zinc-200">
                    {projectDirHandle?.name || "your project folder"}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowProjectApplyModal(false)}
                className="text-zinc-400 hover:text-white text-sm px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300 font-medium">
                  Selected ({selectedApplyIndices.length} of{" "}
                  {proposal.changes.length})
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedApplyIndices(
                      proposal.changes.map((_, idx) => idx)
                    )
                  }
                  className="font-mono text-emerald-400 hover:text-emerald-300"
                >
                  Select all ({proposal.changes.length})
                </button>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {proposal.changes.map((change, idx) => {
                  const isChecked = selectedApplyIndices.includes(idx);
                  const alreadyApplied = appliedIndices.includes(idx);
                  return (
                    <label
                      key={`apply-${change.action}-${change.file}-${idx}`}
                      className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition ${
                        isChecked
                          ? "border-emerald-500/40 bg-emerald-500/10"
                          : "border-white/10 bg-black/20 hover:bg-white/[0.04]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleApplyIndex(idx)}
                        className="mt-0.5 accent-emerald-500 rounded"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border ${badgeStyles[change.action]}`}
                          >
                            {change.action}
                          </span>
                          <span className="text-xs font-mono text-white truncate">
                            {change.file}
                          </span>
                          {alreadyApplied && (
                            <span className="text-[10px] font-mono text-emerald-400">
                              (already applied)
                            </span>
                          )}
                        </div>
                        {change.reason && (
                          <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">
                            {change.reason}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowProjectApplyModal(false)}
                  className="rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs font-medium text-zinc-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleApplyIndicesToProjectDisk(
                      selectedApplyIndices,
                      "batch"
                    )
                  }
                  disabled={
                    applyingIndex !== null || selectedApplyIndices.length === 0
                  }
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-xs font-semibold text-white transition"
                >
                  {applyingIndex === "batch"
                    ? "Writing to Disk..."
                    : `⚡ Apply ${selectedApplyIndices.length} Selected ${
                        selectedApplyIndices.length === 1 ? "File" : "Files"
                      }`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gate 2: GitHub Issue & PR Drafter Modal with Save & Saved Vault */}
      {showDraftModal && proposal && (
        <div
          onPaste={(e) => {
            const file = e.clipboardData?.files?.[0] ?? null;
            if (file && file.type.startsWith("image/")) {
              handleReferenceImageFile(file);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl border border-white/15 bg-[#111115] shadow-2xl overflow-hidden">
            {/* Modal Header + New Draft / Saved Drafts Tabs */}
            <div className="px-6 py-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-white">
                  GitHub Issue &amp; PR Drafter
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Atomic file selector · Protected by Proposal Chat safety gate
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex rounded-lg bg-black/40 p-1 border border-white/10 text-xs">
                  <button
                    type="button"
                    onClick={() => setModalTab("create")}
                    className={`px-3 py-1 rounded-md transition ${
                      modalTab === "create"
                        ? "bg-white/10 text-white font-medium"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    New Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalTab("saved")}
                    className={`px-3 py-1 rounded-md transition flex items-center gap-1.5 ${
                      modalTab === "saved"
                        ? "bg-white/10 text-white font-medium"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    <span>Saved Drafts</span>
                    <span className="rounded-full bg-blue-500/20 border border-blue-500/30 px-1.5 py-0.2 font-mono text-[10px] text-blue-300">
                      {savedDrafts.length}
                    </span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowDraftModal(false)}
                  className="text-zinc-400 hover:text-white text-sm px-2 py-1"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {modalTab === "saved" ? (
                savedDrafts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center space-y-2">
                    <p className="text-sm text-zinc-300">No saved drafts yet</p>
                    <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                      Generate a verified GitHub Issue &amp; PR draft and click{" "}
                      <span className="text-zinc-300 font-medium">
                        Save Draft
                      </span>{" "}
                      to store it here across browser refreshes.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {savedDrafts.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-white/10 bg-white/[0.025] p-4 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white">
                              {item.issueTitle}
                            </p>
                            <p className="text-[11px] font-mono text-zinc-400 mt-1 truncate">
                              {item.savedAt} · {item.files.join(", ")}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteSavedDraft(item.id)}
                            title="Delete saved draft"
                            className="text-xs text-zinc-500 hover:text-red-400 transition shrink-0"
                          >
                            Delete
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleLoadSavedDraftIntoEditor(item)}
                            className="rounded-lg bg-blue-600/20 border border-blue-500/30 hover:bg-blue-600/30 px-2.5 py-1 text-[11px] font-medium text-blue-200 transition"
                          >
                            Open Draft
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              copyDraftText(
                                `saved-issue-${item.id}`,
                                item.issueMarkdown
                              )
                            }
                            className="rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-2.5 py-1 text-[11px] text-zinc-200 transition"
                          >
                            {copiedField === `saved-issue-${item.id}`
                              ? "✓ Issue Copied"
                              : "Copy Issue"}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              copyDraftText(
                                `saved-pr-${item.id}`,
                                item.prMarkdown
                              )
                            }
                            className="rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-2.5 py-1 text-[11px] text-zinc-200 transition"
                          >
                            {copiedField === `saved-pr-${item.id}`
                              ? "✓ PR Copied"
                              : "Copy PR"}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDownloadDraftMarkdown(item)}
                            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 text-[11px] font-medium text-emerald-300 transition"
                          >
                            ↓ .md
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <>
                  {/* Step A: Choose Which Proposed Files / Fixes to Include */}
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-200">
                        Select Files to Include ({selectedDraftIndices.length}{" "}
                        of {proposal.changes.length})
                      </span>
                      {proposal.changes.length > 1 && (
                        <button
                          type="button"
                          onClick={selectAllDraftIndices}
                          className="text-[11px] font-mono text-blue-400 hover:text-blue-300 transition"
                        >
                          Select all ({proposal.changes.length})
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {proposal.changes.map((change, idx) => {
                        const isChecked = selectedDraftIndices.includes(idx);
                        return (
                          <label
                            key={`${change.action}-${change.file}-${idx}`}
                            className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${
                              isChecked
                                ? "border-blue-500/40 bg-blue-500/10"
                                : "border-white/10 bg-black/20 hover:bg-white/[0.04]"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleDraftIndex(idx)}
                              className="mt-0.5 accent-blue-500 rounded"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border ${badgeStyles[change.action]}`}
                                >
                                  {change.action}
                                </span>
                                <span className="text-xs font-mono text-white truncate">
                                  {change.file}
                                </span>
                              </div>
                              {change.reason && (
                                <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">
                                  {change.reason}
                                </p>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Step B: Organization Screenshot Reference Input */}
                  <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-zinc-200">
                        Organization Style Reference (Optional Screenshot)
                      </p>
                      <label className="cursor-pointer rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1 text-xs font-medium text-white transition">
                        Upload Image
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) =>
                            handleReferenceImageFile(e.target.files?.[0] ?? null)
                          }
                        />
                      </label>
                    </div>

                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      Paste (
                      <kbd className="px-1 py-0.5 bg-white/10 rounded">
                        Ctrl+V
                      </kbd>
                      ) or upload a screenshot of an existing Issue/PR from this
                      organization. Orien will mirror its headings, tone, and
                      template rules.
                    </p>

                    {referenceImageUrl && (
                      <div className="pt-2 flex items-center justify-between gap-3">
                        <img
                          src={referenceImageUrl}
                          alt="Org reference"
                          className="max-h-28 rounded-lg border border-white/15 object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => setReferenceImageUrl(null)}
                          className="text-xs text-red-400 hover:underline"
                        >
                          Remove image
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Optional AI Disclosure Toggle */}
                  <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeAiDisclosure}
                      onChange={(e) => setIncludeAiDisclosure(e.target.checked)}
                      className="accent-blue-500 rounded"
                    />
                    Force-include transparent AI assistance note (auto-detected
                    if shown in screenshot)
                  </label>

                  {/* Generate Button */}
                  <button
                    type="button"
                    onClick={handleGenerateIssueDraft}
                    disabled={isDraftingIssue || selectedDraftIndices.length === 0}
                    className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed py-2.5 text-xs font-semibold text-white transition"
                  >
                    {isDraftingIssue
                      ? "Verifying Proposal Chat Audit & Drafting..."
                      : selectedDraftIndices.length === 0
                      ? "Select at least 1 file above"
                      : `Verify Safety Audit & Draft for ${selectedDraftIndices.length} ${
                          selectedDraftIndices.length === 1 ? "File" : "Files"
                        }`}
                  </button>

                  {/* Hard Server-Side Safety Block Alert */}
                  {draftBlockedReason && (
                    <div className="rounded-xl border border-red-500/40 bg-red-500/15 p-4 space-y-1.5">
                      <p className="text-xs font-bold text-red-300">
                        🛑 Draft Blocked by Orien Safety Gatekeeper
                      </p>
                      <p className="text-xs text-red-200 leading-relaxed">
                        {draftBlockedReason}
                      </p>
                    </div>
                  )}

                  {draftError && (
                    <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                      {draftError}
                    </p>
                  )}

                  {/* Verified Draft Output + Save & Download Actions */}
                  {draftedResult && (
                    <div className="space-y-4 pt-2">
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-emerald-300">
                          ✅ Passed Proposal Chat Safety Gate
                        </span>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleSaveDraftToVault}
                            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1 text-xs font-semibold text-white transition"
                          >
                            {savedNotice ? `✓ ${savedNotice}` : "💾 Save Draft"}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleDownloadDraftMarkdown(draftedResult)
                            }
                            className="rounded-lg border border-white/15 bg-white/10 hover:bg-white/15 px-3 py-1 text-xs font-medium text-white transition"
                          >
                            ↓ Download .md
                          </button>
                        </div>
                      </div>

                      {/* Issue Title */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-zinc-300">
                            Issue Title
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              copyDraftText("title", draftedResult.issueTitle)
                            }
                            className="text-[11px] font-mono text-blue-400 hover:text-blue-300"
                          >
                            {copiedField === "title"
                              ? "✓ Copied"
                              : "Copy Title"}
                          </button>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/40 px-3.5 py-2 text-xs font-mono text-white">
                          {draftedResult.issueTitle}
                        </div>
                      </div>

                      {/* GitHub Issue Body */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-zinc-300">
                            GitHub Issue Markdown
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              copyDraftText(
                                "issue",
                                draftedResult.issueMarkdown
                              )
                            }
                            className="text-[11px] font-mono text-blue-400 hover:text-blue-300"
                          >
                            {copiedField === "issue"
                              ? "✓ Copied"
                              : "Copy Issue"}
                          </button>
                        </div>
                        <pre className="rounded-xl border border-white/10 bg-black/40 p-3.5 text-xs font-mono text-zinc-200 whitespace-pre-wrap max-h-48 overflow-y-auto">
                          {draftedResult.issueMarkdown}
                        </pre>
                      </div>

                      {/* GitHub PR Body */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-zinc-300">
                            Pull Request Markdown
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              copyDraftText("pr", draftedResult.prMarkdown)
                            }
                            className="text-[11px] font-mono text-blue-400 hover:text-blue-300"
                          >
                            {copiedField === "pr" ? "✓ Copied" : "Copy PR"}
                          </button>
                        </div>
                        <pre className="rounded-xl border border-white/10 bg-black/40 p-3.5 text-xs font-mono text-zinc-200 whitespace-pre-wrap max-h-48 overflow-y-auto">
                          {draftedResult.prMarkdown}
                        </pre>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}