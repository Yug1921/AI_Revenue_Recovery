"""Run the complete recovery pipeline for a synthetic transaction batch."""

import uuid
from datetime import datetime

from app.config import supabase
from app.db_retry import with_retry
from app.decisions.run import run as run_decisions
from app.diagnosis.run import run as run_diagnosis
from app.execution.run import run as run_execution
from app.synthetic.generate import run as run_generation


def run_full_pipeline(count: int = 60, batch_id: str | None = None) -> str:
    should_create_batch = batch_id is None
    batch_id = batch_id or str(uuid.uuid4())

    try:
        if should_create_batch:
            with_retry(lambda: supabase.table("batch_runs").insert({
                "id": batch_id,
                "started_at": datetime.utcnow().isoformat(),
            }).execute())

        run_generation(count, batch_id=batch_id)
        run_diagnosis(batch_id)
        run_decisions(batch_id)
        run_execution(batch_id)

        with_retry(lambda: supabase.table("batch_runs").update({
            "completed_at": datetime.utcnow().isoformat(),
        }).eq("id", batch_id).execute())
        return batch_id
    except Exception as error:
        print(f"Full pipeline failed for batch_id {batch_id}: {error}")
        try:
            with_retry(lambda: supabase.table("batch_runs").update({
                "completed_at": datetime.utcnow().isoformat(),
            }).eq("id", batch_id).execute())
        except Exception as completion_error:
            print(f"Could not mark batch {batch_id} as completed: {completion_error}")
        raise