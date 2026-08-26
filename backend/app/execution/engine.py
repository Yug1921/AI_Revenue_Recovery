"""
Backend Task D — execution / recovery agent. Pure logic, no DB writes here (run.py handles
persistence) — same separation used in diagnosis/engine.py and decisions/engine.py.

execute_actions(transaction, diagnosis, decision) -> list of action dicts, one per attempt made:

    {"attempt_number": int, "action_type": str, "razorpay_call": dict,
     "result": "success"|"pending"|"failed"|"escalated", "amount_recovered": float}

Simulated outcome probabilities are a documented modeling choice, not a claim of real bank
behavior — see PROJECT_CONTEXT.md. They only decide whether a *simulated* attempt succeeds;
they never fabricate a real_api result.
"""

import random

from app.execution.razorpay_client import create_payment_link, create_retry_order

# Probability a given attempt recovers the money. Rough, documented estimates — not measured
# real-world data, since these are synthetic transactions with no real customer behind them.
RECOVERY_PROBABILITY = {
    "bank_declined": 0.35,
    "gateway_timeout": 0.55,
    "subscription_failed": 0.40,
    "insufficient_funds": 0.30,
    "user_abandoned": 0.25,
    "mandate_expired": 0.45,
}


def _simulate_success(root_cause: str) -> bool:
    prob = RECOVERY_PROBABILITY.get(root_cause, 0.3)
    return random.random() < prob


def _escalate(reason: str, attempt_number: int) -> dict:
    return {
        "attempt_number": attempt_number,
        "action_type": "escalate",
        "razorpay_call": None,
        "result": "escalated",
        "amount_recovered": 0,
        "reason": reason,
    }


def _nudge(transaction: dict, root_cause: str, attempt_number: int) -> dict:
    message = (
        f"Hi {transaction.get('customer_name', 'there')}, your payment of "
        f"₹{transaction['amount']:.2f} needs attention — please retry to complete it."
    )
    success = _simulate_success(root_cause)
    return {
        "attempt_number": attempt_number,
        "action_type": "nudge",
        "razorpay_call": {"method": "simulated", "message": message},
        "result": "success" if success else "pending",
        "amount_recovered": transaction["amount"] if success else 0,
    }


def execute_actions(transaction: dict, diagnosis: dict, decision: dict) -> list[dict]:
    action_type = decision["action_type"]
    bounds = decision["bounds_applied"]
    root_cause = diagnosis["root_cause"]
    max_retries = bounds.get("max_retries", 0)
    fallback = bounds.get("fallback_action")

    results = []

    if action_type == "escalate":
        results.append(_escalate("Low-confidence diagnosis, no automated action taken.", 1))
        return results

    if action_type == "new_payment_link":
        call = create_payment_link(transaction)
        if call["success"]:
            success = _simulate_success(root_cause)
            results.append({
                "attempt_number": 1,
                "action_type": "new_payment_link",
                "razorpay_call": call,
                "result": "success" if success else "pending",
                "amount_recovered": transaction["amount"] if success else 0,
            })
        else:
            results.append({
                "attempt_number": 1,
                "action_type": "new_payment_link",
                "razorpay_call": call,
                "result": "failed",
                "amount_recovered": 0,
            })
            results.append(_escalate(f"Razorpay API call failed: {call.get('error')}", 2))
        return results

    if action_type == "retry":
        recovered = False
        for attempt in range(1, max_retries + 1):
            call = create_retry_order(transaction, attempt)
            success = call["success"] and _simulate_success(root_cause)
            results.append({
                "attempt_number": attempt,
                "action_type": "retry",
                "razorpay_call": call,
                "result": "success" if success else ("failed" if not call["success"] else "pending"),
                "amount_recovered": transaction["amount"] if success else 0,
            })
            if success:
                recovered = True
                break

        if not recovered:
            next_attempt = len(results) + 1
            if fallback == "nudge":
                results.append(_nudge(transaction, root_cause, next_attempt))
            elif fallback == "escalate":
                results.append(_escalate("Retries exhausted, no recovery.", next_attempt))
        return results

    if action_type == "nudge":
        recovered = False
        for attempt in range(1, max_retries + 1):
            result = _nudge(transaction, root_cause, attempt)
            results.append(result)
            if result["result"] == "success":
                recovered = True
                break

        if not recovered and fallback == "escalate":
            results.append(_escalate("Nudges exhausted, no recovery.", len(results) + 1))
        return results

    # Unrecognized action_type — escalate rather than silently doing nothing.
    results.append(_escalate(f"Unrecognized action_type '{action_type}'.", 1))
    return results