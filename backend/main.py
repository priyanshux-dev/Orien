import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field

load_dotenv()

app = FastAPI(title="Orien Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. Ask Orien (/chat & /draft-issue) -> CoArena
CHAT_API_KEY = os.getenv("AI_API_KEY") or os.getenv("OPENAI_API_KEY")
CHAT_BASE_URL = os.getenv("AI_BASE_URL", "https://coarena.ai/api/v1")
CHAT_MODEL = os.getenv("AI_MODEL", "gemini-3-8-flash")
CHAT_MAX_OUTPUT_TOKENS = int(os.getenv("AI_MAX_OUTPUT_TOKENS", "16384"))
CHAT_REASONING_EFFORT = os.getenv("AI_REASONING_EFFORT", "medium")

# 2. Orien Carbon (Fast 6k Edits) -> CoArena DeepSeek V4.1 Flash
CARBON_API_KEY = os.getenv("CARBON_AI_API_KEY") or CHAT_API_KEY
CARBON_BASE_URL = os.getenv("CARBON_AI_BASE_URL", "https://coarena.ai/api/v1")
CARBON_MODEL = os.getenv("CARBON_AI_MODEL", "deepseek-v4-1-flash-1017")
CARBON_MAX_OUTPUT_TOKENS = int(os.getenv("CARBON_MAX_OUTPUT_TOKENS", "16384"))
CARBON_REASONING_EFFORT = os.getenv("CARBON_REASONING_EFFORT", "medium")

# 3. Orien Horizon (Deep 30k Repo Scans) -> Google AI Studio Gemini 4 Hydrogen
HORIZON_API_KEY = os.getenv("HORIZON_AI_API_KEY")
HORIZON_BASE_URL = os.getenv(
    "HORIZON_AI_BASE_URL",
    "https://generativelanguage.googleapis.com/v1beta/openai/",
)
HORIZON_MODEL = os.getenv("HORIZON_AI_MODEL", "gemini-4-hydrogen")
HORIZON_MAX_OUTPUT_TOKENS = int(os.getenv("HORIZON_MAX_OUTPUT_TOKENS", "65536"))
HORIZON_REASONING_EFFORT = os.getenv("HORIZON_REASONING_EFFORT", "medium")

# Strict Server-Side Guardrails (~4 chars per token)
CARBON_MAX_INPUT_TOKENS = 6000
CARBON_MAX_CONTEXT_CHARS = 22000

HORIZON_MAX_INPUT_TOKENS = 30000
HORIZON_MAX_CONTEXT_CHARS = 115000


class ChatRequest(BaseModel):
    message: str
    repository_context: str = ""


class EditRequest(BaseModel):
    message: str
    repository_context: str = ""
    engine: Literal["carbon", "horizon"] = "carbon"
    reasoning_effort: Literal["low", "medium", "high"] | None = None


class ProposedChange(BaseModel):
    action: Literal["modify", "create", "delete"]
    file: str
    reason: str = ""
    original_code: str = ""
    proposed_code: str = ""


class EditResponse(BaseModel):
    success: bool
    summary: str
    changes: list[ProposedChange]
    engine_used: str = "carbon"


class DraftChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class DraftIssueRequest(BaseModel):
    proposal_summary: str
    changes: list[ProposedChange]
    chat_history: list[DraftChatTurn] = Field(default_factory=list)
    reference_image_url: str | None = None
    include_ai_disclosure: bool = False


class DraftIssueResponse(BaseModel):
    success: bool
    safe: bool
    blocked_reason: str = ""
    issue_title: str = ""
    issue_markdown: str = ""
    pr_markdown: str = ""


class RunChecksRequest(BaseModel):
    project_root: str
    target_files: list[str] = Field(default_factory=list)
    run_ruff: bool = True
    run_pytest: bool = True
    custom_pytest_target: str = ""


class RunChecksResponse(BaseModel):
    success: bool
    overall_passed: bool
    ruff_ran: bool = False
    ruff_passed: bool = True
    ruff_output: str = ""
    pytest_ran: bool = False
    pytest_passed: bool = True
    pytest_output: str = ""
    discovered_tests: list[str] = Field(default_factory=list)
    python_used: str = ""


def get_chat_client() -> OpenAI:
    if not CHAT_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="Missing AI_API_KEY in backend/.env.",
        )
    return OpenAI(api_key=CHAT_API_KEY, base_url=CHAT_BASE_URL)


def get_edit_client(engine: Literal["carbon", "horizon"]) -> OpenAI:
    if engine == "horizon":
        if not HORIZON_API_KEY:
            raise HTTPException(
                status_code=500,
                detail="Missing HORIZON_AI_API_KEY in backend/.env for Orien Horizon (Google AI Studio).",
            )
        return OpenAI(api_key=HORIZON_API_KEY, base_url=HORIZON_BASE_URL)

    if not CARBON_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="Missing CARBON_AI_API_KEY in backend/.env for Orien Carbon.",
        )
    return OpenAI(api_key=CARBON_API_KEY, base_url=CARBON_BASE_URL)


def estimate_tokens(text: str) -> int:
    return max(1, (len(text) + 3) // 4) if text else 0


def normalize_local_path(raw_path: str) -> Path:
    cleaned = raw_path.strip().strip('"').strip("'")
    # Convert Git Bash /c/Users/... style paths to C:/Users/... on Windows
    if os.name == "nt":
        match = re.match(r"^/([a-zA-Z])/(.*)$", cleaned)
        if match:
            cleaned = f"{match.group(1).upper()}:/{match.group(2)}"
    return Path(cleaned).expanduser().resolve()


def resolve_project_python(root: Path) -> str:
    candidates = [
        root / ".venv" / "Scripts" / "python.exe",
        root / "venv" / "Scripts" / "python.exe",
        root / ".venv" / "bin" / "python",
        root / "venv" / "bin" / "python",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return sys.executable


def resolve_relative_repo_file(root: Path, raw_file: str) -> str | None:
    norm = raw_file.replace("\\", "/").lstrip("/")
    direct = root / norm
    if direct.exists():
        return norm

    # Strip leading repo folder prefix if present (e.g., "mesa/mesa/model.py" -> "mesa/model.py")
    parts = norm.split("/")
    if len(parts) > 1 and parts[0].lower() == root.name.lower():
        stripped = "/".join(parts[1:])
        if (root / stripped).exists():
            return stripped
    return None


def discover_matching_tests(root: Path, resolved_files: list[str]) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()

    for rel_path in resolved_files:
        p = Path(rel_path)
        if p.name.startswith("test_") and p.suffix == ".py":
            if rel_path not in seen:
                seen.add(rel_path)
                found.append(rel_path)
            continue

        if p.suffix != ".py":
            continue

        expected_test_name = f"test_{p.stem}.py"
        for match in root.rglob(expected_test_name):
            # Ignore virtualenvs & caches
            if any(
                part in {".venv", "venv", ".git", "__pycache__", "node_modules"}
                for part in match.parts
            ):
                continue
            rel_match = match.relative_to(root).as_posix()
            if rel_match not in seen:
                seen.add(rel_match)
                found.append(rel_match)

    return found[:8]


@app.get("/")
def read_root():
    return {
        "status": "Orien backend is running",
        "engines": {
            "carbon": {"model": CARBON_MODEL, "max_input_tokens": CARBON_MAX_INPUT_TOKENS},
            "horizon": {"model": HORIZON_MODEL, "max_input_tokens": HORIZON_MAX_INPUT_TOKENS},
        },
    }


@app.get("/health")
def health_check():
    return {
        "ok": True,
        "ask_orien": {
            "configured": bool(CHAT_API_KEY),
            "model": CHAT_MODEL,
        },
        "orien_carbon": {
            "configured": bool(CARBON_API_KEY),
            "model": CARBON_MODEL,
            "max_input_tokens": CARBON_MAX_INPUT_TOKENS,
            "reasoning_effort": CARBON_REASONING_EFFORT,
        },
        "orien_horizon": {
            "configured": bool(HORIZON_API_KEY),
            "model": HORIZON_MODEL,
            "max_input_tokens": HORIZON_MAX_INPUT_TOKENS,
            "max_output_tokens": HORIZON_MAX_OUTPUT_TOKENS,
            "reasoning_effort": HORIZON_REASONING_EFFORT,
        },
    }


@app.post("/chat")
def chat_with_orien(payload: ChatRequest):
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    client = get_chat_client()

    system_prompt = (
        "You are Orien, a concise, accurate AI engineering assistant. "
        "Base your answers strictly on the provided repository context or diff. "
        "Do not invent files, line numbers, or test results that are not present."
    )

    user_prompt = message
    if payload.repository_context.strip():
        user_prompt = (
            f"CONTEXT:\n{payload.repository_context[:HORIZON_MAX_CONTEXT_CHARS]}\n\n"
            f"DEVELOPER QUESTION:\n{message}"
        )

    try:
        response = client.chat.completions.create(
            model=CHAT_MODEL,
            reasoning_effort=CHAT_REASONING_EFFORT,
            max_tokens=CHAT_MAX_OUTPUT_TOKENS,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        answer = response.choices[0].message.content or ""
        return {"success": True, "answer": answer.strip()}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Orien chat error: {exc}") from exc


@app.post("/edit", response_model=EditResponse)
def propose_edit(payload: EditRequest):
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Problem description cannot be empty.")

    engine = payload.engine
    is_horizon = engine == "horizon"

    max_tokens_limit = HORIZON_MAX_INPUT_TOKENS if is_horizon else CARBON_MAX_INPUT_TOKENS
    max_chars_limit = HORIZON_MAX_CONTEXT_CHARS if is_horizon else CARBON_MAX_CONTEXT_CHARS
    model_name = HORIZON_MODEL if is_horizon else CARBON_MODEL
    max_output = HORIZON_MAX_OUTPUT_TOKENS if is_horizon else CARBON_MAX_OUTPUT_TOKENS
    effort = payload.reasoning_effort or (
        HORIZON_REASONING_EFFORT if is_horizon else CARBON_REASONING_EFFORT
    )

    total_estimated = estimate_tokens(payload.repository_context) + estimate_tokens(message) + 350
    if total_estimated > max_tokens_limit or len(payload.repository_context) > max_chars_limit:
        engine_label = "Orien Horizon" if is_horizon else "Orien Carbon"
        raise HTTPException(
            status_code=413,
            detail=(
                f"Request blocked by {engine_label} guardrail: ~{total_estimated:,} estimated "
                f"input tokens exceeds the {max_tokens_limit:,}-token cap."
            ),
        )

    client = get_edit_client(engine)

    system_prompt = (
        "You are Orien, a surgical code-editing engine. "
        "Analyze the provided files and return ONLY valid JSON matching this exact schema:\n"
        "{\n"
        '  "summary": "Concise 1-2 sentence summary of the fix",\n'
        '  "changes": [\n'
        "    {\n"
        '      "action": "modify" | "create" | "delete",\n'
        '      "file": "exact/relative/path.ext",\n'
        '      "reason": "Why this change is required",\n'
        '      "original_code": "Exact verbatim lines from the source file to replace (empty for create)",\n'
        '      "proposed_code": "Exact replacement lines (empty for delete)"\n'
        "    }\n"
        "  ]\n"
        "}\n"
        "CRITICAL RULES:\n"
        "1. Output raw JSON only—no markdown fences, no commentary outside JSON.\n"
        "2. For 'modify', original_code MUST match the provided file content character-for-character.\n"
        "3. Only propose real, verified bug fixes. If no bug exists, return an empty changes list."
    )

    user_prompt = (
        f"REPOSITORY FILES:\n{payload.repository_context}\n\n"
        f"TASK:\n{message}"
    )

    try:
        response = client.chat.completions.create(
            model=model_name,
            reasoning_effort=effort,
            max_tokens=max_output,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        raw_text = (response.choices[0].message.content or "").strip()

        if raw_text.startswith("```"):
            lines = raw_text.splitlines()
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            raw_text = "\n".join(lines).strip()

        parsed = json.loads(raw_text)
        changes = [ProposedChange(**item) for item in parsed.get("changes", [])]

        return EditResponse(
            success=True,
            summary=parsed.get("summary", "Proposed code changes."),
            changes=changes,
            engine_used=engine,
        )
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Model returned non-JSON output: {exc}",
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Orien edit error: {exc}") from exc


@app.post("/draft-issue", response_model=DraftIssueResponse)
def draft_github_issue(payload: DraftIssueRequest):
    if not payload.chat_history:
        raise HTTPException(
            status_code=400,
            detail="Safety audit required in Proposal Chat before drafting a GitHub Issue.",
        )

    client = get_chat_client()

    changes_block = "\n\n---\n\n".join(
        f"FILE: {c.file} ({c.action})\n"
        f"REASON: {c.reason}\n"
        f"ORIGINAL:\n{c.original_code}\n"
        f"PROPOSED:\n{c.proposed_code}"
        for c in payload.changes
    )

    chat_block = "\n\n".join(
        f"{turn.role.upper()}: {turn.content}"
        for turn in payload.chat_history[-12:]
    )

    system_prompt = (
        "You are Orien's Release & Open-Source Maintainer Gatekeeper. "
        "You have TWO strict duties:\n"
        "DUTY 1 — MANDATORY SAFETY GATE:\n"
        "Examine the PROPOSAL CHAT AUDIT and PROPOSED CHANGES carefully. "
        "If Proposal Chat concluded that the bug is a false positive, invalid, unsafe, "
        "causes regressions, or needs further core investigation before opening an issue/PR, "
        "you MUST block drafting by returning:\n"
        '{"safe": false, "blocked_reason": "Clear 1-2 sentence explanation of why it was blocked", '
        '"issue_title": "", "issue_markdown": "", "pr_markdown": ""}\n\n'
        "DUTY 2 — ORGANIZATION-MATCHED ISSUE & PR DRAFTER (ONLY IF safe IS true):\n"
        "If and ONLY if the audit confirms the bug is real and the fix is safe:\n"
        "1. If a reference screenshot of the organization's issue/PR format is attached, "
        "mirror its exact section headings, structure, tone, and conventions.\n"
        "2. Do NOT add an AI-disclosure section unless the organization's reference screenshot "
        "explicitly asks for AI disclosure OR include_ai_disclosure is true.\n"
        "3. Never fabricate test outputs, benchmark numbers, or unverified claims.\n"
        "4. Return ONLY valid JSON matching:\n"
        "{\n"
        '  "safe": true,\n'
        '  "blocked_reason": "",\n'
        '  "issue_title": "Concise, maintainer-ready issue title",\n'
        '  "issue_markdown": "Complete GitHub Issue body in clean Markdown",\n'
        '  "pr_markdown": "Complete GitHub Pull Request body in clean Markdown"\n'
        "}"
    )

    text_prompt = (
        f"INCLUDE AI DISCLOSURE OVERRIDE: {payload.include_ai_disclosure}\n\n"
        f"PROPOSAL SUMMARY:\n{payload.proposal_summary}\n\n"
        f"PROPOSED DIFFS:\n{changes_block}\n\n"
        f"PROPOSAL CHAT AUDIT HISTORY:\n{chat_block}"
    )

    user_content: str | list[dict] = text_prompt
    if payload.reference_image_url and payload.reference_image_url.startswith("data:image/"):
        user_content = [
            {
                "type": "text",
                "text": (
                    text_prompt
                    + "\n\nREFERENCE SCREENSHOT ATTACHED: Match the exact formatting, headings, "
                    "and conventions shown in this organization's Issue/PR screenshot."
                ),
            },
            {
                "type": "image_url",
                "image_url": {"url": payload.reference_image_url},
            },
        ]

    try:
        response = client.chat.completions.create(
            model=CHAT_MODEL,
            reasoning_effort=CHAT_REASONING_EFFORT,
            max_tokens=CHAT_MAX_OUTPUT_TOKENS,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
        )
        raw_text = (response.choices[0].message.content or "").strip()

        if raw_text.startswith("```"):
            lines = raw_text.splitlines()
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            raw_text = "\n".join(lines).strip()

        parsed = json.loads(raw_text)
        is_safe = bool(parsed.get("safe", False))

        return DraftIssueResponse(
            success=True,
            safe=is_safe,
            blocked_reason=parsed.get("blocked_reason", ""),
            issue_title=parsed.get("issue_title", "") if is_safe else "",
            issue_markdown=parsed.get("issue_markdown", "") if is_safe else "",
            pr_markdown=parsed.get("pr_markdown", "") if is_safe else "",
        )
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Model returned non-JSON output while drafting issue: {exc}",
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Draft issue error: {exc}") from exc


@app.post("/run-checks", response_model=RunChecksResponse)
def run_local_checks(payload: RunChecksRequest):
    if not payload.project_root.strip():
        raise HTTPException(status_code=400, detail="Local repository folder path is required.")

    root = normalize_local_path(payload.project_root)
    if not root.is_dir():
        raise HTTPException(
            status_code=400,
            detail=f"Directory not found on disk: {root}",
        )

    python_exe = resolve_project_python(root)

    resolved_targets: list[str] = []
    for raw_file in payload.target_files:
        rel = resolve_relative_repo_file(root, raw_file)
        if rel and rel not in resolved_targets:
            resolved_targets.append(rel)

    ruff_ran = False
    ruff_passed = True
    ruff_output = ""

    pytest_ran = False
    pytest_passed = True
    pytest_output = ""
    discovered_tests: list[str] = []

    # 1. Run Ruff Check on target files (or whole repo if none specified)
    if payload.run_ruff:
        py_targets = [f for f in resolved_targets if f.endswith(".py")]
        ruff_cmd = [python_exe, "-m", "ruff", "check", *(py_targets if py_targets else ["."])]
        try:
            proc = subprocess.run(
                ruff_cmd,
                cwd=str(root),
                capture_output=True,
                text=True,
                timeout=30,
            )
            ruff_ran = True
            ruff_passed = proc.returncode == 0
            combined = (proc.stdout + "\n" + proc.stderr).strip()
            ruff_output = combined or ("All ruff checks passed!" if ruff_passed else "Ruff check failed.")
        except FileNotFoundError:
            ruff_ran = True
            ruff_passed = False
            ruff_output = f"ruff not installed in {python_exe}."
        except subprocess.TimeoutExpired:
            ruff_ran = True
            ruff_passed = False
            ruff_output = "ruff check timed out after 30s."

    # 2. Discover & Run Pytest
    if payload.run_pytest:
        custom = payload.custom_pytest_target.strip()
        if custom:
            discovered_tests = [custom]
        else:
            discovered_tests = discover_matching_tests(root, resolved_targets)

        if not discovered_tests:
            pytest_ran = False
            pytest_passed = True
            pytest_output = (
                "No matching test_*.py file auto-discovered. "
                "Enter a specific test path (e.g., tests/test_model.py) to run pytest."
            )
        else:
            pytest_cmd = [python_exe, "-m", "pytest", "-q", *discovered_tests]
            try:
                proc = subprocess.run(
                    pytest_cmd,
                    cwd=str(root),
                    capture_output=True,
                    text=True,
                    timeout=60,
                )
                pytest_ran = True
                pytest_passed = proc.returncode == 0
                combined = (proc.stdout + "\n" + proc.stderr).strip()
                pytest_output = combined[-6000:] if len(combined) > 6000 else combined
            except subprocess.TimeoutExpired:
                pytest_ran = True
                pytest_passed = False
                pytest_output = "pytest timed out after 60s."

    overall_passed = ruff_passed and pytest_passed

    return RunChecksResponse(
        success=True,
        overall_passed=overall_passed,
        ruff_ran=ruff_ran,
        ruff_passed=ruff_passed,
        ruff_output=ruff_output,
        pytest_ran=pytest_ran,
        pytest_passed=pytest_passed,
        pytest_output=pytest_output,
        discovered_tests=discovered_tests,
        python_used=python_exe,
    )