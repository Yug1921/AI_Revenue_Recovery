from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
import uuid

import httpx
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.config import DEFAULT_BATCH_SIZE, supabase
from app.db_retry import with_retry
from app.execution.engine import build_nudge_message
from app.nudge.email_client import demo_email_for, send_nudge_email
from app.pipeline import run_full_pipeline


class BatchRunRequest(BaseModel):
    count: int = DEFAULT_BATCH_SIZE


class BatchRunResponse(BaseModel):
    batch_id: str
    status: str


class BatchSummaryResponse(BaseModel):
    batch_id: str
    status: str
    total_transactions: Optional[int]
    total_at_risk: Optional[float]
    total_recovered: Optional[float]
    recovery_rate: Optional[float]
    exceptions_count: Optional[int]
    current_stage: Optional[str]
    last_updated_at: Optional[str]


class BatchListItem(BaseModel):
    batch_id: str
    started_at: str
    status: str
    total_transactions: int | None
    total_at_risk: float | None
    total_recovered: float | None
    recovery_rate: float | None
    exceptions_count: int | None


class CaseResponse(BaseModel):
    transaction_id: str
    type: str
    amount: float
    root_cause: Optional[str]
    action_type: Optional[str]
    result: Optional[str]
    amount_recovered: float
    updated_at: str


class AuditTrailResponse(BaseModel):
    transaction: Dict[str, Any]
    diagnosis: Optional[Dict[str, Any]]
    decision: Optional[Dict[str, Any]]
    actions: List[Dict[str, Any]]
    nudge_message: Optional[str] = None


app = FastAPI(title="Payment Recovery Agent")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://ai-revenue-recovery-eta-three.vercel.app",
        "http://localhost:3000",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(httpx.ReadError)
@app.exception_handler(httpx.ConnectError)
async def supabase_connection_error_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=503,
        content={
            "error": "Temporary database connection issue, please retry.",
            "detail": str(exc),
        },
    )


def _as_float(value: Any, default: Optional[float] = None) -> Optional[float]:
    if value is None:
        return default
    return float(value)


def _latest_timestamp(*rows: Optional[Dict[str, Any]]) -> str:
    timestamps = [
        row["created_at"]
        for row in rows
        if row and row.get("created_at")
    ]
    return max(timestamps) if timestamps else ""


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/api/batch/run", response_model=BatchRunResponse)
def start_batch(
    background_tasks: BackgroundTasks,
    request: Optional[BatchRunRequest] = None,
) -> BatchRunResponse:
    batch_id = str(uuid.uuid4())
    count = request.count if request and request.count is not None else DEFAULT_BATCH_SIZE
    with_retry(lambda: supabase.table("batch_runs").insert({
        "id": batch_id,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "total_transactions": 0,
        "total_at_risk": 0,
        "total_recovered": 0,
        "recovery_rate": 0,
        "exceptions_count": 0,
    }).execute())
    background_tasks.add_task(run_full_pipeline, count, batch_id)
    return BatchRunResponse(batch_id=batch_id, status="running")


@app.get("/api/batch/{batch_id}/summary", response_model=BatchSummaryResponse)
def get_batch_summary(batch_id: str) -> BatchSummaryResponse:
    result = with_retry(lambda: supabase.table("batch_runs").select("*").eq("id", batch_id).execute())
    if not result.data:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} was not found.")

    row = result.data[0]
    return BatchSummaryResponse(
        batch_id=batch_id,
        status="completed" if row.get("completed_at") else "running",
        total_transactions=row.get("total_transactions"),
        total_at_risk=_as_float(row.get("total_at_risk")),
        total_recovered=_as_float(row.get("total_recovered")),
        recovery_rate=_as_float(row.get("recovery_rate")),
        exceptions_count=row.get("exceptions_count"),
        current_stage=row.get("current_stage"),
        last_updated_at=row.get("last_updated_at"),
    )


@app.get("/api/batches", response_model=list[BatchListItem])
def get_batches() -> list[BatchListItem]:
    result = with_retry(lambda: supabase.table("batch_runs").select("*").order("started_at", desc=True).execute())
    return [
        BatchListItem(
            batch_id=row["id"],
            started_at=row["started_at"],
            status="completed" if row.get("completed_at") else "running",
            total_transactions=row.get("total_transactions"),
            total_at_risk=_as_float(row.get("total_at_risk")),
            total_recovered=_as_float(row.get("total_recovered")),
            recovery_rate=_as_float(row.get("recovery_rate")),
            exceptions_count=row.get("exceptions_count"),
        )
        for row in result.data
    ]


@app.get("/")
def root():
    return {"service": "recovery-agent-backend", "status": "ok"}

@app.get("/api/batch/{batch_id}/cases", response_model=List[CaseResponse])
def get_batch_cases(batch_id: str) -> List[CaseResponse]:
    transactions = with_retry(lambda: (
        supabase.table("transactions")
        .select("*")
        .eq("batch_id", batch_id)
        .execute()
    )).data
    transaction_ids = [transaction["id"] for transaction in transactions]
    if not transaction_ids:
        return []

    diagnoses = with_retry(lambda: (
        supabase.table("diagnoses")
        .select("*")
        .in_("transaction_id", transaction_ids)
        .order("created_at", desc=True)
        .execute()
    )).data
    decisions = with_retry(lambda: (
        supabase.table("decisions")
        .select("*")
        .in_("transaction_id", transaction_ids)
        .order("created_at", desc=True)
        .execute()
    )).data
    actions = with_retry(lambda: (
        supabase.table("actions")
        .select("*")
        .in_("transaction_id", transaction_ids)
        .execute()
    )).data

    diagnosis_by_transaction = {}
    for diagnosis in diagnoses:
        diagnosis_by_transaction.setdefault(diagnosis["transaction_id"], diagnosis)

    decision_by_transaction = {}
    for decision in decisions:
        decision_by_transaction.setdefault(decision["transaction_id"], decision)

    latest_action_by_transaction = {}
    for action in actions:
        transaction_id = action["transaction_id"]
        latest = latest_action_by_transaction.get(transaction_id)
        if latest is None or action["attempt_number"] > latest["attempt_number"]:
            latest_action_by_transaction[transaction_id] = action

    cases = []
    for transaction in transactions:
        transaction_id = transaction["id"]
        diagnosis = diagnosis_by_transaction.get(transaction_id)
        decision = decision_by_transaction.get(transaction_id)
        action = latest_action_by_transaction.get(transaction_id)
        cases.append(CaseResponse(
            transaction_id=transaction_id,
            type=transaction["type"],
            amount=float(transaction["amount"]),
            root_cause=diagnosis.get("root_cause") if diagnosis else None,
            action_type=decision.get("action_type") if decision else None,
            result=action.get("result") if action else None,
            amount_recovered=(
                _as_float(action.get("amount_recovered"), 0.0) or 0.0
                if action
                else 0.0
            ),
            updated_at=_latest_timestamp(transaction, diagnosis, decision, action),
        ))
    return cases


@app.get("/api/nudges")
def get_nudges(batch_id: str):
    transactions = with_retry(lambda: (
        supabase.table("transactions")
        .select("*")
        .eq("batch_id", batch_id)
        .execute()
    )).data
    if not transactions:
        return []

    transaction_ids = [transaction["id"] for transaction in transactions]

    diagnoses = with_retry(lambda: (
        supabase.table("diagnoses")
        .select("*")
        .in_("transaction_id", transaction_ids)
        .order("created_at", desc=True)
        .execute()
    )).data
    decisions = with_retry(lambda: (
        supabase.table("decisions")
        .select("*")
        .in_("transaction_id", transaction_ids)
        .order("created_at", desc=True)
        .execute()
    )).data
    actions = with_retry(lambda: (
        supabase.table("actions")
        .select("*")
        .in_("transaction_id", transaction_ids)
        .execute()
    )).data

    diagnosis_by_transaction = {}
    for diagnosis in diagnoses:
        diagnosis_by_transaction.setdefault(diagnosis["transaction_id"], diagnosis)

    decision_by_transaction = {}
    for decision in decisions:
        decision_by_transaction.setdefault(decision["transaction_id"], decision)

    latest_action_by_transaction = {}
    for action in actions:
        transaction_id = action["transaction_id"]
        latest = latest_action_by_transaction.get(transaction_id)
        if latest is None or action["attempt_number"] > latest["attempt_number"]:
            latest_action_by_transaction[transaction_id] = action

    sent_by_transaction = {}
    for action in actions:
        if action.get("action_type") == "email_nudge_sent":
            sent_by_transaction.setdefault(action["transaction_id"], action)

    results = []
    for transaction in transactions:
        transaction_id = transaction["id"]
        decision = decision_by_transaction.get(transaction_id)
        if not decision or decision.get("action_type") != "nudge":
            continue

        demo_email = demo_email_for(transaction.get("customer_name"))
        results.append({
            "transaction_id": transaction_id,
            "customer_name": transaction.get("customer_name"),
            "amount": float(transaction.get("amount") or 0.0),
            "demo_email": demo_email,
            "message_preview": build_nudge_message(transaction),
            "send_status": "sent" if transaction_id in sent_by_transaction else "not_sent",
        })
    return results


@app.post("/api/nudge/{transaction_id}/send")
def send_transaction_nudge(transaction_id: str):
    transaction_result = with_retry(lambda: (
        supabase.table("transactions")
        .select("*")
        .eq("id", transaction_id)
        .execute()
    ))
    if not transaction_result.data:
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} was not found.")

    transaction = transaction_result.data[0]
    demo_email = demo_email_for(transaction.get("customer_name"))
    message = build_nudge_message(transaction)
    result = send_nudge_email(demo_email, transaction.get("customer_name"), message)

    action_rows = with_retry(lambda: (
        supabase.table("actions")
        .select("*")
        .eq("transaction_id", transaction_id)
        .execute()
    )).data
    next_attempt = max(
        [int(r.get("attempt_number", 0)) for r in action_rows if isinstance(r.get("attempt_number"), int)],
        default=0,
    ) + 1

    with_retry(lambda: supabase.table("actions").insert({
        "transaction_id": transaction_id,
        "attempt_number": next_attempt,
        "action_type": "email_nudge_sent",
        "razorpay_call": None,
        "result": "success" if result.get("success") else "failed",
        "amount_recovered": 0,
    }).execute())

    return {
        "success": bool(result.get("success")),
        "demo_email": demo_email,
        "error": result.get("error") if not result.get("success") else None,
    }


@app.get("/api/case/{transaction_id}/audit-trail", response_model=AuditTrailResponse)
def get_case_audit_trail(transaction_id: str) -> AuditTrailResponse:
    transaction_result = with_retry(lambda: (
        supabase.table("transactions")
        .select("*")
        .eq("id", transaction_id)
        .execute()
    ))
    if not transaction_result.data:
        raise HTTPException(
            status_code=404,
            detail=f"Transaction {transaction_id} was not found.",
        )

    diagnosis_result = with_retry(lambda: (
        supabase.table("diagnoses")
        .select("*")
        .eq("transaction_id", transaction_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    ))
    decision_result = with_retry(lambda: (
        supabase.table("decisions")
        .select("*")
        .eq("transaction_id", transaction_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    ))
    actions_result = with_retry(lambda: (
        supabase.table("actions")
        .select("*")
        .eq("transaction_id", transaction_id)
        .order("attempt_number", desc=False)
        .execute()
    ))

    return AuditTrailResponse(
        transaction=transaction_result.data[0],
        diagnosis=diagnosis_result.data[0] if diagnosis_result.data else None,
        decision=decision_result.data[0] if decision_result.data else None,
        actions=actions_result.data,
    )