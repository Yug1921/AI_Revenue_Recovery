"""
Run Task B against an already-seeded batch.

    python -m app.diagnosis.run --batch_id <batch_id from Task A>
"""

import argparse
from collections import Counter

from app.config import supabase
from app.db_retry import with_retry
from app.diagnosis.engine import diagnose_and_store
from app.progress import _touch


def run(batch_id: str):
    transactions = with_retry(lambda: (
        supabase.table("transactions").select("*").eq("batch_id", batch_id).execute()
    )).data
    if not transactions:
        print(f"No transactions found for batch_id {batch_id}. Did Task A run for this batch?")
        return

    already_diagnosed_ids = {
        d["transaction_id"]
        for d in with_retry(lambda: (
            supabase.table("diagnoses")
            .select("transaction_id")
            .in_("transaction_id", [t["id"] for t in transactions])
            .execute()
        )).data
    }

    pending = [t for t in transactions if t["id"] not in already_diagnosed_ids]
    print(f"{len(transactions)} transactions in batch, {len(pending)} pending diagnosis.")

    method_counts = Counter()
    cause_counts = Counter()
    skipped = []

    for i, txn in enumerate(pending, 1):
        try:
            if i % 10 == 0:
                _touch(batch_id, "diagnosing")
            result = diagnose_and_store(txn)
            method_counts[result["method"]] += 1
            cause_counts[result["root_cause"]] += 1
            print(f"  [{i}/{len(pending)}] {txn['type']:20s} -> {result['root_cause']:20s} "
                  f"(via {result['method']}, confidence {result['confidence']:.2f})")
        except Exception as e:  # noqa: BLE001
            print(f"  [{i}/{len(pending)}] SKIPPED {txn['id']} — error: {e}")
            skipped.append(txn["id"])
            continue

    print("\n--- Summary ---")
    print(f"Handled by rules: {method_counts['rule']}")
    print(f"Handled by LLM:   {method_counts['llm']}")
    print("\nRoot cause breakdown:")
    for cause, count in cause_counts.most_common():
        print(f"  {cause}: {count}")
    if skipped:
        print(f"\n{len(skipped)} transaction(s) skipped due to errors: {skipped}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run diagnosis engine on a seeded batch.")
    parser.add_argument("--batch_id", required=True, help="batch_id printed by Task A")
    args = parser.parse_args()
    run(args.batch_id)