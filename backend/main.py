import csv
import io
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, Header, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

sys.path.append(str(Path(__file__).resolve().parent))
from analytics_service import build_analytics
from db import (
    authenticate_user,
    bulk_delete_transactions,
    bulk_update_category,
    create_transaction as create_db_transaction,
    delete_transaction as delete_db_transaction,
    get_activities,
    get_analytics_row,
    get_subscriptions,
    get_transaction,
    get_user_budget,
    init_db,
    list_transactions,
    log_activity,
    make_cache_key,
    register_user,
    restore_transaction as restore_db_transaction,
    set_user_budget,
    update_subscription_status,
    update_transaction as update_db_transaction,
)
from ml_service import run_ml_models
from pdf_service import generate_pdf_report
from security import create_access_token, decode_access_token

app = FastAPI(
    title="FinPsych API",
    version="2.0.0",
    description="Production-grade AI-powered behavioral finance intelligence platform backend",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate Limiting state
REQUEST_TIMES: Dict[str, List[float]] = {}


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    client_ip = request.client.host if request.client else "127.0.0.1"
    now = time.time()
    times = REQUEST_TIMES.get(client_ip, [])
    times = [t for t in times if now - t < 60]  # keep requests from last 60s
    if len(times) > 300:  # Allow 300 requests per minute
        return Response(content='{"detail":"Rate limit exceeded. Please wait a moment."}', status_code=429, media_type="application/json")
    times.append(now)
    REQUEST_TIMES[client_ip] = times
    response = await call_next(request)
    return response


class Transaction(BaseModel):
    description: str
    amount: float
    category: str
    date: str
    type: str = "expense"


class BudgetUpdate(BaseModel):
    monthly_budget: float


class AuthPayload(BaseModel):
    email: str
    password: str


class CsvImportPayload(BaseModel):
    csv_text: str


class SubscriptionStatusUpdate(BaseModel):
    status: str


class BulkDeletePayload(BaseModel):
    ids: List[int]


class BulkCategoryPayload(BaseModel):
    ids: List[int]
    category: str


class RestoreTxPayload(BaseModel):
    description: str
    amount: float
    category: str
    date: str
    type: str = "expense"
    created_at: Optional[str] = None


init_db()


def _parse_date(date_str: str) -> datetime:
    try:
        return datetime.strptime(date_str, "%Y-%m-%d")
    except Exception:
        return datetime.utcnow()


def _aggregate_weekly_spending(transactions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    weekly = {}
    for tx in transactions:
        if tx.get("type") == "expense":
            dt = _parse_date(tx["date"])
            week_label = dt.strftime("W%U")
            weekly[week_label] = weekly.get(week_label, 0.0) + float(tx["amount"])
    if not weekly:
        return [{"week": "W1", "value": 0.0}]
    return [{"week": week, "value": round(amount, 2)} for week, amount in sorted(weekly.items())]


def _build_chart_data(transactions: List[Dict[str, Any]], analytics: Dict[str, Any]) -> Dict[str, Any]:
    monthly = {}
    heatmap = {day: 0.0 for day in ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}
    for tx in transactions:
        if tx.get("type") == "expense":
            dt = _parse_date(tx["date"])
            month_key = dt.strftime("%b")
            monthly[month_key] = monthly.get(month_key, 0.0) + float(tx["amount"])
            weekday_key = dt.strftime("%a")
            heatmap[weekday_key] = heatmap.get(weekday_key, 0.0) + float(tx["amount"])

    monthly_spending = [{"month": month, "value": round(amount, 2)} for month, amount in sorted(monthly.items())]
    if not monthly_spending:
        monthly_spending = [{"month": datetime.now().strftime("%b"), "value": analytics.get("total_expenses", 0)}]

    weekly_spending = _aggregate_weekly_spending(transactions)
    forecast = analytics.get("forecast", 0)

    forecast_comparison = [
        {"name": "Actual Spend", "value": analytics.get("total_expenses", 0)},
        {"name": "Forecasted", "value": round(forecast, 2)},
        {"name": "Budget Cap", "value": round(analytics.get("monthly_budget", 0), 2)},
    ]

    heatmap_data = [{"day": day, "value": round(amount, 2)} for day, amount in heatmap.items()]
    return {
        "monthly_spending": monthly_spending,
        "category_breakdown": analytics.get("category_breakdown", []),
        "income_vs_expense": [
            {"name": "Income", "value": analytics.get("total_income", 0)},
            {"name": "Expense", "value": analytics.get("total_expenses", 0)},
        ],
        "budget_progress": [
            {"name": "Used", "value": analytics.get("budget_utilization", 0)},
            {"name": "Remaining", "value": max(0, 100 - analytics.get("budget_utilization", 0))},
        ],
        "weekly_spending": weekly_spending,
        "forecast_comparison": forecast_comparison,
        "spending_heatmap": heatmap_data,
    }


def _compute_dashboard(email: str) -> Dict[str, Any]:
    transaction_list = list_transactions(email, limit=5000)
    transactions_for_user = transaction_list["items"]
    cache_key = make_cache_key(transactions_for_user)
    cached = get_analytics_row(email)
    current_budget = get_user_budget(email)

    if cached and cached.get("cache_key") == cache_key and cached["payload"].get("monthly_budget") == current_budget:
        analytics = cached["payload"]
    else:
        analytics = build_analytics(email, transactions_for_user)

    analytics["charts"] = _build_chart_data(transactions_for_user, analytics)

    activities = get_activities(email, limit=30)
    if not activities:
        activities = [
            {
                "id": 1,
                "event_type": "info",
                "title": "Welcome to FinPsych",
                "details": "System ready for behavioral financial analytics",
                "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
            }
        ]

    analytics["timeline_cards"] = activities
    analytics["recent_activity"] = activities
    return analytics


@app.get("/")
def home():
    return {
        "message": "FinPsych API v2.0 is running",
        "project": "AI-Powered Behavioral Finance Intelligence Platform",
        "status": "Production Ready",
    }


@app.get("/health")
def health_check():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


@app.post("/api/auth/register")
def register(payload: AuthPayload):
    try:
        user = register_user(payload.email, payload.password)
        token = create_access_token({"sub": user["email"]})
        return {"message": "User registered", "token": token, "user": {"email": user["email"]}}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/auth/login")
def login(payload: AuthPayload):
    user = authenticate_user(payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token({"sub": user["email"]})
    log_activity(payload.email, "auth", "User Logged In", "Signed into dashboard session")
    return {"message": "Login successful", "token": token, "user": {"email": user["email"]}}


@app.get("/api/dashboard")
def get_dashboard(email: str = "demo@finpsych.com"):
    return _compute_dashboard(email)


@app.get("/api/ml/info")
def get_ml_info(email: str = "demo@finpsych.com"):
    dash = _compute_dashboard(email)
    return {
        "ml_pipeline_info": dash.get("ml_pipeline_info", {}),
        "anomalies_count": len(dash.get("anomalies", [])),
        "profile": dash.get("profile_details", {}),
        "forecast": dash.get("forecast", 0),
        "forecast_confidence": dash.get("forecast_confidence", 85.0),
    }


@app.get("/api/transactions")
def get_transactions(
    email: str = "demo@finpsych.com",
    search: str = "",
    category: str = "",
    type_filter: str = "",
    sort_by: str = "date",
    order: str = "desc",
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=500),
):
    return list_transactions(
        email,
        search=search,
        category=category,
        type_filter=type_filter,
        sort_by=sort_by,
        order=order,
        page=page,
        limit=limit,
    )


@app.post("/api/transactions")
def create_transaction_route(payload: Transaction, email: str = "demo@finpsych.com"):
    created = create_db_transaction(
        email,
        {
            "description": payload.description,
            "amount": payload.amount,
            "category": payload.category,
            "date": payload.date,
            "type": payload.type,
        },
    )
    _compute_dashboard(email)
    return created


@app.post("/api/transactions/restore")
def restore_transaction_route(payload: RestoreTxPayload, email: str = "demo@finpsych.com"):
    restored = restore_db_transaction(
        email,
        {
            "description": payload.description,
            "amount": payload.amount,
            "category": payload.category,
            "date": payload.date,
            "type": payload.type,
            "created_at": payload.created_at,
        },
    )
    _compute_dashboard(email)
    return restored


@app.put("/api/transactions/{transaction_id}")
def update_transaction_route(transaction_id: int, payload: Transaction, email: str = "demo@finpsych.com"):
    updated = update_db_transaction(
        email,
        transaction_id,
        {
            "description": payload.description,
            "amount": payload.amount,
            "category": payload.category,
            "date": payload.date,
            "type": payload.type,
        },
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Transaction not found")
    _compute_dashboard(email)
    return updated


@app.delete("/api/transactions/{transaction_id}")
def delete_transaction_route(transaction_id: int, email: str = "demo@finpsych.com"):
    deleted = delete_db_transaction(email, transaction_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Transaction not found")
    _compute_dashboard(email)
    return {"deleted": True, "transaction": deleted}


@app.post("/api/transactions/bulk-delete")
def bulk_delete_route(payload: BulkDeletePayload, email: str = "demo@finpsych.com"):
    count = bulk_delete_transactions(email, payload.ids)
    _compute_dashboard(email)
    return {"deleted_count": count}


@app.post("/api/transactions/bulk-category")
def bulk_category_route(payload: BulkCategoryPayload, email: str = "demo@finpsych.com"):
    count = bulk_update_category(email, payload.ids, payload.category)
    _compute_dashboard(email)
    return {"updated_count": count, "category": payload.category}


@app.post("/api/transactions/{transaction_id}/duplicate")
def duplicate_transaction_route(transaction_id: int, email: str = "demo@finpsych.com"):
    original = get_transaction(email, transaction_id)
    if not original:
        raise HTTPException(status_code=404, detail="Transaction not found")
    duplicated = create_db_transaction(
        email,
        {
            "description": f"{original['description']} (Copy)",
            "amount": original["amount"],
            "category": original["category"],
            "date": datetime.today().strftime("%Y-%m-%d"),
            "type": original["type"],
        },
    )
    log_activity(email, "transaction_duplicated", "Duplicated Transaction", f"Copied {original['description']}")
    _compute_dashboard(email)
    return duplicated


@app.post("/api/budget")
def update_budget(payload: BudgetUpdate, email: str = "demo@finpsych.com"):
    new_budget = set_user_budget(email, payload.monthly_budget)
    _compute_dashboard(email)
    return {"monthly_budget": new_budget}


@app.get("/api/insights")
def get_insights(email: str = "demo@finpsych.com"):
    data = _compute_dashboard(email)
    return {
        "currency": data["currency"],
        "insights": data.get("insights", []),
        "profile": data.get("profile_details", {}),
        "scores": data.get("scores", {}),
        "coach_message": data["coach_message"],
        "budget_message": data["budget_message"],
        "anomalies": data.get("anomalies", []),
        "ml_pipeline_info": data.get("ml_pipeline_info", {}),
    }


@app.post("/api/import/csv")
def import_csv(payload: CsvImportPayload, email: str = "demo@finpsych.com"):
    lines = payload.csv_text.strip().splitlines()
    if not lines:
        return {"imported": 0, "rejected": 0}

    reader = csv.DictReader(io.StringIO(payload.csv_text))
    imported = 0
    rejected = 0

    for row in reader:
        try:
            desc = row.get("description", "").strip()
            amount_val = float(row.get("amount", 0))
            category = row.get("category", "Uncategorized").strip()
            date_val = row.get("date", datetime.today().strftime("%Y-%m-%d")).strip()
            type_val = row.get("type", "expense").strip().lower()

            if not desc or amount_val <= 0 or not category or not date_val:
                rejected += 1
                continue

            create_db_transaction(
                email,
                {
                    "description": desc,
                    "amount": amount_val,
                    "category": category,
                    "date": date_val,
                    "type": type_val if type_val in {"expense", "income"} else "expense",
                },
            )
            imported += 1
        except Exception:
            rejected += 1
            continue

    log_activity(email, "csv_imported", "CSV Imported", f"Imported {imported} transactions ({rejected} rejected)")
    _compute_dashboard(email)
    return {"imported": imported, "rejected": rejected}


@app.post("/api/coach/message")
def coach_message(payload: Dict[str, str], email: str = "demo@finpsych.com"):
    data = _compute_dashboard(email)
    question = payload.get("question", "").strip().lower()
    log_activity(email, "coach_consulted", "AI Coach Consulted", f"Asked: '{payload.get('question', '')[:40]}...'")

    total_expenses = data.get("total_expenses", 0)
    monthly_budget = data.get("monthly_budget", 50000)
    budget_rem = data.get("budget_remaining", 0)
    late_night = data.get("late_night_spending", 0)
    late_night_pct = data.get("late_night_ratio", 0)
    cats = data.get("category_breakdown", [])
    top_cat = cats[0]["name"] if cats else "Lifestyle"
    top_cat_amt = cats[0]["value"] if cats else 0
    top_cat_pct = round((top_cat_amt / max(1, total_expenses)) * 100, 1) if total_expenses else 0
    health_score = data.get("scores", {}).get("financial_health_score", 75)
    risk_score = data.get("scores", {}).get("risk_score", 20)
    savings_ratio = data.get("savings_ratio", 0)

    if "save" in question or "saving" in question:
        response = (
            f"You spent ₹{total_expenses:,.0f} this month with a savings ratio of {savings_ratio}%. "
            f"{top_cat} is your largest expense component at ₹{top_cat_amt:,.0f} ({top_cat_pct}% of total spend). "
            f"At your current pace, you can increase savings by capping discretionary purchases in {top_cat} by 20% and avoiding late-night spending."
        )
    elif "overspend" in question or "why" in question:
        response = (
            f"You spent ₹{total_expenses:,.0f} against your ₹{monthly_budget:,.0f} monthly budget. "
            f"{late_night_pct}% of your spending days involved late-night transactions. "
            f"Your highest category is {top_cat} (₹{top_cat_amt:,.0f}). "
            f"Trimming high-frequency transactions in {top_cat} will immediately reduce your risk score from {risk_score}."
        )
    elif "category" in question or "highest" in question:
        response = (
            f"{top_cat} is your highest expense category at ₹{top_cat_amt:,.0f}, representing {top_cat_pct}% of your overall expenses. "
            f"The second highest category is {cats[1]['name'] if len(cats) > 1 else 'Food'} (₹{cats[1]['value'] if len(cats) > 1 else 0:,.0f})."
        )
    elif "health" in question or "healthy" in question:
        response = (
            f"Your Financial Health Score is {health_score}/100. "
            f"Your budget discipline is {data.get('scores', {}).get('budget_discipline_score', 0)}%, and risk score is {risk_score}. "
            f"You are on pace to finish the month ₹{abs(budget_rem):,.0f} {'below' if budget_rem >= 0 else 'above'} budget."
        )
    elif "improve" in question or "next" in question:
        response = (
            f"To improve your score from {health_score}/100: "
            f"1. Reduce late-night transactions ({late_night} occurred after 10 PM). "
            f"2. Lower spending in {top_cat} below {top_cat_pct}%. "
            f"3. Maintain a monthly savings ratio above 20%."
        )
    else:
        response = data["coach_message"]

    return {"response": response}


@app.get("/api/reports/pdf")
def download_pdf_report(email: str = "demo@finpsych.com"):
    data = _compute_dashboard(email)
    txs = list_transactions(email, limit=1000)["items"]
    pdf_bytes = generate_pdf_report(email, data, txs)
    log_activity(email, "report_generated", "PDF Report Generated", "Downloaded monthly financial PDF analysis")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=finpsych_report_{email.split('@')[0]}.pdf"},
    )


@app.get("/api/subscriptions")
def get_subscriptions_route(email: str = "demo@finpsych.com"):
    data = _compute_dashboard(email)
    return data.get("subscriptions", [])


@app.post("/api/subscriptions/{sub_id}/status")
def update_sub_status_route(sub_id: int, payload: SubscriptionStatusUpdate, email: str = "demo@finpsych.com"):
    success = update_subscription_status(email, sub_id, payload.status)
    if not success:
        raise HTTPException(status_code=404, detail="Subscription not found")
    _compute_dashboard(email)
    return {"updated": True, "id": sub_id, "status": payload.status}


@app.get("/api/timeline")
def get_timeline(email: str = "demo@finpsych.com"):
    data = _compute_dashboard(email)
    return data.get("timeline", [])


@app.get("/api/activities")
def get_activities_route(email: str = "demo@finpsych.com"):
    return get_activities(email, limit=50)


@app.get("/api/export/csv")
def export_csv_route(email: str = "demo@finpsych.com"):
    txs = list_transactions(email, limit=5000)["items"]
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "description", "amount", "category", "date", "type", "created_at"])
    for t in txs:
        writer.writerow([t.get("id"), t.get("description"), t.get("amount"), t.get("category"), t.get("date"), t.get("type"), t.get("created_at")])
    log_activity(email, "csv_exported", "Exported CSV", "Downloaded transactions list CSV")
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=finpsych_transactions_{email.split('@')[0]}.csv"},
    )
