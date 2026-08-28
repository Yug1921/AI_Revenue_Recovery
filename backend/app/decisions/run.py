"""
Run Task C against a batch that already has diagnoses.

    python -m app.decisions.run --batch_id <batch_id>
"""

import argparse
from collections import Counter

from app.config import supabase
from app.db_retry import with_retry
from app.decisions.engine import decide_and_store


def run(batch_id: str):
    transactions = with_retry(lambda: (
        supabase.table("transactions").select("id").eq("batch_id", batch_id).execute()
    )).data
    if not transactions:
        print(f"No transactions found for batch_id {batch_id}.")
        return
    txn_ids = [t["id"] for t in transactions]

    diagnoses = with_retry(lambda: (
        supabase.table("diagnoses").select("*").in_("transaction_id", txn_ids).execute()
    )).data
    diag_by_txn = {d["transaction_id"]: d for d in diagnoses}

    already_decided = {
        d["transaction_id"]
        for d in with_retry(lambda: (
            supabase.table("decisions")
            .select("transaction_id")
            .in_("transaction_id", txn_ids)
            .execute()
        )).data
    }

    pending = [tid for tid in txn_ids if tid in diag_by_txn and tid not in already_decided]
    skipped_no_diagnosis = [tid for tid in txn_ids if tid not in diag_by_txn]

    print(f"{len(txn_ids)} transactions, {len(pending)} pending decisions.")
    if skipped_no_diagnosis:
        print(f"WARNING: {len(skipped_no_diagnosis)} transactions have no diagnosis yet — run Task B first.")

    action_counts = Counter()
    skipped = []
    for i, tid in enumerate(pending, 1):
        try:
            diagnosis = diag_by_txn[tid]
            result = decide_and_store(tid, diagnosis)
            action_counts[result["action_type"]] += 1
            print(f"  [{i}/{len(pending)}] {diagnosis['root_cause']:20s} -> {result['action_type']}")
        except Exception as e:  # noqa: BLE001
            print(f"  [{i}/{len(pending)}] SKIPPED {tid} — error: {e}")
            skipped.append(tid)
            continue

    print("\n--- Summary ---")
    for action, count in action_counts.most_common():
        print(f"  {action}: {count}")
    if skipped:
        print(f"\n{len(skipped)} transaction(s) skipped due to errors: {skipped}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run decision engine on a batch's diagnoses.")
    parser.add_argument("--batch_id", required=True)
    args = parser.parse_args()
    run(args.batch_id)