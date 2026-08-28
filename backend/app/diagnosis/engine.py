"""
Backend Task B — diagnosis engine.

diagnose(transaction) -> Diagnosis: tries rules.py first (free, deterministic). Only calls the
LLM when no rule confidently matches. This function is what Task C (decision engine) and
Task D (execution) build against — its output shape is the contract:

    {"root_cause": str, "confidence": float, "reasoning": str, "method": "rule" | "llm"}
"""

from app.config import supabase
from app.diagnosis import rules
from app.diagnosis.llm import diagnose_with_llm
from app.db_retry import with_retry

RULE_CONFIDENCE_THRESHOLD = 0.8


def diagnose(transaction: dict) -> dict:
    rule_result = rules.classify(transaction)

    if rule_result and rule_result["confidence"] >= RULE_CONFIDENCE_THRESHOLD:
        result = {**rule_result, "method": "rule"}
    else:
        llm_result = diagnose_with_llm(transaction)
        result = {**llm_result, "method": "llm"}

    return result


def diagnose_and_store(transaction: dict) -> dict:
    """Runs diagnose() and writes the row to Supabase. Returns the stored diagnosis dict."""
    result = diagnose(transaction)

    row = {
        "transaction_id": transaction["id"],
        "root_cause": result["root_cause"],
        "confidence": result["confidence"],
        "reasoning": result["reasoning"],
    }
    with_retry(lambda: supabase.table("diagnoses").insert(row).execute())

    return result