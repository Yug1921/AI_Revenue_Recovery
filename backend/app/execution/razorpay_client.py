"""
Thin Razorpay test-mode API client. Every call is wrapped so a failure (bad auth, network,
account not yet approved for a given product) degrades gracefully instead of crashing the batch
— this IS the "failure handled gracefully" story for the pitch.

Set RAZORPAY_LIVE_CALLS=false in .env to skip real API calls entirely and run fully simulated
(useful if your Razorpay account isn't approved for Payment Links yet).
"""

import os
import re

import httpx

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")
LIVE_CALLS = os.getenv("RAZORPAY_LIVE_CALLS", "true").lower() == "true"

BASE_URL = "https://api.razorpay.com/v1"


def _auth():
    return httpx.BasicAuth(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)


def _sanitize_contact(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    digits = digits[-10:]
    if len(digits) == 10:
        return f"+91{digits}"
    return "+919999999999"  # safe fallback so a malformed synthetic phone never blocks the call


def create_payment_link(transaction: dict) -> dict:
    """Creates a real Razorpay test-mode Payment Link. Returns {success, method, response|error}."""
    if not LIVE_CALLS:
        return {"success": True, "method": "simulated", "response": {"note": "RAZORPAY_LIVE_CALLS=false"}}

    payload = {
        "amount": int(round(transaction["amount"] * 100)),  # paise
        "currency": "INR",
        "description": f"Recovery link for {transaction.get('razorpay_ref', 'txn')}",
        "customer": {
            "name": transaction.get("customer_name") or "Customer",
            "contact": _sanitize_contact(transaction.get("customer_contact", "")),
        },
        "notify": {"sms": False, "email": False},
        "reminder_enable": False,
    }
    try:
        r = httpx.post(f"{BASE_URL}/payment_links", json=payload, auth=_auth(), timeout=15)
        r.raise_for_status()
        return {"success": True, "method": "real_api", "response": r.json()}
    except Exception as e:  # noqa: BLE001
        return {"success": False, "method": "real_api", "error": str(e)}


def create_retry_order(transaction: dict, attempt: int) -> dict:
    """Creates a real Razorpay test-mode Order representing one retry attempt."""
    if not LIVE_CALLS:
        return {"success": True, "method": "simulated", "response": {"note": "RAZORPAY_LIVE_CALLS=false"}}

    payload = {
        "amount": int(round(transaction["amount"] * 100)),
        "currency": "INR",
        "receipt": f"{transaction.get('razorpay_ref', 'txn')}-retry-{attempt}",
        "notes": {"attempt": str(attempt), "purpose": "recovery_retry"},
    }
    try:
        r = httpx.post(f"{BASE_URL}/orders", json=payload, auth=_auth(), timeout=15)
        r.raise_for_status()
        return {"success": True, "method": "real_api", "response": r.json()}
    except Exception as e:  # noqa: BLE001
        return {"success": False, "method": "real_api", "error": str(e)}