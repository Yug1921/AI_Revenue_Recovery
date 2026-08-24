"""
LLM-assisted diagnosis for cases rules.py couldn't confidently classify.

Tries each model in OPENROUTER_MODELS in order, falling back to the next on any error,
timeout, or unparseable response — same pattern as the Corporate Action Impact Scorer project.
If every model fails, the caller treats it as an honest 'unknown' rather than crashing.
"""

import json
import os
import re

import httpx

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# Configurable via .env as a comma-separated list. Defaults are small/cheap OpenRouter models —
# check https://openrouter.ai/models for current free-tier options, availability changes.
DEFAULT_MODELS = "meta-llama/llama-3.1-8b-instruct,google/gemini-flash-1.5-8b,openai/gpt-4o-mini"
MODELS = [m.strip() for m in os.getenv("OPENROUTER_MODELS", DEFAULT_MODELS).split(",") if m.strip()]

VALID_ROOT_CAUSES = {
    "bank_declined",
    "insufficient_funds",
    "mandate_expired",
    "gateway_timeout",
    "user_abandoned",
    "subscription_failed",
    "unknown",
}

SYSTEM_PROMPT = """You are a payment failure classifier for an Indian fintech recovery system.
Given a transaction's type and raw error details, classify the root cause into exactly one of:
bank_declined, insufficient_funds, mandate_expired, gateway_timeout, user_abandoned,
subscription_failed, unknown.

Respond with ONLY a JSON object, no other text, no markdown fences:
{"root_cause": "<one of the categories above>", "confidence": <0.0-1.0>, "reasoning": "<one short sentence>"}

If the error is too vague or doesn't clearly fit a category, use "unknown" with low confidence —
do not guess with false confidence, this feeds a system that takes real recovery actions."""


def _build_user_prompt(transaction: dict) -> str:
    return (
        f"Transaction type: {transaction.get('type')}\n"
        f"Amount: {transaction.get('amount')} {transaction.get('currency', 'INR')}\n"
        f"Raw error code: {transaction.get('raw_error_code') or 'none'}\n"
        f"Raw error message: {transaction.get('raw_error_message') or 'none'}"
    )


def _extract_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    return json.loads(text)


def diagnose_with_llm(transaction: dict) -> dict:
    """Returns {root_cause, confidence, reasoning}. Falls back to 'unknown' if every model fails."""
    if not OPENROUTER_API_KEY:
        return {
            "root_cause": "unknown",
            "confidence": 0.0,
            "reasoning": "OPENROUTER_API_KEY not set — cannot run LLM classification.",
        }

    user_prompt = _build_user_prompt(transaction)
    last_error = None

    with httpx.Client(timeout=20.0) as client:
        for model in MODELS:
            try:
                response = client.post(
                    OPENROUTER_URL,
                    headers={
                        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": SYSTEM_PROMPT},
                            {"role": "user", "content": user_prompt},
                        ],
                        "temperature": 0.1,
                    },
                )
                response.raise_for_status()
                content = response.json()["choices"][0]["message"]["content"]
                parsed = _extract_json(content)

                root_cause = parsed.get("root_cause", "unknown")
                if root_cause not in VALID_ROOT_CAUSES:
                    root_cause = "unknown"

                return {
                    "root_cause": root_cause,
                    "confidence": float(parsed.get("confidence", 0.5)),
                    "reasoning": f"[{model}] {parsed.get('reasoning', 'no reasoning given')}",
                }

            except Exception as e:  # noqa: BLE001 — any failure here just tries the next model
                last_error = f"{model}: {e}"
                continue

    return {
        "root_cause": "unknown",
        "confidence": 0.0,
        "reasoning": f"All LLM models failed, escalating. Last error: {last_error}",
    }