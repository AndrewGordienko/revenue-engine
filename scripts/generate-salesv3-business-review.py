#!/usr/bin/env python3
"""Generate the SalesV3 portfolio business review PDF."""

from __future__ import annotations

import os
import shutil
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "SalesV3_Portfolio_Business_Review_2026-07-15.pdf"
DOCUMENTS_COPY = Path.home() / "Documents" / OUT.name
W, H = A4
M = 16 * mm
CW = W - 2 * M

INK = HexColor("#14213D")
NAVY = HexColor("#0B1F3A")
BLUE = HexColor("#2563EB")
SKY = HexColor("#DBEAFE")
TEAL = HexColor("#0F766E")
GREEN = HexColor("#16805D")
GREEN_BG = HexColor("#DFF5EA")
AMBER = HexColor("#B45309")
AMBER_BG = HexColor("#FEF3C7")
RED = HexColor("#B42318")
RED_BG = HexColor("#FEE4E2")
PURPLE = HexColor("#6D28D9")
PURPLE_BG = HexColor("#EDE9FE")
SLATE = HexColor("#475569")
MUTED = HexColor("#64748B")
LINE = HexColor("#D8E0EA")
PAPER = HexColor("#F6F8FB")
WHITE = colors.white

styles = getSampleStyleSheet()
P_BODY = ParagraphStyle(
    "body", parent=styles["BodyText"], fontName="Helvetica", fontSize=8.4,
    leading=11, textColor=INK, spaceAfter=0,
)
P_SMALL = ParagraphStyle(
    "small", parent=P_BODY, fontSize=7.2, leading=9.2, textColor=SLATE,
)
P_TINY = ParagraphStyle(
    "tiny", parent=P_BODY, fontSize=6.4, leading=8.0, textColor=SLATE,
)
P_HEAD = ParagraphStyle(
    "head", parent=P_BODY, fontName="Helvetica-Bold", fontSize=7.4,
    leading=9, textColor=WHITE,
)
P_CELL_HEAD = ParagraphStyle(
    "cellhead", parent=P_BODY, fontName="Helvetica-Bold", fontSize=7.1,
    leading=8.6, textColor=INK,
)
P_CELL = ParagraphStyle(
    "cell", parent=P_BODY, fontSize=6.9, leading=8.7, textColor=INK,
)
P_CELL_SMALL = ParagraphStyle(
    "cellsmall", parent=P_BODY, fontSize=6.3, leading=7.8, textColor=INK,
)


def esc(value: object) -> str:
    s = str(value)
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def para(value: object, style=P_CELL) -> Paragraph:
    return Paragraph(esc(value).replace("\n", "<br/>"), style)


def draw_wrapped(c: canvas.Canvas, text: str, x: float, y_top: float, width: float,
                 font="Helvetica", size=9, leading=12, color=INK, max_lines=None) -> float:
    words = str(text).split()
    lines, current = [], ""
    for word in words:
        trial = f"{current} {word}".strip()
        if stringWidth(trial, font, size) <= width or not current:
            current = trial
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    if max_lines and len(lines) > max_lines:
        lines = lines[:max_lines]
        while lines[-1] and stringWidth(lines[-1] + "...", font, size) > width:
            lines[-1] = lines[-1][:-1]
        lines[-1] += "..."
    c.setFont(font, size)
    c.setFillColor(color)
    y = y_top
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def pill(c, x, y, label, bg, fg, width=None):
    width = width or stringWidth(label, "Helvetica-Bold", 7) + 12
    c.setFillColor(bg)
    c.roundRect(x, y - 8, width, 14, 7, fill=1, stroke=0)
    c.setFillColor(fg)
    c.setFont("Helvetica-Bold", 7)
    c.drawCentredString(x + width / 2, y - 3.2, label)
    return width


def page_header(c, title, kicker, page_no):
    c.setFillColor(PAPER)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(NAVY)
    c.rect(0, H - 13 * mm, W, 13 * mm, fill=1, stroke=0)
    c.setFillColor(HexColor("#86B6FF"))
    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(M, H - 7.7 * mm, kicker.upper())
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(M, H - 20.5 * mm, title)
    c.setStrokeColor(LINE)
    c.line(M, 12 * mm, W - M, 12 * mm)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 6.7)
    c.drawString(M, 7.8 * mm, "SalesV3 portfolio business review | Private working document | 15 July 2026")
    c.drawRightString(W - M, 7.8 * mm, str(page_no))


def section_label(c, text, x, y):
    c.setFillColor(BLUE)
    c.setFont("Helvetica-Bold", 7.3)
    c.drawString(x, y, text.upper())


def callout(c, x, y_top, w, h, title, body, accent=BLUE, bg=WHITE):
    c.setFillColor(bg)
    c.setStrokeColor(LINE)
    c.roundRect(x, y_top - h, w, h, 7, fill=1, stroke=1)
    c.setFillColor(accent)
    c.roundRect(x, y_top - h, 4, h, 2, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x + 12, y_top - 18, title)
    draw_wrapped(c, body, x + 12, y_top - 33, w - 24, size=7.6, leading=10, color=SLATE)


def metric_cards(c, y_top, cards, x=M, width=CW, gap=7):
    n = len(cards)
    card_w = (width - gap * (n - 1)) / n
    h = 47
    for i, (value, label, note, color) in enumerate(cards):
        cx = x + i * (card_w + gap)
        c.setFillColor(WHITE)
        c.setStrokeColor(LINE)
        c.roundRect(cx, y_top - h, card_w, h, 7, fill=1, stroke=1)
        c.setFillColor(color)
        c.setFont("Helvetica-Bold", 15)
        c.drawString(cx + 10, y_top - 19, str(value))
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 7.1)
        c.drawString(cx + 10, y_top - 31, label.upper())
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 6.4)
        c.drawString(cx + 10, y_top - 41, note)


def make_table(c, data, x, y_top, col_widths, header=True, font=P_CELL,
               row_bgs=None, header_bg=NAVY, padding=5, grid=True):
    rows = []
    for ri, row in enumerate(data):
        style = P_HEAD if header and ri == 0 else font
        rows.append([para(v, style) for v in row])
    t = Table(rows, colWidths=col_widths, repeatRows=1 if header else 0, hAlign="LEFT")
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), padding),
        ("RIGHTPADDING", (0, 0), (-1, -1), padding),
        ("TOPPADDING", (0, 0), (-1, -1), padding),
        ("BOTTOMPADDING", (0, 0), (-1, -1), padding),
        ("BACKGROUND", (0, 0), (-1, 0), header_bg if header else WHITE),
    ]
    if grid:
        commands += [("GRID", (0, 0), (-1, -1), 0.45, LINE)]
    else:
        commands += [("LINEBELOW", (0, 0), (-1, -1), 0.45, LINE)]
    for ri in range(1 if header else 0, len(rows)):
        bg = row_bgs[ri - 1] if row_bgs and ri - 1 < len(row_bgs) else (WHITE if ri % 2 else HexColor("#F1F5F9"))
        commands.append(("BACKGROUND", (0, ri), (-1, ri), bg))
    t.setStyle(TableStyle(commands))
    tw, th = t.wrapOn(c, sum(col_widths), H)
    t.drawOn(c, x, y_top - th)
    return y_top - th


def bar(c, x, y, w, value, maximum, label, value_label, color=BLUE):
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 7.2)
    c.drawString(x, y + 9, label)
    c.setFillColor(HexColor("#E8EDF4"))
    c.roundRect(x, y - 1, w, 7, 3.5, fill=1, stroke=0)
    c.setFillColor(color)
    c.roundRect(x, y - 1, max(2, w * value / maximum), 7, 3.5, fill=1, stroke=0)
    c.setFillColor(SLATE)
    c.setFont("Helvetica-Bold", 7)
    c.drawRightString(x + w, y + 9, value_label)


def footer_note(c, text):
    draw_wrapped(c, text, M, 17 * mm, CW, size=6.4, leading=8, color=MUTED, max_lines=2)


def cover(c):
    c.setFillColor(NAVY)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(BLUE)
    c.circle(W - 34 * mm, H - 33 * mm, 52 * mm, fill=1, stroke=0)
    c.setFillColor(HexColor("#173E73"))
    c.circle(W - 4 * mm, H - 72 * mm, 38 * mm, fill=1, stroke=0)
    c.setFillColor(HexColor("#86B6FF"))
    c.setFont("Helvetica-Bold", 9)
    c.drawString(M, H - 40 * mm, "SALES OPERATING SYSTEM / PORTFOLIO REVIEW")
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 28)
    c.drawString(M, H - 60 * mm, "SalesV3")
    c.drawString(M, H - 73 * mm, "Business Review")
    draw_wrapped(
        c,
        "A full assessment of the sales platform, agent architecture, target markets, LinkedIn network, outreach performance, commercial evidence, gaps, and next moves.",
        M, H - 90 * mm, 125 * mm, size=11.5, leading=16, color=HexColor("#D9E7FF"),
    )
    c.setFillColor(HexColor("#17304F"))
    c.roundRect(M, H - 146 * mm, CW, 35 * mm, 9, fill=1, stroke=0)
    c.setFillColor(HexColor("#8EBBFF"))
    c.setFont("Helvetica-Bold", 8)
    c.drawString(M + 12, H - 121 * mm, "HEADLINE")
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(M + 12, H - 132 * mm, "Strong system. Early commercial signal.")
    c.setFont("Helvetica", 9)
    c.setFillColor(HexColor("#D9E7FF"))
    c.drawString(M + 12, H - 141 * mm, "The priority is now operational truth, follow-through, and conversion - not more architecture.")
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(M, 29 * mm, "Prepared 15 July 2026")
    c.setFillColor(HexColor("#9DB2CF"))
    c.setFont("Helvetica", 7.5)
    c.drawString(M, 23 * mm, "Private working document | Snapshot of local SalesV3 data and codebase")
    c.showPage()


def executive(c, page_no):
    page_header(c, "Executive readout", "01 / portfolio status", page_no)
    y = H - 31 * mm
    metric_cards(c, y, [
        ("765", "LinkedIn connections", "cleaned catalogue", BLUE),
        ("198", "CRM leads", "across 3 ventures", PURPLE),
        ("36%", "Any-reply rate", "12 of 33 chats", GREEN),
        ("4", "Booked calls", "3 Morrow, 1 OHUB", AMBER),
    ])
    y -= 59
    callout(c, M, y, CW, 65, "Bottom line",
            "SalesV3 has become a real portfolio sales operating system: one database, one dashboard, three commercial motions, 56 specialist agents, controlled lead generation, and a cleaned LinkedIn relationship layer. The most important gap is not strategy. It is that actual LinkedIn replies and meetings are not yet written into the canonical CRM funnel, so management reports show false zeros.", BLUE, WHITE)
    y -= 78
    section_label(c, "Assessment", M, y)
    y -= 12
    data = [
        ["Area", "Assessment", "Evidence", "Implication"],
        ["Platform", "Strong foundation", "Canonical SQLite CRM, dashboard, activity model, tests, audit controls", "Stop expanding breadth; harden the operating loop."],
        ["Market signal", "Promising, not proven", "12 replies and 4 booked calls from 33 copied conversations", "Enough signal to focus; not enough to claim repeatability."],
        ["Morrow", "Best current pull", "45% any reply; 3 booked calls from 11 conversations", "Prioritize discovery and qualify commercial urgency."],
        ["OutageHub", "Useful learning", "33% any reply; 1 meeting and 1 referral", "Lead with external context, not SCADA replacement."],
        ["GNK", "Needs message reset", "30% any reply; no booked meetings in current sample", "Shorten the pitch and anchor to one live trigger."],
        ["Operations", "Under-instrumented", "Canonical CRM shows 0 sent, replies, meetings, opportunities, contracts", "Sync real activity before judging the funnel."],
    ]
    y = make_table(c, data, M, y, [25*mm, 31*mm, 63*mm, 59*mm], font=P_CELL_SMALL)
    y -= 12
    callout(c, M, y, CW, 49, "Recommended posture",
            "Treat the next 30 days as an execution and evidence sprint: reconcile every conversation, run the booked calls, capture outcomes, move only qualified people into active sequences, and test shorter outreach. The system should become the memory of the business, not just a sophisticated prospect factory.", GREEN, GREEN_BG)
    footer_note(c, "Commercial signal is based on 33 manually copied LinkedIn conversations. It is directional and selection-biased; it should guide experiments, not serve as a final benchmark.")
    c.showPage()


def portfolio(c, page_no):
    page_header(c, "Three ventures, three different sales motions", "02 / business model", page_no)
    y = H - 32 * mm
    data = [
        ["Venture", "What is sold", "Ideal buyer / problem", "Commercial motion", "Near-term target"],
        ["GNK", "Senior engineering strike team for consequential software and AI", "Engineering/product leaders with delivery risk, production AI, backend, or data bottlenecks", "$35k-$60k project; 4-6 weeks. Paid shaping fallback: $7.5k-$12.5k", "One signed $40k-$60k engagement in 30 days"],
        ["OutageHub", "Canadian power-event intelligence and external outage context", "Utilities, emergency management, telecom/field operations, platform providers", "$7.5k-$30k implementation plus $1.5k-$15k monthly depending on play", "3-4 pilots/evaluations; path to $40k MRR"],
        ["Morrow", "Adaptive robotic packing and kitting for high-mix workflows", "Automation, continuous improvement, manufacturing engineering, packaging and warehouse operations", "4-8 week pilot at $15k-$50k; then $5k-$12k per cell/month RaaS", "2-3 design partners and one paid pilot"],
    ]
    y = make_table(c, data, M, y, [22*mm, 42*mm, 47*mm, 39*mm, 28*mm], font=P_CELL_SMALL, padding=6)
    y -= 16
    section_label(c, "Portfolio logic", M, y)
    y -= 13
    callout(c, M, y, 56*mm, 88, "GNK = cash engine",
            "Shortest path to material revenue. Existing proof and senior-delivery framing support a high-ticket project. It should finance the engine while the product ventures learn.", BLUE, SKY)
    callout(c, M + 61*mm, y, 56*mm, 88, "OutageHub = data product",
            "The fastest proof is a paid pilot with measurable operational value. The product must complement internal systems and provide cross-utility context.", TEAL, GREEN_BG)
    callout(c, M + 122*mm, y, 56*mm, 88, "Morrow = design-partner bet",
            "The strongest current engagement, but also the longest technical and adoption cycle. Separate discovery calls from budget-qualified commercial opportunities.", PURPLE, PURPLE_BG)
    y -= 106
    section_label(c, "Current product play coverage", M, y)
    y -= 13
    data2 = [
        ["Play", "Leads", "Observed score", "Comment"],
        ["GNK - Production AI", "39", "Avg 57 / max 75", "Good volume; requires trigger-based proof."],
        ["GNK - Backend risk", "55", "Avg 56 / max 72", "Largest GNK pool; message has not converted yet."],
        ["GNK - Data/Ops", "2", "Avg 55", "Too little inventory to learn."],
        ["OHUB - Embedded platform", "26", "Avg 74 / max 86", "Referral and partner route are strategically useful."],
        ["OHUB - Facility/operations", "32", "Avg 75 / max 85", "Clarify operating pain and buying owner."],
        ["OHUB - ISP/telecom", "13", "Avg 82 / max 85", "High model scores, weak reply depth so far."],
        ["Morrow", "30", "No play ID / score", "Commercial logic exists in code, but DB wiring is incomplete."],
    ]
    make_table(c, data2, M, y, [50*mm, 18*mm, 31*mm, 79*mm], font=P_CELL_SMALL)
    footer_note(c, "The original immediate-revenue allocation is GNK 60%, OutageHub 30%, sales engine 10%. Morrow is a newer design-partner motion and should be managed with separate evidence milestones.")
    c.showPage()


def funnel(c, page_no):
    page_header(c, "The real funnel and the reported funnel disagree", "03 / source of truth", page_no)
    y = H - 32 * mm
    callout(c, M, y, CW, 60, "Most important operating issue",
            "The LinkedIn conversation layer contains 111 messages, 12 replying conversations, and 4 scheduled calls. The canonical CRM activity log contains 0 sent messages, 0 replies, 0 meetings, 0 opportunities, and 0 contracts. Until these layers are reconciled, the funnel and revenue reports cannot be used to manage performance.", RED, RED_BG)
    y -= 78
    section_label(c, "Two views of the same business", M, y)
    y -= 12
    data = [
        ["Measure", "LinkedIn conversation layer", "Canonical CRM layer", "Management consequence"],
        ["People / leads", "33 conversations; 28 linked to network catalogue", "198 CRM leads", "Relationship and lead identity are fragmented."],
        ["Messages", "111 total: 83 outbound, 28 inbound", "0 outreach_messages", "Sequence throughput appears to be zero."],
        ["Replies", "12 conversations replied (36%)", "0 reply events", "Response reporting misses real signal."],
        ["Meetings", "4 scheduled; 2 more proposed", "0 meetings", "Calendar and follow-up cannot be trusted."],
        ["Opportunities", "Several positive/referral outcomes", "0 opportunities", "No consistent qualification or stage progression."],
        ["Revenue", "No evidence of signed revenue in data", "0 contracts / $0 booked", "This zero is credible; commercial proof is still pending."],
    ]
    y = make_table(c, data, M, y, [30*mm, 46*mm, 38*mm, 64*mm], font=P_CELL_SMALL)
    y -= 16
    section_label(c, "What the operating loop should become", M, y)
    y -= 18
    boxes = [
        ("1", "Import", "Conversation + connection identity"),
        ("2", "Reconcile", "Attach person, product, play, source"),
        ("3", "Act", "Reply, schedule, draft follow-up"),
        ("4", "Record", "Immutable event + outcome"),
        ("5", "Learn", "Sequence and ICP evidence"),
    ]
    bw = (CW - 4*8) / 5
    for i, (num, title, note) in enumerate(boxes):
        x = M + i*(bw+8)
        c.setFillColor(WHITE)
        c.setStrokeColor(LINE)
        c.roundRect(x, y-78, bw, 78, 7, fill=1, stroke=1)
        c.setFillColor(BLUE)
        c.circle(x+14, y-16, 8, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString(x+14, y-18.5, num)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(x+8, y-37, title)
        draw_wrapped(c, note, x+8, y-50, bw-16, size=6.7, leading=8.5, color=SLATE)
    footer_note(c, "Priority implementation: promote imported LinkedIn messages, replies, and meetings into activity_events/meetings; preserve raw provenance; require a product and next action for every open conversation.")
    c.showPage()


def performance(c, page_no):
    page_header(c, "Network and conversation performance", "04 / outreach actuals", page_no)
    y = H - 32 * mm
    metric_cards(c, y, [
        ("206", "Strong routes", "score 9+", GREEN),
        ("200", "Possible routes", "score 4-8", AMBER),
        ("359", "Other", "needs review", SLATE),
        ("28", "Marked contacted", "of 765", BLUE),
    ])
    y -= 63
    section_label(c, "Catalogue routing", M, y)
    y -= 14
    bar(c, M, y, 78*mm, 338, 359, "GNK", "338", BLUE)
    bar(c, M + 94*mm, y, 78*mm, 35, 359, "OutageHub", "35", TEAL)
    y -= 27
    bar(c, M, y, 78*mm, 33, 359, "Morrow", "33", PURPLE)
    bar(c, M + 94*mm, y, 78*mm, 359, 359, "Other", "359", SLATE)
    y -= 34
    callout(c, M, y, CW, 47, "Important qualification caveat",
            "The 765-connection catalogue has no exact LinkedIn profile URLs; every route is a LinkedIn search link derived from the copied text. Product buckets are routing hypotheses, not verified ICP qualification. An official LinkedIn Connections export would materially improve identity confidence.", AMBER, AMBER_BG)
    y -= 63
    section_label(c, "Conversation outcomes by venture", M, y)
    y -= 12
    data = [
        ["Venture", "Conversations", "Replied", "Any-reply rate", "Positive/referral", "Booked meetings"],
        ["GNK", "10", "3", "30%", "0", "0"],
        ["OutageHub", "12", "4", "33%", "1", "1"],
        ["Morrow", "11", "5", "45%", "3", "3"],
        ["Total", "33", "12", "36%", "4", "4"],
    ]
    y = make_table(c, data, M, y, [35*mm, 29*mm, 23*mm, 31*mm, 33*mm, 27*mm], font=P_CELL)
    y -= 15
    section_label(c, "Outcome mix", M, y)
    y -= 14
    data2 = [
        ["No reply", "Neutral", "Positive", "Referral", "Objection", "Negative"],
        ["21", "2", "3", "1", "5", "1"],
    ]
    make_table(c, data2, M, y, [30*mm, 28*mm, 28*mm, 28*mm, 32*mm, 32*mm], font=P_CELL_HEAD, header_bg=SLATE)
    footer_note(c, "Response rate means at least one inbound response in a conversation, not positive intent. Product labels prefer explicit conversation content over the broader connection classifier.")
    c.showPage()


def learnings(c, page_no):
    page_header(c, "What the outreach data is already teaching us", "05 / sequence learning", page_no)
    y = H - 32 * mm
    section_label(c, "Observed response by opening length", M, y)
    y -= 17
    bar(c, M, y, 115*mm, 50, 50, "Short opener", "7 / 14 replied (50%)", GREEN)
    y -= 29
    bar(c, M, y, 115*mm, 33, 50, "Medium opener", "4 / 12 replied (33%)", AMBER)
    y -= 29
    bar(c, M, y, 115*mm, 14, 50, "Long opener", "1 / 7 replied (14%)", RED)
    y -= 32
    callout(c, M, y, CW, 45, "Directional result, not a universal law",
            "Short openers materially outperform long openers in this small sample. The practical conclusion is to earn the second paragraph: lead with a specific trigger and one bounded question, then expand only after engagement.", GREEN, GREEN_BG)
    y -= 61
    section_label(c, "Sequence mechanics", M, y)
    y -= 12
    data = [
        ["Observation", "Evidence", "Operating change"],
        ["Follow-up matters", "5 of 12 replying conversations first replied after a follow-up", "Use 2-3 deliberate touches; do not interpret silence after one message as rejection."],
        ["Long solution pitches suppress response", "Long openers: 14% response versus 50% for short", "Cut speculative architecture and feature detail from first contact."],
        ["Corrections are high-value data", "5 replies contained objections or corrections", "Store the corrected operating reality and feed it back into ICP and copy."],
        ["Referral asks work", "One OutageHub contact routed the conversation to an interested product manager", "When fit is adjacent, ask for the owner rather than forcing qualification."],
        ["Discovery and selling are mixed", "Morrow meetings include learning-oriented conversations", "Label meeting intent: research, design partner, commercial discovery, or active deal."],
    ]
    y = make_table(c, data, M, y, [42*mm, 54*mm, 82*mm], font=P_CELL_SMALL)
    y -= 14
    callout(c, M, y, 56*mm, 73, "GNK message hypothesis",
            "A crisp trigger + one delivery-risk question should outperform a broad senior-engineering pitch. Save the proof stack for the reply.", BLUE, SKY)
    callout(c, M + 61*mm, y, 56*mm, 73, "OHUB message hypothesis",
            "Position cross-utility external context as an overlay to SCADA, OMS, NOC, and field workflows - not as a replacement.", TEAL, GREEN_BG)
    callout(c, M + 122*mm, y, 56*mm, 73, "Morrow message hypothesis",
            "Concrete workflow questions and research framing create engagement. Add qualification for labor pain, SKU variability, budget, and deployment owner.", PURPLE, PURPLE_BG)
    footer_note(c, "First replies occurred after touch 1 in 7 conversations and after touch 2 in 5. No controlled randomization exists yet, so treat the copy analysis as observational.")
    c.showPage()


GNK_ROWS = [
    ("Aamna Zia", "Head of FP&A, Synctera", "Waiting", "No reply", "Potential operations/data angle; not yet validated."),
    ("Mahdi Torabi Rad", "CTO, energy/materials/AI", "Waiting", "Objection", "Already has data ingestion; future-timing signal."),
    ("Samuel Looper", "Director of Engineering, Noteworthy AI", "Waiting", "No reply", "Engineering delivery buyer; needs sharper trigger."),
    ("Sanket Singhania", "AVP, Infosys; legacy modernization", "Waiting", "No reply", "Likely partner/enterprise route, not a direct project buyer."),
    ("Seamus MacIsaac", "VP Product, Helcim", "Waiting", "No reply", "Senior buyer; initial pitch may have been too broad."),
    ("Shao Hang He", "Owner, Athena AI / CTO", "Waiting", "Neutral", "Asked what the intention was; clarification sent."),
    ("Shauvik Choudhury", "AI, drones and GIS at Cognizant", "Waiting", "No reply", "Adjacent technical relationship; explicit GNK topic."),
    ("Sudheer Niranjan Kumar Guduri", "Principal Technology Architect, Infosys", "Waiting", "No reply", "Seven outbound messages: stop until a new trigger exists."),
    ("Vishaldeep Singh", "AI/MLOps infrastructure", "Waiting", "No reply", "Technical adjacency; buying authority unclear."),
    ("Zac Canders", "Founder; prior outage platform acquired", "Waiting", "Neutral", "Shared phone/catch-up; relationship may span ventures."),
]

OHUB_ROWS = [
    ("Carol Johnston", "VP, Energy, Utilities & Resources", "Meeting booked", "Objection + learning", "External cross-utility context; do not imply SCADA replacement."),
    ("Brian Schembri", "Senior Director, Field Operations, Rogers", "Waiting", "No reply", "Potential telecom field-ops buyer."),
    ("Charlie Harland", "Technology/innovation, Alert Labs", "Referral", "Positive route", "Referred an interested product manager."),
    ("Ekele Nnorom", "Senior data/cloud architect", "Waiting", "Objection", "Not close enough to field operations."),
    ("Hushin Pahuja", "Bell field operations", "Waiting", "No reply", "Fit hypothesis not confirmed."),
    ("Karthi Tharmaratnam", "Field operations", "Waiting", "No reply", "Fit hypothesis not confirmed."),
    ("Kashif Mushtaq", "Wireless field operations", "Waiting", "No reply", "Fit hypothesis not confirmed."),
    ("Kirk Beyore", "Bell field operations", "Waiting", "No reply", "Fit hypothesis not confirmed."),
    ("Simone Stawicki", "Emergency management", "Waiting", "No reply", "Potential context consumer; trigger needed."),
    ("Steve Schriver", "Emergency management, Suncor", "Waiting", "No reply", "Four outbound messages: pause until new evidence."),
    ("Vinothan Srikanthan", "Bell field operations", "Waiting", "No reply", "Three outbound messages: pause or change owner/angle."),
    ("Sean Gray", "Power Systems Engineer, Eaton", "Closed", "Negative", "Explicit no; respect suppression."),
]

MORROW_ROWS = [
    ("Adam Wolk", "VP Fleet Maintenance & Procurement, Canada Cartage", "Meeting booked", "Positive", "Truck repair still manual; adjacent workflow automation exists."),
    ("Constanze Kristen", "Director, Technical Services & Packaging", "Meeting booked", "Positive", "Direct packaging/deployment-learning value."),
    ("Samir A.", "Design automation", "Meeting booked", "Clarification", "Not physical robotics, but correction led to a call."),
    ("Samuel Eboh", "Senior Production Supervisor", "Needs reply", "Objection", "Will answer questions in writing, not take a call."),
    ("Alicia Kavelaars", "CTO, deep tech", "Waiting", "No reply", "Technical peer; buyer role unclear."),
    ("Argang Kazemzadeh", "Process optimization / scale-up", "Waiting", "No reply", "Strong learning profile; commercial ownership unclear."),
    ("Bhargav Dudhat", "Sourcing / procurement leader", "Meeting proposed", "Positive", "Potential buying-process and vendor-route insight."),
    ("Blair Forrest", "AMZ Prep / warehouses", "Waiting", "No reply", "Warehouse workflow may be directly relevant."),
    ("Clinton Yourth", "CTO; digital twin / MLOps", "Waiting", "No reply", "Technical adjacency; plant workflow unknown."),
    ("Haedar Hussien", "Automation at Ya YA Foods", "Waiting", "No reply", "High-potential production automation profile."),
    ("Trushank Patel", "Manufacturing / operations context", "Meeting proposed", "Positive", "Proposed call; confirmation not captured."),
]


def roster_page(c, page_no, title, product, rows, headline, accent):
    page_header(c, title, f"06 / who we are talking to - {product}", page_no)
    y = H - 32 * mm
    callout(c, M, y, CW, 48, "Readout", headline, accent, WHITE)
    y -= 62
    data = [["Person", "Role / context", "Status", "Signal", "Interpretation / next move"]] + [list(r) for r in rows]
    make_table(c, data, M, y, [33*mm, 48*mm, 25*mm, 28*mm, 44*mm], font=P_CELL_SMALL, padding=4)
    footer_note(c, "Names and roles are included for internal planning. Contact details and private message text are intentionally omitted from this shareable business review.")
    c.showPage()


def meetings(c, page_no):
    page_header(c, "Booked calls, proposed calls, and follow-up", "07 / immediate action", page_no)
    y = H - 32 * mm
    section_label(c, "Scheduled calls in imported LinkedIn history", M, y)
    y -= 12
    data = [
        ["Person", "Venture", "Captured time", "Purpose / agenda"],
        ["Adam Wolk", "Morrow", "16 Jul, 14:00 ET", "Map manual truck-repair workflow, variation, labor, and automation buying process."],
        ["Samir A.", "Morrow", "18 Jul, 15:00 ET", "Clarify design-automation relevance and possible transfer to adaptive physical workflows."],
        ["Constanze Kristen", "Morrow", "20 Jul, 09:00 EST", "Understand packaging variability, line constraints, ownership, and pilot conditions."],
        ["Carol Johnston", "OutageHub", "21 Jul, 13:00 PST", "Validate external event context use cases and integration with internal telemetry."],
    ]
    y = make_table(c, data, M, y, [35*mm, 24*mm, 34*mm, 85*mm], font=P_CELL_SMALL)
    y -= 15
    callout(c, M, y, CW, 44, "Calendar caveat",
            "Dates and time zones were inferred from manually copied chat text and are not yet synchronized to Google Calendar. Confirm each call and create canonical meeting records before relying on reminders.", AMBER, AMBER_BG)
    y -= 60
    section_label(c, "Proposed / pending", M, y)
    y -= 12
    data2 = [
        ["Person", "Venture", "State", "Next action"],
        ["Bhargav Dudhat", "Morrow", "Proposed 16 Jul, 20:00 ET", "Confirm slot and classify as procurement discovery vs commercial opportunity."],
        ["Trushank Patel", "Morrow", "Proposed 21 Jul, 19:00 ET", "Confirm slot; capture facility, workflow, decision role, and urgency."],
        ["Samuel Eboh", "Morrow", "Needs reply", "Send 3-5 concise written questions; respect preference against a call."],
        ["Charlie Harland referral", "OutageHub", "Warm product-manager route", "Contact referred owner with context and ask for a 20-minute validation call."],
    ]
    y = make_table(c, data2, M, y, [40*mm, 28*mm, 47*mm, 63*mm], font=P_CELL_SMALL)
    y -= 15
    section_label(c, "Required call outcome fields", M, y)
    y -= 12
    make_table(c, [["Problem", "Current process", "Impact", "Owner", "Timing", "Budget", "Next step", "Evidence learned"]], M, y,
               [23*mm, 25*mm, 22*mm, 20*mm, 20*mm, 20*mm, 22*mm, 26*mm], font=P_CELL_SMALL, header_bg=BLUE, padding=4)
    footer_note(c, "The best near-term KPI is not calls completed. It is calls with a captured outcome and an explicit next step, disqualification reason, or corrected market assumption.")
    c.showPage()


def architecture(c, page_no):
    page_header(c, "Platform architecture", "08 / how the system works", page_no)
    y = H - 33 * mm
    section_label(c, "One portfolio system, three product scopes", M, y)
    y -= 18
    # Architecture layers
    layers = [
        ("INPUTS", "LinkedIn connections + chats | lead research | email evidence | strategy artifacts", HexColor("#E8F0FF"), BLUE),
        ("IMPORT + IDENTITY", "Cleaning | parsing | deduplication | person/company matching | provenance", HexColor("#E9FBF6"), TEAL),
        ("CANONICAL CRM", "SQLite + WAL | leads | cohorts | immutable activity | suppression | sales plays | opportunities", WHITE, NAVY),
        ("AGENT PIPELINES", "strategy:refresh -> cohort:build -> lead:prepare -> approvals", PURPLE_BG, PURPLE),
        ("OPERATING SURFACE", "Overview | Leads | Outreach | LinkedIn | Connections | Conversations | Calendar | Agents | Intelligence", AMBER_BG, AMBER),
    ]
    lh = 47
    for i, (label, body, bg, accent) in enumerate(layers):
        top = y - i*(lh+14)
        c.setFillColor(bg)
        c.setStrokeColor(LINE)
        c.roundRect(M, top-lh, CW, lh, 7, fill=1, stroke=1)
        c.setFillColor(accent)
        c.roundRect(M, top-lh, 29*mm, lh, 7, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 7.3)
        c.drawCentredString(M+14.5*mm, top-26, label)
        draw_wrapped(c, body, M+34*mm, top-20, CW-38*mm, size=8.2, leading=11, color=INK)
        if i < len(layers)-1:
            c.setStrokeColor(MUTED)
            c.setLineWidth(1)
            cx = W/2
            c.line(cx, top-lh-2, cx, top-lh-10)
            c.line(cx-3, top-lh-7, cx, top-lh-10)
            c.line(cx+3, top-lh-7, cx, top-lh-10)
    y2 = y - len(layers)*(lh+14) - 4
    callout(c, M, y2, 87*mm, 75, "What is already good",
            "The architecture separates raw evidence, identity, canonical business state, agent execution, and operator review. It also preserves lineage and suppression, which is essential for safe outreach.", GREEN, GREEN_BG)
    callout(c, M+92*mm, y2, 86*mm, 75, "Where the seam is broken",
            "Imported LinkedIn conversations currently remain in a parallel data path instead of creating canonical activity, meeting, and opportunity records.", RED, RED_BG)
    footer_note(c, "Core tables include leads, cohorts, pipeline_runs, activity_events, suppression, merge_conflicts, sales_plays, opportunities, contracts, outreach_messages, meetings, provider_sync_state, LinkedIn connections, conversations, and messages.")
    c.showPage()


def agents(c, page_no):
    page_header(c, "The 56-agent operating system", "09 / automation setup", page_no)
    y = H - 32 * mm
    metric_cards(c, y, [
        ("56", "Agents", "portfolio total", BLUE),
        ("23", "Critical path", "per-lead constrained", PURPLE),
        ("14", "Fresh", "current artifacts", GREEN),
        ("44", "Blocked", "requires attention", RED),
    ])
    y -= 64
    section_label(c, "Agent allocation", M, y)
    y -= 13
    data = [
        ["Scope", "Agents", "Control", "Cohort", "Lead", "Deterministic"],
        ["GNK", "18", "7", "4", "6", "1"],
        ["OutageHub", "19", "8", "4", "6", "1"],
        ["Morrow", "18", "7", "4", "6", "1"],
        ["Shared", "1", "1", "0", "0", "0"],
        ["Total", "56", "23", "12", "18", "3"],
    ]
    y = make_table(c, data, M, y, [42*mm, 25*mm, 28*mm, 28*mm, 28*mm, 27*mm], font=P_CELL)
    y -= 15
    section_label(c, "Model mix", M, y)
    y -= 15
    bar(c, M, y, 112*mm, 41, 41, "GPT-5.4 mini", "41 agents", BLUE)
    y -= 25
    bar(c, M, y, 112*mm, 10, 41, "GPT-5.5", "10 agents", PURPLE)
    y -= 25
    bar(c, M, y, 112*mm, 3, 41, "Local deterministic", "3 agents", TEAL)
    y -= 25
    bar(c, M, y, 112*mm, 2, 41, "GPT-5.6", "2 agents", AMBER)
    y -= 30
    section_label(c, "Pipeline design", M, y)
    y -= 12
    data2 = [
        ["Pipeline", "Purpose", "Operating rule"],
        ["strategy:refresh", "Policy, context, ICP, offers, industry and revenue strategy", "Freshness-aware; weekly/monthly cadence."],
        ["cohort:build", "Sourcing, scoring, contact discovery and evidence", "Creates an auditable cohort before person-level work."],
        ["lead:prepare", "Profile, dossier, angle, writer and reviewer", "Max 4 calls for GNK/OHUB and 3 for Morrow."],
        ["full", "Chains strategy, cohort and lead preparation", "Approval and evidence gates remain in place."],
    ]
    y = make_table(c, data2, M, y, [38*mm, 77*mm, 63*mm], font=P_CELL_SMALL)
    y -= 14
    callout(c, M, y, CW, 45, "Operational readiness",
            "44 agents are currently blocked: 23 have never run, 18 carry a stale strategy version, and 3 have schema/dependency issues. The architecture is broad, but the production-ready subset is much smaller than the registry suggests.", RED, RED_BG)
    footer_note(c, "Blocked does not mean conceptually broken. It means the artifact graph is not current enough to rely on for active execution.")
    c.showPage()


def controls(c, page_no):
    page_header(c, "Controls, data quality, and test coverage", "10 / trust layer", page_no)
    y = H - 32 * mm
    section_label(c, "Acceptance gates", M, y)
    y -= 12
    data = [
        ["Gate", "Result", "Meaning"],
        ["Automated tests", "88 passing", "Core behavior is covered and currently stable."],
        ["Per-lead critical path", "PASS", "Max 4 calls for GNK/OHUB; 3 for Morrow; below limit of 6."],
        ["Cross-brand sales-play leaks", "PASS - 0", "Product boundaries are enforced."],
        ["Control agents on critical path", "PASS - 0", "Strategy/control work does not inflate per-lead execution."],
        ["Guessed emails marked send-ready", "PASS - 0", "Evidence gating protects outbound quality."],
        ["Deterministic stability", "PASS - 1.0", "Repeated deterministic evaluation is stable."],
        ["Good-fit benchmark accuracy", "PASS - 1.0", "24/24 known good-fit accounts pass the benchmark."],
    ]
    y = make_table(c, data, M, y, [53*mm, 30*mm, 95*mm], font=P_CELL_SMALL)
    y -= 16
    section_label(c, "Current data readiness", M, y)
    y -= 12
    data2 = [
        ["Data asset", "Coverage", "Risk / next step"],
        ["CRM leads", "198 total: 96 GNK, 71 OHUB, 30 Morrow, 1 unknown", "Resolve the unknown product and advance stages beyond target/evidence-missing."],
        ["Direct LinkedIn profiles", "92 of 198 leads", "106 leads lack a direct profile route."],
        ["Email evidence", "61 of 198; 59 are GNK", "OHUB/Morrow remain LinkedIn-led; do not guess addresses."],
        ["Connection identities", "765 names; 0 exact profile URLs", "Acquire official export and confirm high-priority profiles."],
        ["Lead stages", "154 target; 44 contact_evidence_missing", "No canonical replied, meeting, won, or lost stages yet."],
        ["Integrations", "Gmail off; Google Calendar off; sending disabled", "Safe by default, but no automated draft/meeting throughput."],
    ]
    y = make_table(c, data2, M, y, [43*mm, 65*mm, 70*mm], font=P_CELL_SMALL)
    y -= 15
    callout(c, M, y, CW, 48, "Data-quality principle",
            "Keep the raw files private and immutable, preserve import provenance, and separate inferred facts from confirmed facts. The current system has the right foundation; the next improvement is reconciliation and operator confirmation, not more inference.", GREEN, GREEN_BG)
    footer_note(c, "Three strategy artifacts expose unconsumed fields, and the GNK email-sequence reviewer has a schema issue. These are maintenance items, not the central commercial constraint.")
    c.showPage()


def wins(c, page_no):
    page_header(c, "What is working", "11 / wins", page_no)
    y = H - 32 * mm
    wins_data = [
        ("One operating surface", "The dashboard now brings leads, outreach, LinkedIn connections, conversations, calendar, agents, approvals, activity, and intelligence into one portfolio view.", BLUE),
        ("A real relationship memory", "765 connections and 33 cleaned conversation threads are catalogued. Contacted and dismissed states are visible, with green and red status treatments.", TEAL),
        ("Early buyer engagement", "12 of 33 conversations received a reply and four calls were scheduled. Morrow produced the strongest meeting signal.", GREEN),
        ("Useful market corrections", "Replies clarified that OHUB should complement internal telemetry, that some prospects sit too far from field operations, and that Morrow discovery must distinguish software design automation from physical robotics.", PURPLE),
        ("Safety and auditability", "The CRM preserves lineage, immutable activity, suppression, evidence rules, product boundaries, and approval controls. Sending remains draft-only.", AMBER),
        ("Disciplined agent economics", "The per-lead critical path is constrained to 3-4 calls and strategy work is kept off the critical path, limiting cost and complexity.", BLUE),
        ("Commercial offers are concrete", "Each venture has a defined buyer, problem, offer shape, price range, and near-term proof target rather than generic lead generation.", TEAL),
        ("The system is testable", "All 88 tests and the defined acceptance gates pass, giving a stable base for the next integration step.", GREEN),
    ]
    h = 72
    for i, (title, body, accent) in enumerate(wins_data):
        col = i % 2
        row = i // 2
        x = M + col*(87*mm+7)
        top = y - row*(h+10)
        callout(c, x, top, 87*mm, h, title, body, accent, WHITE)
    footer_note(c, "The strongest achievement is not the number of leads. It is that strategy, evidence, identity, outreach preparation, human review, and learning now have a coherent place to live.")
    c.showPage()


def gaps(c, page_no):
    page_header(c, "Gaps and risks", "12 / what can still break", page_no)
    y = H - 32 * mm
    data = [
        ["Priority", "Gap", "Why it matters", "Fix"],
        ["P0", "LinkedIn activity is outside canonical CRM", "Funnel reports show false zeros and next actions can be missed.", "Promote messages, replies, meetings and outcomes into canonical events."],
        ["P0", "Booked calls are not calendar-backed", "Inferred dates/time zones create missed-call risk.", "Confirm each call; write meeting records; enable calendar sync."],
        ["P1", "44 of 56 agents are blocked", "The visible operating system is broader than the runnable system.", "Refresh strategy, run never-run agents, fix 3 schema/dependency blockers."],
        ["P1", "No active opportunity discipline", "Positive replies and meetings do not become forecastable pipeline.", "Define qualification fields and enforce explicit stage/next action."],
        ["P1", "Morrow play wiring is incomplete", "30 Morrow leads lack play IDs/scores and DB sales plays.", "Seed Morrow plays and score/reconcile existing leads."],
        ["P1", "Morrow campaign report copies OHUB channels", "The report assigns OHUB campaign targets to every non-GNK product.", "Correct product-specific campaign-target selection."],
        ["P2", "Connection identity is weak", "All 765 routes are search URLs, not exact profiles.", "Use official LinkedIn export; confirm exact profiles for priority people."],
        ["P2", "Classifier output is treated too literally", "359 Other does not mean 359 irrelevant; broad buckets are not qualification.", "Review the top 406 strong/possible routes and learn from corrections."],
        ["P2", "Manual data is selection-biased", "Response rates may not represent the full outreach history.", "Import complete export and mark sequence/date/source consistently."],
        ["P2", "No closed-loop experiment metadata", "Copy lessons remain anecdotal.", "Record opener type, touch count, hypothesis, outcome, and segment."],
    ]
    y = make_table(c, data, M, y, [14*mm, 45*mm, 58*mm, 61*mm], font=P_CELL_SMALL, padding=4)
    y -= 15
    callout(c, M, y, CW, 53, "Strategic risk",
            "The platform can create a false sense of progress if lead volume, agent count, and sophisticated artifacts substitute for commercial movement. The next proof is paid commitment: a signed GNK engagement, a paid OHUB pilot, or a paid Morrow design-partner pilot.", RED, RED_BG)
    footer_note(c, "There is currently no evidence in the CRM of booked revenue, recurring revenue, signed contracts, or won opportunities. This is a gap to close, not a reporting failure to hide.")
    c.showPage()


def plan30(c, page_no):
    page_header(c, "30-day execution plan", "13 / recommended priorities", page_no)
    y = H - 32 * mm
    section_label(c, "Week-by-week", M, y)
    y -= 12
    data = [
        ["Window", "Outcome", "Actions", "Exit criteria"],
        ["Days 1-3", "One source of truth", "Reconcile 33 chats to people/leads; create 111 canonical message events; confirm 4 meetings; record 2 proposed calls; assign owner/product/next action.", "Dashboard shows real sent, reply, meeting and follow-up counts."],
        ["Days 1-7", "Never miss a live conversation", "Reply to Samuel Eboh; work the referral; confirm all calls; create call briefs; set follow-up dates and reminders.", "Every open thread has a dated next action or explicit pause."],
        ["Week 1", "Runnable agent graph", "Refresh strategy artifacts; run never-run critical agents; repair schema/dependency blockers; seed Morrow plays.", "Critical execution agents are current and unblocked."],
        ["Week 2", "Qualified evidence", "Complete four calls; capture operating reality, owner, pain, timing, budget, next step and corrected assumptions.", "Four outcome records; at least two explicit commercial next steps or clean disqualifications."],
        ["Weeks 2-3", "Focused outreach test", "Select 15 GNK, 15 OHUB and 15 Morrow contacts. Test short trigger-based openers and one controlled follow-up.", "45 fully tagged conversations with consistent message metadata."],
        ["Weeks 3-4", "Commercial conversion", "Present bounded GNK shaping/strike-team offer, OHUB pilot, or Morrow design-partner pilot where qualified.", "At least 3 proposals/pilot asks and one paid commitment target."],
    ]
    y = make_table(c, data, M, y, [25*mm, 40*mm, 73*mm, 40*mm], font=P_CELL_SMALL, padding=5)
    y -= 16
    section_label(c, "Do not do in the next 30 days", M, y)
    y -= 12
    callout(c, M, y, 56*mm, 81, "Do not add lead volume",
            "198 CRM leads plus 765 network connections are enough inventory. More names will increase operational debt until follow-up and qualification work.", RED, RED_BG)
    callout(c, M+61*mm, y, 56*mm, 81, "Do not expand agent count",
            "56 agents are enough. Make the current graph fresh, observable, and useful before adding specialized roles.", RED, RED_BG)
    callout(c, M+122*mm, y, 56*mm, 81, "Do not automate sending",
            "Keep human approval and evidence gates. First prove that targeting, copy, and follow-up produce qualified outcomes.", RED, RED_BG)
    footer_note(c, "The execution plan intentionally prioritizes reconciliation and conversion over new platform features.")
    c.showPage()


def roadmap(c, page_no):
    page_header(c, "60-90 day roadmap and management scorecard", "14 / scale conditions", page_no)
    y = H - 32 * mm
    section_label(c, "Build only after the 30-day operating loop is working", M, y)
    y -= 12
    data = [
        ["Horizon", "Capability", "Business purpose"],
        ["30-45 days", "Gmail draft integration + response capture", "Reduce copy/paste while preserving human approval and complete activity history."],
        ["30-45 days", "Google Calendar sync + follow-up queue", "Prevent missed calls and create reliable reminders, briefs and outcomes."],
        ["45-60 days", "Opportunity qualification + forecast", "Separate research, design partners and real deals; measure stage conversion."],
        ["45-60 days", "Experiment registry", "Attribute response and conversion to segment, message hypothesis, opener, touch and offer."],
        ["60-90 days", "Referral graph and relationship paths", "Use warm routes across the network instead of treating all prospects as cold."],
        ["60-90 days", "Complete LinkedIn export reconciliation", "Improve exact identity, employment history, source dates and duplicate handling."],
        ["After proof", "Selective workflow automation", "Automate repetitive preparation and reminders only where the measured process is stable."],
    ]
    y = make_table(c, data, M, y, [31*mm, 58*mm, 89*mm], font=P_CELL_SMALL)
    y -= 16
    section_label(c, "Weekly scorecard", M, y)
    y -= 12
    data2 = [
        ["Metric", "Why it matters", "Near-term standard"],
        ["Open threads with dated next action", "Tests operational control", "100%"],
        ["Meetings with outcome captured within 24h", "Creates market memory", "100%"],
        ["Positive reply / qualified reply / meeting rate", "Separates courtesy from commercial signal", "Report by venture and sequence"],
        ["Meeting-to-qualified-opportunity", "Measures discovery quality", "Establish baseline over next 10 calls"],
        ["Qualified-opportunity-to-proposal", "Measures offer fit", "Track separately by venture"],
        ["Proposal-to-paid", "Actual commercial proof", "Primary portfolio KPI"],
        ["Stale critical agents / evidence gaps", "Measures system readiness", "0 stale critical agents; declining evidence gaps"],
    ]
    y = make_table(c, data2, M, y, [52*mm, 72*mm, 54*mm], font=P_CELL_SMALL)
    y -= 14
    callout(c, M, y, CW, 45, "Scale rule",
            "Only scale a segment when its identity is reliable, its message has repeatable qualified response, calls produce a consistent problem pattern, and the offer converts into paid commitment.", BLUE, SKY)
    footer_note(c, "Keep separate scorecards for GNK services, OutageHub pilots/subscriptions, and Morrow design partners/RaaS. Their cycle lengths and proof milestones are materially different.")
    c.showPage()


def handoff(c, page_no):
    page_header(c, "Discussion brief for the GPT web app", "15 / handoff", page_no)
    y = H - 32 * mm
    callout(c, M, y, CW, 53, "Context to provide",
            "SalesV3 is a local portfolio sales operating system for GNK, OutageHub and Morrow. It contains 198 CRM leads, 765 LinkedIn connections, 33 cleaned conversations, 56 agents, one canonical SQLite CRM, and a dashboard. The current evidence is 12 replying conversations and 4 booked calls, with no recorded revenue yet.", BLUE, SKY)
    y -= 70
    section_label(c, "Questions worth pressure-testing", M, y)
    y -= 14
    questions = [
        "1. Given the current response and meeting evidence, which venture should receive the next 30 hours of founder selling time, and why?",
        "2. Rewrite one short first-touch and one follow-up for each venture using only the evidence in this report.",
        "3. Design qualification criteria that distinguish a learning interview, design partner, pilot opportunity, and active deal.",
        "4. What would a credible paid pilot proposal look like for OutageHub and Morrow, including success measures and boundaries?",
        "5. How should GNK narrow its offer to earn one $40k-$60k engagement without sounding like a generic consultancy?",
        "6. Which dashboard metrics are leading indicators versus vanity metrics, and what should be removed from the weekly review?",
        "7. What evidence would falsify each venture's current ICP and positioning hypothesis?",
        "8. How should the founder sequence the four booked calls to maximize learning and commercial conversion?",
    ]
    for i, q in enumerate(questions):
        top = y - i*42
        c.setFillColor(WHITE)
        c.setStrokeColor(LINE)
        c.roundRect(M, top-34, CW, 34, 6, fill=1, stroke=1)
        draw_wrapped(c, q, M+10, top-13, CW-20, font="Helvetica-Bold", size=7.6, leading=9.5, color=INK, max_lines=2)
    y2 = y - len(questions)*42 - 3
    callout(c, M, y2, CW, 47, "Decision standard",
            "Ask for explicit tradeoffs. The answer should prioritize one revenue action, one learning action, and one system fix - with what to stop doing - rather than proposing more tooling or generic prospecting.", GREEN, GREEN_BG)
    footer_note(c, "This PDF intentionally omits private message bodies, email addresses and phone numbers. Use the local dashboard for person-level conversation detail.")
    c.showPage()


def methodology(c, page_no):
    page_header(c, "Methodology and data notes", "16 / appendix", page_no)
    y = H - 32 * mm
    data = [
        ["Source", "Snapshot used", "Limitations"],
        ["Canonical CRM", "data/crm.db: leads, cohorts, pipeline runs, plays, activity, outreach, meetings, opportunities and contracts", "The canonical activity path does not yet ingest actual LinkedIn conversation events."],
        ["LinkedIn connections", "765 cleaned connection records derived from connections.txt", "No exact profile URLs in the source; classifications are inferred routing suggestions."],
        ["LinkedIn conversations", "33 conversations and 111 messages derived from allchats.txt", "Manual copy may omit threads, timestamps or context; response sample is selection-biased."],
        ["Agent registry and artifacts", "56 configured agents plus freshness/health evaluation", "Registry size is not equal to runnable production capacity; 44 are blocked."],
        ["Commercial strategy", "Local revenue, ICP, offer, industry and sales-play artifacts", "Targets are strategic objectives, not achieved revenue."],
        ["Test suite", "88 passing tests and current acceptance gates", "Tests validate system behavior, not product-market fit or sales execution."],
    ]
    y = make_table(c, data, M, y, [39*mm, 77*mm, 62*mm], font=P_CELL_SMALL, padding=6)
    y -= 18
    section_label(c, "Interpretation rules", M, y)
    y -= 12
    rules = [
        ("Reply", "At least one inbound message; not necessarily positive intent."),
        ("Positive/referral", "A positive signal, willingness to engage, or a warm route; not necessarily qualified pipeline."),
        ("Meeting", "A date/time captured in chat text; must be confirmed in calendar."),
        ("Strong/possible route", "Classifier strength for product routing; not human-qualified ICP fit."),
        ("Blocked agent", "Missing, stale, or dependency-blocked artifact; not necessarily a flawed agent design."),
        ("Revenue", "Only signed/booked evidence counts. Current recorded booked revenue is zero."),
    ]
    for i, (term, definition) in enumerate(rules):
        col = i % 2
        row = i // 2
        x = M + col*(87*mm+7)
        top = y - row*59
        callout(c, x, top, 87*mm, 49, term, definition, BLUE if col == 0 else PURPLE, WHITE)
    y -= 186
    callout(c, M, y, CW, 60, "Overall confidence",
            "High confidence in architecture, registry counts, CRM counts, and test results. Moderate confidence in conversation-level outcomes. Lower confidence in exact profile identity, inferred meeting time zones, and the representativeness of response rates. All commercial conclusions should be updated as calls complete and canonical activity is reconciled.", AMBER, AMBER_BG)
    footer_note(c, "Prepared from the local SalesV3 repository and dashboard state on 15 July 2026. No external web research was used.")
    c.showPage()


def build():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT), pagesize=A4)
    c.setTitle("SalesV3 Portfolio Business Review - 15 July 2026")
    c.setAuthor("SalesV3")
    c.setSubject("Portfolio sales platform, outreach performance, architecture, gaps and execution plan")
    cover(c)
    executive(c, 2)
    portfolio(c, 3)
    funnel(c, 4)
    performance(c, 5)
    learnings(c, 6)
    roster_page(c, 7, "GNK conversation roster", "GNK", GNK_ROWS,
                "10 conversations, 3 replies, 30% any-reply rate, and no booked meetings in this sample. The current opportunity is to simplify the message, stop over-following silent contacts, and attach outreach to a concrete delivery trigger.", BLUE)
    roster_page(c, 8, "OutageHub conversation roster", "OutageHub", OHUB_ROWS,
                "12 conversations, 4 replies, 1 booked meeting, and 1 referral. The best learning is positioning: OutageHub should add external cross-utility context to existing operational systems, not claim to replace internal telemetry or SCADA.", TEAL)
    roster_page(c, 9, "Morrow conversation roster", "Morrow", MORROW_ROWS,
                "11 conversations, 5 replies, and 3 booked meetings make Morrow the strongest engagement signal. The caution is that research interest and commercial intent are mixed; every call must qualify workflow pain, ownership, timing, budget, and pilot conditions.", PURPLE)
    meetings(c, 10)
    architecture(c, 11)
    agents(c, 12)
    controls(c, 13)
    wins(c, 14)
    gaps(c, 15)
    plan30(c, 16)
    roadmap(c, 17)
    handoff(c, 18)
    methodology(c, 19)
    c.save()
    shutil.copy2(OUT, DOCUMENTS_COPY)
    print(OUT)
    print(DOCUMENTS_COPY)


if __name__ == "__main__":
    build()
