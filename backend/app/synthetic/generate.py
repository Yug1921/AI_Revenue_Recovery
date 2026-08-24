"""
Backend Task A — synthetic data generator.

Seeds a fresh batch of realistic failed-payment / abandoned-checkout / failed-subscription
records into Supabase. Deliberately produces messy, varied raw_error_code / raw_error_message
values — the diagnosis engine (Task B) is what figures out the clean root_cause from this mess,
so we don't pre-label it here.

Run:
    python -m app.synthetic.generate
    python -m app.synthetic.generate --count 80
"""

import argparse
import random
import uuid
from datetime import datetime, timedelta

from faker import Faker

from app.config import supabase

fake = Faker("en_IN")

# Each scenario is realistic raw data a webhook/checkout event might actually contain.
# 'type' matches the transactions.type column. Weight controls how common each is in the batch.
SCENARIOS = [
    # -- payment_failed: bank/gateway level declines --
    {
        "type": "payment_failed",
        "error_code": "BAD_REQUEST_ERROR",
        "error_message": "Payment failed - Card declined by issuing bank",
        "weight": 15,
    },
    {
        "type": "payment_failed",
        "error_code": "GATEWAY_ERROR",
        "error_message": "Insufficient funds in account",
        "weight": 10,
    },
    {
        "type": "payment_failed",
        "error_code": "GATEWAY_ERROR",
        "error_message": "Gateway timeout - no response from bank within window",
        "weight": 12,
    },
    {
        "type": "payment_failed",
        "error_code": "BAD_REQUEST_ERROR",
        "error_message": "Payment declined - risk threshold exceeded",
        "weight": 6,
    },
    # -- checkout_abandoned: no error code, session just died --
    {
        "type": "checkout_abandoned",
        "error_code": None,
        "error_message": "Checkout session expired - no payment attempt made",
        "weight": 18,
    },
    {
        "type": "checkout_abandoned",
        "error_code": None,
        "error_message": "User navigated away during payment method selection",
        "weight": 10,
    },
    # -- subscription_failed: recurring charge issues --
    {
        "type": "subscription_failed",
        "error_code": "MANDATE_EXPIRED",
        "error_message": "UPI autopay mandate has expired, re-authentication required",
        "weight": 8,
    },
    {
        "type": "subscription_failed",
        "error_code": "SUBSCRIPTION_CHARGE_FAILED",
        "error_message": "Recurring charge failed - card expired",
        "weight": 8,
    },
    {
        "type": "subscription_failed",
        "error_code": "SUBSCRIPTION_CHARGE_FAILED",
        "error_message": "Recurring charge failed - insufficient balance",
        "weight": 7,
    },
    # -- deliberately vague, low-confidence cases, so the escalate path has real cases to hit --
    {
        "type": "payment_failed",
        "error_code": "UNKNOWN",
        "error_message": "Payment could not be completed",
        "weight": 6,
    },
]


def pick_scenario():
    weights = [s["weight"] for s in SCENARIOS]
    return random.choices(SCENARIOS, weights=weights, k=1)[0]


def random_amount():
    # Skewed toward smaller transaction values with occasional larger ones, in INR.
    return round(random.choice([
        random.uniform(199, 999),
        random.uniform(1000, 4999),
        random.uniform(5000, 15000),
    ]), 2)


def random_timestamp():
    # Spread across the last 14 days so a "recovered after N hours" story is plausible.
    hours_ago = random.uniform(0, 14 * 24)
    return (datetime.utcnow() - timedelta(hours=hours_ago)).isoformat()


def build_transaction(batch_id: str) -> dict:
    scenario = pick_scenario()
    return {
        "batch_id": batch_id,
        "razorpay_ref": f"test_{uuid.uuid4().hex[:14]}",
        "type": scenario["type"],
        "amount": random_amount(),
        "currency": "INR",
        "customer_name": fake.name(),
        "customer_contact": fake.phone_number(),
        "raw_error_code": scenario["error_code"],
        "raw_error_message": scenario["error_message"],
        "created_at": random_timestamp(),
    }


def run(count: int):
    batch_id = str(uuid.uuid4())
    rows = [build_transaction(batch_id) for _ in range(count)]

    # Insert in chunks to stay well under any request size limits.
    chunk_size = 25
    inserted = 0
    for i in range(0, len(rows), chunk_size):
        chunk = rows[i : i + chunk_size]
        result = supabase.table("transactions").insert(chunk).execute()
        inserted += len(result.data)

    print(f"Batch ID: {batch_id}")
    print(f"Inserted {inserted}/{count} synthetic transactions.")
    print("Breakdown by type:")
    for t in ("payment_failed", "checkout_abandoned", "subscription_failed"):
        n = sum(1 for r in rows if r["type"] == t)
        print(f"  {t}: {n}")
    print("\nSave this batch_id — Tasks B/C/D will run against it.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed synthetic transaction data.")
    parser.add_argument("--count", type=int, default=60, help="Number of records to generate (default: 60)")
    args = parser.parse_args()
    run(args.count)
