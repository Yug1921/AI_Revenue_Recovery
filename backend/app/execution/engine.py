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

import httpx

from app.diagnosis.llm import MODELS, OPENROUTER_API_KEY, OPENROUTER_URL

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


def build_nudge_message_fallback(transaction: dict) -> str:
    amount = float(transaction.get("amount", 0.0) or 0.0)
    customer_name = transaction.get("customer_name") or "there"
    return (
        f"Hi {customer_name}, your payment of "
        f"₹{amount:.2f} needs attention — please retry to complete it."
    )


NUDGE_SYSTEM_PROMPT = """Write a short, warm, conversational payment recovery message for an email body.
Gently check in with the customer, with a tone like asking if they are still thinking it over.
Mention the payment amount naturally and include one soft call to action.
Use 2-3 sentences maximum, plain text only, and no markdown or corporate phrasing.
Do not include a subject line, greeting, sign-off, or quotation marks around the message."""


def generate_nudge_message(transaction: dict) -> dict:
    """Return an AI-generated nudge, falling back to the static message on failure."""
    if not OPENROUTER_API_KEY:
        return {"message": build_nudge_message_fallback(transaction), "source": "fallback"}

    amount = float(transaction.get("amount", 0.0) or 0.0)
    customer_name = transaction.get("customer_name") or "there"
    user_prompt = (
        f"Customer name: {customer_name}\n"
        f"Payment amount: ₹{amount:.2f}\n"
        "Write the personalized recovery message now."
    )
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
                            {"role": "system", "content": NUDGE_SYSTEM_PROMPT},
                            {"role": "user", "content": user_prompt},
                        ],
                        "temperature": 0.7,
                    },
                )
                response.raise_for_status()
                message = response.json()["choices"][0]["message"]["content"].strip()
                if not message:
                    raise ValueError("empty message returned")
                return {"message": message, "source": "ai"}
            except Exception as e:  # noqa: BLE001 — any failure here tries the next model
                last_error = f"{model}: {e}"
                continue

    return {"message": build_nudge_message_fallback(transaction), "source": "fallback"}


def _nudge(transaction: dict, root_cause: str, attempt_number: int) -> dict:
    message = generate_nudge_message(transaction)["message"]
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