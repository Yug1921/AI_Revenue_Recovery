"""
Backend Task C — decision engine rules.

Deterministic mapping from root_cause -> intervention. No LLM here on purpose: money-moving
decisions must be explainable and reproducible, not a model's best guess. This table is the
literal "bounded and gated" requirement from the track brief — every entry has a hard limit.

Matches Section 10 of PROJECT_CONTEXT.md.
"""

DECISION_TABLE = {
    "bank_declined": {
        "action_type": "retry",
        "max_retries": 2,
        "cooldown_minutes": 30,
        "spend_cap": 0,
        "fallback_action": "escalate",
        "notes": "Some banks auto-clear on retry after a cooldown.",
    },
    "insufficient_funds": {
        "action_type": "nudge",
        "max_retries": 1,
        "cooldown_minutes": 1440,  # 24 hours — retrying immediately rarely helps
        "spend_cap": 0,
        "fallback_action": "escalate",
        "notes": "Wait for balance to likely refill before nudging.",
    },
    "mandate_expired": {
        "action_type": "new_payment_link",
        "max_retries": 1,
        "cooldown_minutes": 0,
        "spend_cap": 0,
        "fallback_action": "escalate",
        "notes": "Old mandate is dead — a fresh payment link is the only real fix.",
    },
    "gateway_timeout": {
        "action_type": "retry",
        "max_retries": 3,
        "cooldown_minutes": 5,
        "spend_cap": 0,
        "fallback_action": "escalate",
        "notes": "Usually transient — safe to retry more aggressively, quickly.",
    },
    "user_abandoned": {
        "action_type": "nudge",
        "max_retries": 2,
        "cooldown_minutes": 120,  # first nudge at 2hr, second at 24hr handled by execution layer
        "spend_cap": 0,
        "fallback_action": "escalate",
        "notes": "Reminder nudges, optionally Hinglish. No spend/discount by default.",
    },
    "subscription_failed": {
        "action_type": "retry",
        "max_retries": 2,
        "cooldown_minutes": 60,
        "spend_cap": 0,
        "fallback_action": "nudge",  # after retries exhausted, try a nudge before giving up
        "notes": "Retry with saved method first, fall back to a payment reminder.",
    },
    "unknown": {
        "action_type": "escalate",
        "max_retries": 0,
        "cooldown_minutes": 0,
        "spend_cap": 0,
        "fallback_action": None,
        "notes": "Low/no confidence diagnosis — do not guess with a real money action.",
    },
}


def get_bounds(root_cause: str) -> dict:
    return DECISION_TABLE.get(root_cause, DECISION_TABLE["unknown"])