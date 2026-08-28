"""
Run Task D against a batch that already has decisions.

    python -m app.execution.run --batch_id <batch_id>

Executes every pending transaction's decision, writes each attempt to the actions table, and
writes a summary row to batch_runs — the numbers your dashboard (frontend) will read.
"""

import time

def _insert_with_retry(table, row, attempts=3):
    last_err = None
    for i in range(attempts):
        try:
            return with_retry(lambda: supabase.table(table).insert(row).execute())
        except Exception as e:  # noqa: BLE001
            last_err = e
            time.sleep(0.5 * (i + 1))
    raise last_err

import argparse
from collections import Counter

from app.config import supabase
from app.execution.engine import execute_actions
from app.db_retry import with_retry

def run(batch_id: str):
    transactions = with_retry(lambda: (
        supabase.table("transactions").select("*").eq("batch_id", batch_id).execute()
    )).data
    if not transactions:
        print(f"No transactions found for batch_id {batch_id}.")
        return
    txn_ids = [t["id"] for t in transactions]

    diagnoses = {
        d["transaction_id"]: d
        for d in with_retry(lambda: supabase.table("diagnoses").select("*").in_("transaction_id", txn_ids).execute()).data
    }
    decisions = {
        d["transaction_id"]: d
        for d in with_retry(lambda: supabase.table("decisions").select("*").in_("transaction_id", txn_ids).execute()).data
    }
    already_executed = {
        a["transaction_id"]
        for a in with_retry(lambda: supabase.table("actions").select("transaction_id").in_("transaction_id", txn_ids).execute()).data
    }

    pending = [
        t for t in transactions
        if t["id"] in diagnoses and t["id"] in decisions and t["id"] not in already_executed
    ]
    print(f"{len(transactions)} transactions, {len(pending)} pending execution.")

    total_at_risk = sum(t["amount"] for t in transactions)
    total_recovered = 0.0
    final_result_counts = Counter()
    skipped = []

    for i, txn in enumerate(pending, 1):
        try:
            diagnosis = diagnoses[txn["id"]]
            decision = decisions[txn["id"]]
            results = execute_actions(txn, diagnosis, decision)

            for r in results:
                row = {
                    "transaction_id": txn["id"],
                    "attempt_number": r["attempt_number"],
                    "action_type": r["action_type"],
                    "razorpay_call": r["razorpay_call"],
                    "result": r["result"],
                    "amount_recovered": r["amount_recovered"],
                }
                with_retry(lambda: supabase.table("actions").insert(row).execute())

            final = results[-1]
            total_recovered += sum(r["amount_recovered"] for r in results)
            final_result_counts[final["result"]] += 1

            print(f"  [{i}/{len(pending)}] {diagnosis['root_cause']:20s} -> "
                  f"{len(results)} attempt(s), final: {final['result']}")
        except Exception as e:  # noqa: BLE001
            print(f"  [{i}/{len(pending)}] SKIPPED {txn['id']} — error: {e}")
            skipped.append(txn["id"])
            continue

    # Recompute totals across the WHOLE batch (not just this run) for an accurate batch_runs row.
    all_actions = with_retry(lambda: (
        supabase.table("actions").select("*").in_("transaction_id", txn_ids).execute()
    )).data
    recovered_total = sum(a["amount_recovered"] for a in all_actions)
    exceptions = len({
        a["transaction_id"] for a in all_actions if a["result"] == "escalated"
    })

    batch_row = {
        "id": batch_id,
        "total_transactions": len(transactions),
        "total_at_risk": total_at_risk,
        "total_recovered": recovered_total,
        "recovery_rate": round(recovered_total / total_at_risk, 4) if total_at_risk else 0,
        "exceptions_count": exceptions,
    }
    with_retry(lambda: supabase.table("batch_runs").upsert(batch_row).execute())

    print("\n--- Batch Summary ---")
    print(f"Total at risk:   ₹{total_at_risk:.2f}")
    print(f"Total recovered: ₹{recovered_total:.2f}")
    print(f"Recovery rate:   {batch_row['recovery_rate']*100:.1f}%")
    print(f"Exceptions:      {exceptions}")
    if skipped:
        print(f"\n{len(skipped)} transaction(s) skipped due to errors: {skipped}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run execution engine on a batch's decisions.")
    parser.add_argument("--batch_id", required=True)
    args = parser.parse_args()
    run(args.batch_id)