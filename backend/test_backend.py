import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import db
import main
from pdf_service import generate_pdf_report


class BackendRegressionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(dir=str(Path(__file__).resolve().parent))
        self.temp_db = Path(self.temp_dir.name) / "test_finpsych.db"
        db.DB_PATH = self.temp_db
        db.init_db()

    def tearDown(self) -> None:
        try:
            self.temp_dir.cleanup()
        except Exception:
            pass

    def test_transaction_creation_and_analytics(self) -> None:
        tx = main.create_transaction_route(
            main.Transaction(
                description="Groceries",
                amount=2500.0,
                category="Food",
                date="2026-07-28",
                type="expense",
            ),
            email="test@example.com",
        )
        self.assertEqual(tx["description"], "Groceries")
        self.assertEqual(tx["amount"], 2500.0)

        dash = main.get_dashboard(email="test@example.com")
        self.assertEqual(dash["total_expenses"], 2500.0)
        self.assertIn("scores", dash)
        self.assertIn("financial_health_score", dash["scores"])
        self.assertIn("profile_details", dash)

    def test_csv_import_and_recalculation(self) -> None:
        csv_content = (
            "description,amount,category,date,type\n"
            "Salary,75000,Salary,2026-07-01,income\n"
            "Rent,15000,Utilities,2026-07-02,expense\n"
            "Netflix,649,Subscription,2026-07-05,expense\n"
            "InvalidRow,-50,Unknown,,expense\n"
        )
        res = main.import_csv(main.CsvImportPayload(csv_text=csv_content), email="test@example.com")
        self.assertEqual(res["imported"], 3)
        self.assertEqual(res["rejected"], 1)

        dash = main.get_dashboard(email="test@example.com")
        self.assertEqual(dash["total_income"], 75000.0)
        self.assertEqual(dash["total_expenses"], 15649.0)

    def test_anomaly_detection_and_ml_models(self) -> None:
        # Create normal transactions and one large anomaly
        for i in range(5):
            main.create_transaction_route(
                main.Transaction(
                    description=f"Coffee {i}",
                    amount=150.0,
                    category="Lifestyle",
                    date=f"2026-07-1{i}",
                    type="expense",
                ),
                email="anom@example.com",
            )
        # Large anomaly transaction
        main.create_transaction_route(
            main.Transaction(
                description="Expensive Gadget",
                amount=18000.0,
                category="Lifestyle",
                date="2026-07-20",
                type="expense",
            ),
            email="anom@example.com",
        )

        dash = main.get_dashboard(email="anom@example.com")
        self.assertTrue(len(dash["anomalies"]) > 0)
        anom = dash["anomalies"][0]
        self.assertIn("reason", anom)
        self.assertIn("confidence", anom)

    def test_ai_coach_analytics_grounding(self) -> None:
        main.create_transaction_route(
            main.Transaction(
                description="Dinner",
                amount=2000.0,
                category="Food",
                date="2026-07-28",
                type="expense",
            ),
            email="coach@example.com",
        )
        msg = main.coach_message({"question": "How can I save more?"}, email="coach@example.com")
        self.assertIn("response", msg)
        self.assertIn("Food", msg["response"])

    def test_pdf_report_generation(self) -> None:
        dash = main.get_dashboard(email="pdf@example.com")
        pdf_bytes = generate_pdf_report("pdf@example.com", dash, [])
        self.assertTrue(len(pdf_bytes) > 500)
        self.assertTrue(pdf_bytes.startswith(b"%PDF"))


if __name__ == "__main__":
    unittest.main()
