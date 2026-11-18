import json
import os
import re
import logging
from typing import Literal, Any
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from json_repair import repair_json
from openai import AsyncOpenAI, BadRequestError
from pydantic import BaseModel, ValidationError


# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger("orien")

app = FastAPI(
    title="Orien Backend",
    description="Dual-Engine AI Repository Editing Agent (Orien Carbon & Orien Horizon)",
    version="1.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# --------------------------------------------------
# HARD INPUT TOKEN GUARDRAILS (CARBON 6K / HORIZON 30K)
# --------------------------------------------------

ENGINE_MAX_INPUT_TOKENS: dict[str, int] = {
    "carbon": 6_800,    # 6,000 token budget + small tokenizer buffer
    "horizon": 31_500,  # 30,000 token budget + small tokenizer buffer
}


# --------------------------------------------------
# REQUEST MODELS
# --------------------------------------------------

class ChatRequest(BaseModel):
    message: str
    repository_context: str = ""


class EditRequest(BaseModel):
    message: str
    repository_context: str = ""
    engine: Literal["carbon", "horizon"] = "carbon"
    reasoning_effort: str | None = None


class EditChange(BaseModel):
    file: str
    action: Literal["modify", "create", "delete"]
    reason: str
    original_code: str = ""
    proposed_code: str = ""


# --------------------------------------------------
# MULTI-ENGINE AI PROVIDERS (CHAT, CARBON, HORIZON)
# --------------------------------------------------

def parse_reasoning_effort(raw_value: str | None) -> str | None:
    if not raw_value:
        return None
    value = raw_value.strip().lower()
    if value in ("off", "none", "disabled", ""):
        return None
    if value in ("minimal", "low", "medium", "high"):
        return value
    return "medium"


def get_chat_client() -> AsyncOpenAI:
    api_key = os.getenv("AI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="AI_API_KEY is missing. Check your backend .env file.",
        )

    return AsyncOpenAI(
        api_key=api_key,
        base_url=os.getenv("AI_BASE_URL", "https://coarena.ai/api/v1"),
        timeout=float(os.getenv("AI_TIMEOUT_SECONDS", "300")),
        max_retries=0,
    )


def get_chat_model() -> str:
    return os.getenv("AI_MODEL", "gemini-3-8-flash")


def get_chat_max_tokens() -> int:
    return int(os.getenv("AI_MAX_OUTPUT_TOKENS", "16384"))


def get_chat_reasoning_effort() -> str | None:
    return parse_reasoning_effort(os.getenv("AI_REASONING_EFFORT", "low"))


def get_engine_config(
    engine: Literal["carbon", "horizon"],
    effort_override: str | None = None,
) -> tuple[AsyncOpenAI, str, int, str | None]:
    """
    Returns (client, model, max_output_tokens, reasoning_effort) for:
      - carbon: CoArena + DeepSeek V4.1 Flash (6k cap, surgical edits)
      - horizon: Google AI Studio + Gemini 4 Hydrogen (30k cap, 64k output)
    """
    timeout = float(os.getenv("AI_TIMEOUT_SECONDS", "300"))

    if engine == "horizon":
        api_key = os.getenv("HORIZON_AI_API_KEY")
        if not api_key:
            raise HTTPException(
                status_code=500,
                detail="HORIZON_AI_API_KEY is missing in backend/.env. Add your Google AI Studio API key to use Orien Horizon.",
            )
        base_url = os.getenv(
            "HORIZON_AI_BASE_URL",
            "https://generativelanguage.googleapis.com/v1beta/openai/",
        )
        model = os.getenv("HORIZON_AI_MODEL", "gemini-4-hydrogen")
        max_tokens = int(os.getenv("HORIZON_MAX_OUTPUT_TOKENS", "65536"))
        default_effort = os.getenv("HORIZON_REASONING_EFFORT", "medium")
    else:
        api_key = (
            os.getenv("CARBON_AI_API_KEY")
            or os.getenv("EDIT_AI_API_KEY")
            or os.getenv("AI_API_KEY")
        )
        if not api_key:
            raise HTTPException(
                status_code=500,
                detail="CARBON_AI_API_KEY (or AI_API_KEY) is missing in backend/.env.",
            )
        base_url = (
            os.getenv("CARBON_AI_BASE_URL")
            or os.getenv("EDIT_AI_BASE_URL")
            or os.getenv("AI_BASE_URL", "https://coarena.ai/api/v1")
        )
        model = (
            os.getenv("CARBON_AI_MODEL")
            or os.getenv("EDIT_AI_MODEL")
            or "deepseek-v4-1-flash-1017"
        )
        max_tokens = int(
            os.getenv("CARBON_MAX_OUTPUT_TOKENS")
            or os.getenv("EDIT_MAX_OUTPUT_TOKENS", "16384")
        )
        default_effort = (
            os.getenv("CARBON_REASONING_EFFORT")
            or os.getenv("EDIT_REASONING_EFFORT", "medium")
        )

    client = AsyncOpenAI(
        api_key=api_key,
        base_url=base_url,
        timeout=timeout,
        max_retries=0,
    )

    effort = (
        parse_reasoning_effort(effort_override)
        if effort_override is not None
        else parse_reasoning_effort(default_effort)
    )

    return client, model, max_tokens, effort


async def call_model_once(
    client: AsyncOpenAI,
    effort: str | None,
    **kwargs,
):
    """
    Executes strictly 1 completion call with the specified reasoning effort.
    Falls back cleanly only if the gateway/model rejects reasoning_effort (HTTP 400).
    """
    if not effort:
        return await client.chat.completions.create(**kwargs)

    try:
        return await client.chat.completions.create(
            **kwargs,
            reasoning_effort=effort,
        )
    except BadRequestError as err:
        if "reasoning" in str(err).lower():
            logger.warning(
                "Model %s does not support reasoning_effort=%s; calling without it.",
                kwargs.get("model"),
                effort,
            )
            return await client.chat.completions.create(**kwargs)
        raise


# --------------------------------------------------
# ROBUST JSON EXTRACTION
# --------------------------------------------------

def extract_json(text: str) -> dict:
    if not isinstance(text, str) or not text.strip():
        raise ValueError("The AI returned an empty response.")

    cleaned = text.strip()

    cleaned = re.sub(
        r"^\s*```(?:json)?\s*",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\s*```\s*$", "", cleaned).strip()

    try:
        result = json.loads(cleaned)
        if isinstance(result, dict):
            return result
    except json.JSONDecodeError:
        pass

    start = cleaned.find("{")
    if start == -1:
        raise ValueError("No JSON object was found in the AI response.")

    depth = 0
    in_string = False
    escaped = False
    end = -1

    for index in range(start, len(cleaned)):
        char = cleaned[index]

        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                end = index
                break

    if end != -1:
        candidate = cleaned[start:end + 1]

        try:
            result = json.loads(candidate)
            if isinstance(result, dict):
                return result
        except json.JSONDecodeError:
            pass

        try:
            result = repair_json(candidate, return_objects=True)
            if isinstance(result, dict):
                return result
        except Exception as error:
            logger.warning("JSON repair failed: %s", error)

    try:
        result = repair_json(cleaned, return_objects=True)
        if isinstance(result, dict):
            return result
    except Exception as error:
        logger.warning("Full response repair failed: %s", error)

    raise ValueError(
        "The AI response could not be converted into a valid JSON object."
    )


# --------------------------------------------------
# AI RESPONSE EXTRACTION
# --------------------------------------------------

def get_message_content(message: Any) -> str:
    content = message.content

    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                value = item.get("text", "")
            else:
                value = getattr(item, "text", "")

            if value:
                parts.append(value)

        return "\n".join(parts).strip()

    return ""


def format_usage_summary(response: Any) -> str:
    usage = getattr(response, "usage", None)
    if not usage:
        return "usage=unknown"

    prompt_tok = getattr(usage, "prompt_tokens", "?")
    comp_tok = getattr(usage, "completion_tokens", "?")
    total_tok = getattr(usage, "total_tokens", "?")
    return f"in={prompt_tok}, out={comp_tok}, total={total_tok}"


# --------------------------------------------------
# VALIDATE EDIT PROPOSAL (SUPPORTS PARTIAL SALVAGE ON LENGTH CUTOFF)
# --------------------------------------------------

def normalize_newlines(text: str) -> str:
    return text.replace("\r\n", "\n")


def validate_single_change(change: Any, normalized_context: str, index: int) -> dict:
    if not isinstance(change, dict):
        raise ValueError(f"Change number {index + 1} is not a valid object.")

    change_data = {
        **change,
        "original_code": change.get("original_code") or "",
        "proposed_code": change.get("proposed_code") or "",
    }

    try:
        parsed_change = EditChange.model_validate(change_data)
    except ValidationError as error:
        raise ValueError(
            f"Invalid change at position {index + 1}: {error}"
        ) from error

    if not parsed_change.file.strip():
        raise ValueError(f"Change number {index + 1} has an empty file path.")

    if parsed_change.action == "modify":
        if not parsed_change.original_code.strip():
            raise ValueError(
                f"Modify proposal for {parsed_change.file} is missing original_code snippet."
            )

        if not parsed_change.proposed_code.strip():
            raise ValueError(
                f"Modify proposal for {parsed_change.file} is missing proposed_code snippet."
            )

        if normalize_newlines(parsed_change.original_code).strip() not in normalized_context:
            raise ValueError(
                f"Patch rejected for {parsed_change.file}: original_code snippet does not match the actual file."
            )

    elif parsed_change.action == "create":
        if not parsed_change.proposed_code.strip():
            raise ValueError(
                f"Create proposal for {parsed_change.file} has no proposed code."
            )

    elif parsed_change.action == "delete":
        if not parsed_change.original_code.strip():
            raise ValueError(
                f"Delete proposal for {parsed_change.file} has no original code."
            )

    return parsed_change.model_dump()


def validate_edit_proposal(
    result: dict,
    repository_context: str,
    allow_partial: bool = False,
) -> dict:
    if not isinstance(result, dict):
        raise ValueError("The AI response must be a JSON object.")

    summary = result.get("summary")
    raw_changes = result.get("changes")

    if not isinstance(summary, str) or not summary.strip():
        if allow_partial:
            summary = "Partial proposal recovered before output limit was reached."
        else:
            raise ValueError("The AI response is missing a valid summary.")

    if not isinstance(raw_changes, list):
        raise ValueError("The AI response is missing a valid changes list.")

    normalized_context = normalize_newlines(repository_context)
    valid_changes = []
    skipped_incomplete = 0

    for index, change in enumerate(raw_changes):
        try:
            valid_changes.append(
                validate_single_change(change, normalized_context, index)
            )
        except ValueError:
            if allow_partial:
                skipped_incomplete += 1
                continue
            raise

    if allow_partial and not valid_changes:
        raise ValueError(
            "Output was cut off before any complete patch could be salvaged."
        )

    if skipped_incomplete > 0:
        summary = (
            f"⚠️ Partial proposal (output limit reached — recovered {len(valid_changes)} "
            f"completed {'patch' if len(valid_changes) == 1 else 'patches'}): {summary}"
        )

    return {
        "summary": summary,
        "changes": valid_changes,
    }


# --------------------------------------------------
# HEALTH CHECK
# --------------------------------------------------

@app.get("/health")
async def health_check():
    return {
        "success": True,
        "status": "healthy",
        "message": "Orien Dual-Engine Backend is running!",
        "chat_engine": {
            "base_url": os.getenv("AI_BASE_URL", "https://coarena.ai/api/v1"),
            "model": get_chat_model(),
            "max_output_tokens": get_chat_max_tokens(),
            "reasoning_effort": get_chat_reasoning_effort(),
        },
        "orien_carbon": {
            "base_url": os.getenv("CARBON_AI_BASE_URL")
            or os.getenv("AI_BASE_URL", "https://coarena.ai/api/v1"),
            "model": os.getenv("CARBON_AI_MODEL", "deepseek-v4-1-flash-1017"),
            "max_input_tokens": 6000,
            "max_output_tokens": int(os.getenv("CARBON_MAX_OUTPUT_TOKENS", "16384")),
        },
        "orien_horizon": {
            "base_url": os.getenv(
                "HORIZON_AI_BASE_URL",
                "https://generativelanguage.googleapis.com/v1beta/openai/",
            ),
            "model": os.getenv("HORIZON_AI_MODEL", "gemini-4-hydrogen"),
            "max_input_tokens": 30000,
            "max_output_tokens": int(os.getenv("HORIZON_MAX_OUTPUT_TOKENS", "65536")),
            "configured": bool(os.getenv("HORIZON_AI_API_KEY")),
        },
    }


# --------------------------------------------------
# CHAT ENDPOINT (ASK ORIEN)
# --------------------------------------------------

@app.post("/chat")
async def chat(request: ChatRequest):
    client = get_chat_client()
    model = get_chat_model()

    user_content = (
        f"User's task:\n{request.message}\n\n"
        f"Repository context:\n{request.repository_context}"
    )

    try:
        response = await call_model_once(
            client,
            effort=get_chat_reasoning_effort(),
            model=model,
            temperature=0.3,
            max_tokens=get_chat_max_tokens(),
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are Orien, an AI software engineering assistant. "
                        "Analyze the supplied repository context carefully. "
                        "Be concise, direct, and helpful. "
                        "Do not claim to have modified files."
                    ),
                },
                {
                    "role": "user",
                    "content": user_content,
                },
            ],
        )

        choice = response.choices[0]
        answer = get_message_content(choice.message)
        usage_info = format_usage_summary(response)

        if not answer:
            raise ValueError(
                f"Empty AI response ({usage_info}, finish_reason={choice.finish_reason})."
            )

        if choice.finish_reason == "length":
            answer += (
                "\n\n---\n⚠️ *Response reached the output token limit and was cut off here. "
                "Ask Orien to continue if you need the rest.*"
            )

        return {
            "success": True,
            "model": response.model,
            "answer": answer,
            "truncated": choice.finish_reason == "length",
        }

    except HTTPException:
        raise

    except Exception as error:
        logger.exception("Chat request failed")
        raise HTTPException(
            status_code=502,
            detail=f"AI chat request failed: {str(error)}",
        ) from error


# --------------------------------------------------
# EDIT SYSTEM PROMPT (ZERO-FALSE-POSITIVE + REGRESSION GUARD)
# --------------------------------------------------

EDIT_SYSTEM_PROMPT = """
You are Orien, a surgical, zero-regression software engineering agent. Output ONLY valid compact JSON. No markdown fences, no commentary outside JSON.

Schema:
{"summary":"1-2 sentence summary","changes":[{"file":"exact/path","action":"modify","reason":"1 short sentence explaining the root cause and why this fix is safe","original_code":"exact block to replace","proposed_code":"replacement block"}]}

MANDATORY REASONING CHECKLIST (complete silently before emitting JSON):
1. ROOT CAUSE PROOF: Confirm a real, provable bug, crash, logic error, or explicit user-requested change exists. NEVER invent false positives, stylistic nitpicks, or speculative "cleanups". If the code is already sound, return {"summary":"No changes needed — no real defects found.","changes":[]}.
2. REGRESSION & SIDE-EFFECT CHECK: Before finalizing any edit, trace all callers, subclasses, return types, exceptions, state mutations, and edge cases in the supplied files. Ensure your fix preserves backward compatibility and NEVER breaks another code path while fixing the bug.
3. MINIMAL SURGICAL PATCH: Change the smallest possible surface area needed for a complete, safe fix. Keep reasoning concise and structured—do not loop or repeat yourself.

PATCH FORMAT RULES:
1. For "modify":
   - Include ONLY the exact block being changed plus 2-3 unchanged surrounding lines as an anchor (whether that edit is 4 lines or 45 lines).
   - NEVER copy untouched parts of a file.
   - If a single file needs multiple separate fixes in different places, emit multiple "modify" objects for that same file inside "changes".
2. original_code must match the supplied file character-for-character.
3. Allowed actions: "modify", "create", "delete".
4. NEVER edit any file marked [TRUNCATED — DO NOT EDIT THIS FILE].
"""


# --------------------------------------------------
# EDIT ENDPOINT (ORIEN CARBON & ORIEN HORIZON + HARD CAPS)
# --------------------------------------------------

@app.post("/edit")
async def edit_repository(request: EditRequest):
    estimated_input_tokens = int(
        (len(request.message) + len(request.repository_context)) / 3.5
    ) + 500
    max_allowed = ENGINE_MAX_INPUT_TOKENS[request.engine]

    if estimated_input_tokens > max_allowed:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Request blocked by Orien {request.engine.capitalize()} guardrail: "
                f"~{estimated_input_tokens:,} estimated input tokens exceeds the "
                f"{'6,000' if request.engine == 'carbon' else '30,000'}-token cap."
            ),
        )

    client, model, max_tokens, effort = get_engine_config(
        request.engine,
        request.reasoning_effort,
    )

    user_content = (
        f"Task:\n{request.message}\n\n"
        f"Repository context:\n{request.repository_context}"
    )

    try:
        response = await call_model_once(
            client,
            effort=effort,
            model=model,
            temperature=0,
            max_tokens=max_tokens,
            messages=[
                {
                    "role": "system",
                    "content": EDIT_SYSTEM_PROMPT,
                },
                {
                    "role": "user",
                    "content": user_content,
                },
            ],
        )

        choice = response.choices[0]
        ai_content = get_message_content(choice.message)
        usage_info = format_usage_summary(response)
        was_cut_off = choice.finish_reason == "length"

        logger.info(
            "Edit response | engine=%s | model=%s | effort=%s | finish_reason=%s | %s | chars=%s",
            request.engine,
            response.model,
            effort,
            choice.finish_reason,
            usage_info,
            len(ai_content),
        )

        if not ai_content:
            raise ValueError(
                f"Empty AI response ({usage_info}, finish_reason={choice.finish_reason})."
            )

        try:
            result = extract_json(ai_content)
            validated = validate_edit_proposal(
                result,
                request.repository_context,
                allow_partial=was_cut_off,
            )
        except Exception as parse_error:
            if was_cut_off:
                tail = ai_content[-160:].replace("\n", "\\n")
                raise ValueError(
                    f"Output cut off mid-JSON before any patch completed ({usage_info}, chars={len(ai_content)}). "
                    f"Stopped at: ...{tail}"
                ) from parse_error
            raise

        return {
            "success": True,
            "engine": request.engine,
            "model": response.model,
            "summary": validated["summary"],
            "changes": validated["changes"],
            "truncated": was_cut_off,
        }

    except HTTPException:
        raise

    except Exception as error:
        logger.exception("Repository edit request failed")
        raise HTTPException(
            status_code=502,
            detail=(
                f"Orien {request.engine.capitalize()} could not generate a valid edit proposal. "
                f"Reason: {str(error)}"
            ),
        ) from error