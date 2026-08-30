from dotenv import load_dotenv
load_dotenv()

import os
import re

try:
    import resend
except Exception:  # pragma: no cover - import should not crash in demo envs
    resend = None

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
if resend is not None:
    resend.api_key = RESEND_API_KEY or None


def demo_email_for(customer_name: str) -> str:
    """Generate a deterministic demo email from a customer name."""
    raw_name = (customer_name or "").strip()
    cleaned = re.sub(r"[^a-z0-9]+", " ", raw_name.lower()).strip()
    parts = [part for part in cleaned.split() if part]
    base = ".".join(parts) if parts else "customer"
    return f"{base}@demo-customer.in"


def send_nudge_email(demo_recipient_email: str, customer_name: str, message: str) -> dict:
    """Send the message to the developer's verified address while labeling it as demo-only."""
    api_key = os.getenv("RESEND_API_KEY")
    to_email = os.getenv("RESEND_TO_EMAIL")
    from_email = os.getenv("RESEND_FROM_EMAIL")

    if resend is not None:
        resend.api_key = api_key or None

    if not api_key or not to_email or not from_email:
        return {
            "success": False,
            "error": "Missing RESEND_API_KEY, RESEND_TO_EMAIL, or RESEND_FROM_EMAIL",
        }

    target_email = (demo_recipient_email or demo_email_for(customer_name)).strip() or demo_email_for(customer_name)
    customer_label = (customer_name or "customer").strip() or "customer"
    email_body = message or "Please retry your payment."

    payload = {
        "from": from_email,
        "to": [to_email],
        "subject": f"[DEMO] Recovery nudge — would be sent to {target_email}",
        "html": (
            "<p><em>This is a demo. In production this message would be delivered to "
            f"{customer_label} at {target_email}. For this hackathon demo, delivery "
            "is routed to the developer's verified address instead.</em></p><hr><p>"
            f"{email_body}</p>"
        ),
    }

    try:
        if resend is None:
            return {"success": False, "error": "resend package is not installed"}
        result = resend.Emails.send(payload)
        return {"success": True, "provider_response": result}
    except Exception as e:  # noqa: BLE001
        return {"success": False, "error": str(e)}


__all__ = ["demo_email_for", "send_nudge_email"]
