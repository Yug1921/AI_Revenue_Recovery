from datetime import datetime, timezone

from app.config import supabase
from app.db_retry import with_retry


def _touch(batch_id: str, stage: str) -> None:
    with_retry(lambda: supabase.table("batch_runs").update({
        "current_stage": stage,
        "last_updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", batch_id).execute())