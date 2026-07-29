import hashlib
import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from security import hash_password, verify_password

DB_PATH = Path(__file__).resolve().parent / "finpsych.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with get_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                monthly_budget REAL DEFAULT 50000.0
            );
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_email TEXT NOT NULL,
                description TEXT NOT NULL,
                amount REAL NOT NULL,
                category TEXT NOT NULL,
                date TEXT NOT NULL,
                type TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS analytics_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_email TEXT UNIQUE NOT NULL,
                payload TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                cache_key TEXT
            );
            CREATE TABLE IF NOT EXISTS subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_email TEXT NOT NULL,
                name TEXT NOT NULL,
                amount REAL NOT NULL,
                frequency TEXT NOT NULL,
                status TEXT NOT NULL,
                next_date TEXT NOT NULL,
                source TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS activities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_email TEXT NOT NULL,
                event_type TEXT NOT NULL,
                title TEXT NOT NULL,
                details TEXT,
                timestamp TEXT NOT NULL
            );
            """
        )
        existing_cols = [row[1] for row in conn.execute("PRAGMA table_info(analytics_results)").fetchall()]
        if "cache_key" not in existing_cols:
            try:
                conn.execute("ALTER TABLE analytics_results ADD COLUMN cache_key TEXT")
            except sqlite3.OperationalError:
                pass


def register_user(email: str, password: str) -> Dict[str, Any]:
    with get_connection() as conn:
        hashed = hash_password(password)
        try:
            cursor = conn.execute(
                "INSERT INTO users (email, password, monthly_budget) VALUES (?, ?, 50000.0)",
                (email, hashed),
            )
            conn.commit()
            log_activity(email, "auth", "User Registered", "Created a new FinPsych account")
            return {"id": cursor.lastrowid, "email": email}
        except sqlite3.IntegrityError as exc:
            raise ValueError("User already exists") from exc


def authenticate_user(email: str, password: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, email, password, monthly_budget FROM users WHERE email = ?",
            (email,),
        ).fetchone()
        if not row:
            return None
        stored_pwd = row["password"]
        # Support legacy plaintext or hashed
        if stored_pwd == password or verify_password(password, stored_pwd):
            return {"id": row["id"], "email": row["email"], "monthly_budget": row["monthly_budget"]}
        return None


def get_user_budget(email: str) -> float:
    with get_connection() as conn:
        row = conn.execute("SELECT monthly_budget FROM users WHERE email = ?", (email,)).fetchone()
        return float(row["monthly_budget"]) if row else 50000.0


def set_user_budget(email: str, budget: float) -> float:
    with get_connection() as conn:
        conn.execute("UPDATE users SET monthly_budget = ? WHERE email = ?", (budget, email))
        conn.commit()
        log_activity(email, "budget_updated", "Budget Updated", f"Monthly budget set to ₹{budget:,.2f}")
    return budget


def list_transactions(
    email: str,
    search: str = "",
    category: str = "",
    type_filter: str = "",
    date: str = "",
    sort_by: str = "date",
    order: str = "desc",
    page: int = 1,
    limit: int = 1000,
) -> Dict[str, Any]:
    with get_connection() as conn:
        query = "SELECT * FROM transactions WHERE user_email = ?"
        params: List[Any] = [email]

        if search:
            query += " AND (description LIKE ? OR category LIKE ?)"
            params.extend([f"%{search}%", f"%{search}%"])
        if category:
            query += " AND category = ?"
            params.append(category)
        if type_filter:
            query += " AND type = ?"
            params.append(type_filter)
        if date:
            query += " AND date = ?"
            params.append(date)

        order_by = "date" if sort_by == "date" else "amount" if sort_by == "amount" else "id"
        direction = "ASC" if order.lower() == "asc" else "DESC"
        query += f" ORDER BY {order_by} {direction}, id DESC"

        total = conn.execute(f"SELECT COUNT(*) as count FROM ({query})", params).fetchone()["count"]
        offset = (page - 1) * limit
        rows = conn.execute(f"{query} LIMIT ? OFFSET ?", params + [limit, offset]).fetchall()

        items = [dict(row) for row in rows]
        total_pages = max(1, (total + limit - 1) // limit) if limit else 1
        return {"items": items, "total": total, "page": page, "limit": limit, "total_pages": total_pages}


def create_transaction(email: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    with get_connection() as conn:
        created_at = payload.get("created_at") or datetime.utcnow().isoformat()
        cursor = conn.execute(
            "INSERT INTO transactions (user_email, description, amount, category, date, type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (email, payload["description"], payload["amount"], payload["category"], payload["date"], payload["type"], created_at),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM transactions WHERE id = ?", (cursor.lastrowid,)).fetchone()
        res = dict(row)
        log_activity(email, "transaction_added", "Added Transaction", f"{res['description']} - ₹{res['amount']:,.2f} ({res['category']})")
        return res


def restore_transaction(email: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    with get_connection() as conn:
        created_at = payload.get("created_at") or datetime.utcnow().isoformat()
        cursor = conn.execute(
            "INSERT INTO transactions (user_email, description, amount, category, date, type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (email, payload["description"], payload["amount"], payload["category"], payload["date"], payload["type"], created_at),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM transactions WHERE id = ?", (cursor.lastrowid,)).fetchone()
        res = dict(row)
        log_activity(email, "transaction_restored", "Restored Transaction (Undo)", f"Restored {res['description']} - ₹{res['amount']:,.2f}")
        return res


def get_transaction(email: str, transaction_id: int) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM transactions WHERE id = ? AND user_email = ?", (transaction_id, email)).fetchone()
        return dict(row) if row else None


def update_transaction(email: str, transaction_id: int, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        conn.execute(
            "UPDATE transactions SET description = ?, amount = ?, category = ?, date = ?, type = ? WHERE id = ? AND user_email = ?",
            (payload["description"], payload["amount"], payload["category"], payload["date"], payload["type"], transaction_id, email),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM transactions WHERE id = ? AND user_email = ?", (transaction_id, email)).fetchone()
        if row:
            res = dict(row)
            log_activity(email, "transaction_updated", "Updated Transaction", f"{res['description']} - ₹{res['amount']:,.2f}")
            return res
        return None


def delete_transaction(email: str, transaction_id: int) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM transactions WHERE id = ? AND user_email = ?", (transaction_id, email)).fetchone()
        if not row:
            return None
        deleted_tx = dict(row)
        conn.execute("DELETE FROM transactions WHERE id = ? AND user_email = ?", (transaction_id, email))
        conn.commit()
        log_activity(email, "transaction_deleted", "Deleted Transaction", f"{deleted_tx['description']} - ₹{deleted_tx['amount']:,.2f}")
        return deleted_tx


def bulk_delete_transactions(email: str, transaction_ids: List[int]) -> int:
    if not transaction_ids:
        return 0
    with get_connection() as conn:
        placeholders = ",".join("?" for _ in transaction_ids)
        cursor = conn.execute(
            f"DELETE FROM transactions WHERE user_email = ? AND id IN ({placeholders})",
            [email] + transaction_ids,
        )
        conn.commit()
        deleted_count = cursor.rowcount
        if deleted_count > 0:
            log_activity(email, "bulk_deleted", "Bulk Deleted Transactions", f"Deleted {deleted_count} transactions")
        return deleted_count


def bulk_update_category(email: str, transaction_ids: List[int], new_category: str) -> int:
    if not transaction_ids:
        return 0
    with get_connection() as conn:
        placeholders = ",".join("?" for _ in transaction_ids)
        cursor = conn.execute(
            f"UPDATE transactions SET category = ? WHERE user_email = ? AND id IN ({placeholders})",
            [new_category, email] + transaction_ids,
        )
        conn.commit()
        updated_count = cursor.rowcount
        if updated_count > 0:
            log_activity(email, "bulk_updated", "Bulk Updated Category", f"Set category '{new_category}' for {updated_count} transactions")
        return updated_count


def make_cache_key(transactions: List[Dict[str, Any]]) -> str:
    ordered = sorted(transactions, key=lambda t: (t.get("id", 0), t.get("created_at", ""), t.get("amount", 0)))
    fingerprint = "|".join(
        f"{t.get('id')}:{t.get('amount')}:{t.get('category')}:{t.get('date')}:{t.get('created_at', '')}" for t in ordered
    )
    return hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()


def save_analytics(email: str, payload: Dict[str, Any], cache_key: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO analytics_results (user_email, payload, updated_at, cache_key) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(user_email) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at, cache_key = excluded.cache_key",
            (email, json.dumps(payload), payload.get("updated_at") or "", cache_key),
        )
        conn.commit()


def get_analytics(email: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("SELECT payload FROM analytics_results WHERE user_email = ?", (email,)).fetchone()
        if not row:
            return None
        return json.loads(row["payload"])


def get_analytics_row(email: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("SELECT payload, cache_key FROM analytics_results WHERE user_email = ?", (email,)).fetchone()
        if not row:
            return None
        return {"payload": json.loads(row["payload"]), "cache_key": row["cache_key"]}


def save_subscriptions(email: str, subscriptions: List[Dict[str, Any]]) -> None:
    with get_connection() as conn:
        for item in subscriptions:
            existing = conn.execute(
                "SELECT id FROM subscriptions WHERE user_email = ? AND name = ?",
                (email, item["name"]),
            ).fetchone()
            if not existing:
                conn.execute(
                    "INSERT INTO subscriptions (user_email, name, amount, frequency, status, next_date, source) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (email, item["name"], item["amount"], item["frequency"], item.get("status", "Active"), item["next_date"], item.get("source", "Detected")),
                )
        conn.commit()


def update_subscription_status(email: str, sub_id: int, status: str) -> bool:
    with get_connection() as conn:
        cursor = conn.execute(
            "UPDATE subscriptions SET status = ? WHERE id = ? AND user_email = ?",
            (status, sub_id, email),
        )
        conn.commit()
        if cursor.rowcount > 0:
            log_activity(email, "subscription_updated", "Subscription Status Changed", f"Set subscription #{sub_id} to {status}")
            return True
        return False


def get_subscriptions(email: str) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM subscriptions WHERE user_email = ? ORDER BY next_date", (email,)).fetchall()
        return [dict(row) for row in rows]


def log_activity(email: str, event_type: str, title: str, details: str = "") -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO activities (user_email, event_type, title, details, timestamp) VALUES (?, ?, ?, ?, ?)",
            (email, event_type, title, details, datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")),
        )
        conn.commit()


def get_activities(email: str, limit: int = 50) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM activities WHERE user_email = ? ORDER BY id DESC LIMIT ?",
            (email, limit),
        ).fetchall()
        return [dict(row) for row in rows]
