"""Run the complete recovery pipeline for a synthetic transaction batch."""

import traceback
import uuid
from datetime import datetime, timezone

from app.config import DEFAULT_BATCH_SIZE, supabase
from app.db_retry import with_retry
from app.decisions.run import run as run_decisions
from app.diagnosis.run import run as run_diagnosis
from app.execution.run import run as run_execution
from app.progress import _touch
from app.synthetic.generate import run as run_generation


def run_full_pipeline(count: int = DEFAULT_BATCH_SIZE, batch_id: str | None = None) -> str:
    print(f"[PIPELINE] run_full_pipeline STARTED for batch_id={batch_id}, count={count}", flush=True)
    should_create_batch = batch_id is None
    batch_id = batch_id or str(uuid.uuid4())

    try:
        if should_create_batch:
            with_retry(lambda: supabase.table("batch_runs").insert({
                "id": batch_id,
                "started_at": datetime.utcnow().isoformat(),
            }).execute())

        _touch(batch_id, "seeding")
        run_generation(count, batch_id=batch_id)

        _touch(batch_id, "diagnosing")
        run_diagnosis(batch_id)

        _touch(batch_id, "deciding")
        run_decisions(batch_id)

        _touch(batch_id, "executing")
        run_execution(batch_id)

        with_retry(lambda: supabase.table("batch_runs").update({
            "completed_at": datetime.utcnow().isoformat(),
            "current_stage": "done",
            "last_updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", batch_id).execute())
        return batch_id
    except Exception as error:
        print(f"[PIPELINE] FAILED for batch_id={batch_id}: {error}", flush=True)
        print(traceback.format_exc(), flush=True)
        try:
            with_retry(lambda: supabase.table("batch_runs").update({
                "completed_at": datetime.utcnow().isoformat(),
                "current_stage": "failed",
                "last_updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", batch_id).execute())
        except Exception as completion_error:
            print(f"Could not mark batch {batch_id} as completed: {completion_error}")
        raise