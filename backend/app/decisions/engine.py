"""
decide(diagnosis) -> Decision. Pure lookup against rules.py — deterministic and explainable.
Output shape is the contract Task D (execution) builds against:

    {"action_type": str, "bounds_applied": dict, "reasoning": str}
"""

from app.config import supabase
from app.decisions.rules import get_bounds
from app.db_retry import with_retry


def decide(diagnosis: dict) -> dict:
    root_cause = diagnosis["root_cause"]
    bounds = get_bounds(root_cause)

    return {
        "action_type": bounds["action_type"],
        "bounds_applied": {
            "max_retries": bounds["max_retries"],
            "cooldown_minutes": bounds["cooldown_minutes"],
            "spend_cap": bounds["spend_cap"],
            "fallback_action": bounds["fallback_action"],
        },
        "reasoning": f"root_cause={root_cause} -> {bounds['action_type']} "
                     f"(max {bounds['max_retries']} attempts). {bounds['notes']}",
    }


def decide_and_store(transaction_id: str, diagnosis: dict) -> dict:
    result = decide(diagnosis)

    row = {
        "transaction_id": transaction_id,
        "action_type": result["action_type"],
        "bounds_applied": result["bounds_applied"],
        "reasoning": result["reasoning"],
    }
    with_retry(lambda: supabase.table("decisions").insert(row).execute())

    return result