import io
from datetime import datetime
from typing import Any, Dict, List

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


def format_curr(value: float) -> str:
    return f"INR {value:,.2f}"


def generate_pdf_report(
    email: str, analytics_data: Dict[str, Any], transactions: List[Dict[str, Any]]
) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36,
    )
    story = []
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=26,
        textColor=colors.HexColor("#06131F"),
    )
    subtitle_style = ParagraphStyle(
        "DocSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica-Oblique",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#4A607A"),
    )
    section_heading = ParagraphStyle(
        "SectionHeading",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=17,
        textColor=colors.HexColor("#10304A"),
        spaceBefore=12,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "BodyTextCustom",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#1C2D42"),
    )

    # 1. Header Banner / Cover Section
    story.append(Paragraph("FINPSYCH • BEHAVIORAL FINANCE PLATFORM", subtitle_style))
    story.append(Spacer(1, 4))
    story.append(Paragraph("Executive Financial & Behavioral Intelligence Report", title_style))
    story.append(Spacer(1, 4))
    story.append(
        Paragraph(
            f"<b>Client Account:</b> {email} &nbsp;|&nbsp; <b>Generated:</b> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} &nbsp;|&nbsp; <b>Currency:</b> INR",
            body_style,
        )
    )
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#64C8FF"), spaceAfter=12))

    # 2. Executive Summary Metrics Table
    story.append(Paragraph("1. Executive Summary", section_heading))
    total_exp = analytics_data.get("total_expenses", 0)
    total_inc = analytics_data.get("total_income", 0)
    net_bal = analytics_data.get("net_balance", 0)
    budget = analytics_data.get("monthly_budget", 50000)
    health_score = analytics_data.get("scores", {}).get("financial_health_score", 75)
    health_label = analytics_data.get("scores", {}).get("health_label", "Good")

    summary_table_data = [
        ["Monthly Budget", "Total Expenses", "Total Income", "Net Balance", "Financial Health"],
        [
            format_curr(budget),
            format_curr(total_exp),
            format_curr(total_inc),
            format_curr(net_bal),
            f"{health_score}/100 ({health_label})",
        ],
    ]
    t_sum = Table(summary_table_data, colWidths=[108, 108, 108, 108, 108])
    t_sum.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#10304A")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#F0F4F8")),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ]
        )
    )
    story.append(t_sum)
    story.append(Spacer(1, 12))

    # 3. Behavioral Profile & Clustering Analysis
    story.append(Paragraph("2. Behavioral Intelligence & ML Profile", section_heading))
    prof = analytics_data.get("profile_details", {})
    prof_name = prof.get("name", "Balanced Planner")
    prof_conf = prof.get("confidence", 88)
    prof_reason = prof.get("reason", "Assigned based on spending discipline.")

    profile_text = (
        f"<b>Assigned Behavior Profile:</b> {prof_name} ({prof_conf}% Confidence)<br/>"
        f"<b>Algorithmic Explainability:</b> {prof_reason}<br/>"
        f"<b>Key Ratios:</b> Discretionary Spend Ratio: {analytics_data.get('food_ratio', 0) + analytics_data.get('shopping_ratio', 0)}% | "
        f"Late-Night Spending Ratio: {analytics_data.get('late_night_ratio', 0)}% | Weekend Spending Ratio: {analytics_data.get('weekend_ratio', 0)}%"
    )
    story.append(Paragraph(profile_text, body_style))
    story.append(Spacer(1, 10))

    # 4. Financial Health Score Breakdown Table
    story.append(Paragraph("3. Financial Health Score Formula Breakdown", section_heading))
    breakdown_list = analytics_data.get("scores", {}).get("breakdown", [])
    breakdown_table_data = [["Factor Name", "Weight", "Calculated Score", "Point Contribution"]]
    for item in breakdown_list:
        breakdown_table_data.append([item["factor"], item["weight"], f"{item['score']}%", item["impact"]])

    t_break = Table(breakdown_table_data, colWidths=[140, 80, 140, 180])
    t_break.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#06131F")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("ALIGN", (2, 0), (3, -1), "CENTER"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
            ]
        )
    )
    story.append(t_break)
    story.append(Spacer(1, 12))

    # 5. Machine Learning Anomaly Detection Analysis
    story.append(Paragraph("4. Isolation Forest Anomaly Analysis", section_heading))
    anomalies = analytics_data.get("anomalies", [])
    if anomalies:
        anom_table_data = [["Date", "Description", "Category", "Amount", "Anomaly Score", "Explanation"]]
        for anom in anomalies[:8]:
            anom_table_data.append(
                [
                    anom.get("date", ""),
                    Paragraph(anom.get("description", ""), body_style),
                    anom.get("category", ""),
                    format_curr(anom.get("amount", 0)),
                    f"{anom.get('anomaly_score', 0)} ({anom.get('confidence', 90)}%)",
                    Paragraph(anom.get("explanation", ""), body_style),
                ]
            )
        t_anom = Table(anom_table_data, colWidths=[55, 100, 65, 75, 75, 170])
        t_anom.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#7F1D1D")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#FECACA")),
                ]
            )
        )
        story.append(t_anom)
    else:
        story.append(Paragraph("✓ Zero anomalous transactions detected by Isolation Forest algorithm.", body_style))
    story.append(Spacer(1, 12))

    # 6. AI Coach Recommendations
    story.append(Paragraph("5. AI Financial Advisor Recommendations", section_heading))
    coach_text = analytics_data.get("coach_message", "Maintain balanced spending habits.")
    story.append(Paragraph(f"<b>Grounded Advisory:</b> {coach_text}", body_style))
    story.append(Spacer(1, 12))

    # 7. Itemized Transactions Audit Table
    story.append(Paragraph("6. Itemized Transactions Audit Sheet (Recent)", section_heading))
    tx_table_data = [["Date", "Description", "Category", "Type", "Amount"]]
    for tx in transactions[:15]:
        tx_table_data.append(
            [
                tx.get("date", ""),
                Paragraph(tx.get("description", ""), body_style),
                tx.get("category", ""),
                tx.get("type", "expense").upper(),
                format_curr(tx.get("amount", 0)),
            ]
        )
    t_tx = Table(tx_table_data, colWidths=[65, 185, 95, 65, 130])
    t_tx.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E293B")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("ALIGN", (4, 0), (4, -1), "RIGHT"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ]
        )
    )
    story.append(t_tx)
    story.append(Spacer(1, 16))

    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#CBD5E1"), spaceAfter=8))
    story.append(
        Paragraph("FinPsych Platform • Confidential Financial Intelligence Report • Page 1 of 1", subtitle_style)
    )

    doc.build(story)
    return buffer.getvalue()
