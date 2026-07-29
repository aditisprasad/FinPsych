import math
from typing import List, Dict


def detect_anomalies(transactions: List[Dict]) -> List[Dict]:
    expenses = [t for t in transactions if t.get('type') == 'expense']
    if not expenses:
        return []

    avg = sum(t['amount'] for t in expenses) / len(expenses)
    std = 0.0
    if len(expenses) > 1:
        variance = sum((t['amount'] - avg) ** 2 for t in expenses) / len(expenses)
        std = math.sqrt(variance)

    outliers = []
    for item in expenses:
        z_score = 0 if std == 0 else abs(item['amount'] - avg) / std
        if item['amount'] >= avg * 1.8 or z_score >= 1.5:
            outliers.append(item)
    return outliers


def cluster_profile(transactions: List[Dict]) -> str:
    expenses = [t for t in transactions if t.get('type') == 'expense']
    if not expenses:
        return 'New Starter'

    avg_spend = sum(t['amount'] for t in expenses) / len(expenses)
    recurring = sum(1 for t in expenses if t.get('category') in {'Lifestyle', 'Food', 'Subscription'})

    if avg_spend > 5000 or recurring >= 3:
        return 'Impulse Curator'
    if avg_spend > 2500:
        return 'Balanced Planner'
    return 'Steady Builder'


def forecast_next_month(transactions: List[Dict]) -> float:
    expenses = [t for t in transactions if t.get('type') == 'expense']
    if not expenses:
        return 0.0

    values = [t['amount'] for t in expenses]
    trend = sum(values[-3:]) / max(1, len(values[-3:]))
    return round(trend * 1.08, 2)
