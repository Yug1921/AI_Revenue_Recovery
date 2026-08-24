"""
Rules-first pass for diagnosis.

If a transaction's type/error_code/message combination is one we recognize confidently,
classify it here for free and skip the LLM entirely. Only genuinely ambiguous cases should
fall through to the LLM (see engine.py). This split is deliberate — it's the "AI Judgment"
story: don't spend an LLM call on something a lookup table already knows for certain.

Returns a dict {root_cause, confidence, reasoning} or None if no rule matches confidently.
Root causes match the decision table in Section 10 of PROJECT_CONTEXT.md:
  bank_declined | insufficient_funds | mandate_expired | gateway_timeout |
  user_abandoned | subscription_failed | unknown
"""

from typing import Optional


def classify(transaction: dict) -> Optional[dict]:
    txn_type = transaction.get("type")
    error_code = (transaction.get("raw_error_code") or "").upper()
    message = (transaction.get("raw_error_message") or "").lower()

    # Abandoned checkout — the type itself already tells us everything.
    if txn_type == "checkout_abandoned":
        return {
            "root_cause": "user_abandoned",
            "confidence": 0.99,
            "reasoning": "Transaction type is checkout_abandoned — no payment attempt was made.",
        }

    # UPI mandate expired — unambiguous error code.
    if error_code == "MANDATE_EXPIRED":
        return {
            "root_cause": "mandate_expired",
            "confidence": 0.97,
            "reasoning": "raw_error_code is MANDATE_EXPIRED — the UPI mandate needs re-authentication.",
        }

    # Subscription-specific failures — bucketed together per the decision table.
    if txn_type == "subscription_failed" and error_code == "SUBSCRIPTION_CHARGE_FAILED":
        return {
            "root_cause": "subscription_failed",
            "confidence": 0.93,
            "reasoning": f"Recurring charge failed ({message or 'no detail'}) on a subscription record.",
        }

    # Bank-level declines.
    if error_code == "BAD_REQUEST_ERROR" and "declined" in message:
        return {
            "root_cause": "bank_declined",
            "confidence": 0.92,
            "reasoning": "Issuing bank explicitly declined the payment.",
        }

    # Gateway-level issues — split on message content since the code alone is ambiguous.
    if error_code == "GATEWAY_ERROR":
        if "insufficient" in message:
            return {
                "root_cause": "insufficient_funds",
                "confidence": 0.9,
                "reasoning": "Gateway error message indicates insufficient balance.",
            }
        if "timeout" in message:
            return {
                "root_cause": "gateway_timeout",
                "confidence": 0.88,
                "reasoning": "Gateway did not respond within the expected window — likely transient.",
            }

    # No confident rule match — let the LLM take a look (or it'll end up as 'unknown').
    return None