#!/usr/bin/env python3
"""Render the full SalesV3 2.0 Markdown handoff as a polished PDF."""

from __future__ import annotations

import re
import shutil
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, HRFlowable, KeepTogether, PageBreak,
    PageTemplate, Paragraph, Spacer, Table, TableStyle
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "SalesV3_2.0_Full_System_Handoff_2026-07-16.md"
OUT = ROOT / "output" / "pdf" / "SalesV3_2.0_Full_System_Handoff_2026-07-16.pdf"
DOCUMENTS_COPY = Path.home() / "Documents" / OUT.name
W, H = A4
MARGIN_X = 17 * mm
TOP = 21 * mm
BOTTOM = 18 * mm
CONTENT_W = W - 2 * MARGIN_X

NAVY = HexColor("#0B1F3A")
INK = HexColor("#14213D")
BLUE = HexColor("#2563EB")
BLUE_SOFT = HexColor("#E8F0FF")
GREEN = HexColor("#13795B")
GREEN_SOFT = HexColor("#E4F4ED")
AMBER = HexColor("#A55200")
AMBER_SOFT = HexColor("#FFF3D6")
RED = HexColor("#B42318")
SLATE = HexColor("#475569")
MUTED = HexColor("#64748B")
LINE = HexColor("#D8E0EA")
PAPER = HexColor("#F6F8FB")
WHITE = colors.white


def register_fonts():
    candidates = [
        ("Inter", "/System/Library/Fonts/Supplemental/Arial.ttf"),
        ("Inter-Bold", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
        ("Inter-Italic", "/System/Library/Fonts/Supplemental/Arial Italic.ttf"),
        ("Mono", "/System/Library/Fonts/Menlo.ttc"),
    ]
    for name, location in candidates:
        try:
            pdfmetrics.registerFont(TTFont(name, location, subfontIndex=0))
        except Exception:
            pass


register_fonts()
FONT = "Inter" if "Inter" in pdfmetrics.getRegisteredFontNames() else "Helvetica"
BOLD = "Inter-Bold" if "Inter-Bold" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold"
ITALIC = "Inter-Italic" if "Inter-Italic" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Oblique"
MONO = "Mono" if "Mono" in pdfmetrics.getRegisteredFontNames() else "Courier"


def clean_text(value: str) -> str:
    """Keep PDF glyphs reliable and satisfy the ASCII-hyphen requirement."""
    replacements = {
        "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2013": "-", "\u2014": "-",
        "\u2212": "-", "\u2192": "->", "\u2193": "v", "\u2191": "^", "\u00b7": " | ",
        "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"', "\u2026": "...",
        "\u2197": "", "\u2713": "PASS", "\u25cf": "*", "\u00a0": " ",
    }
    for old, new in replacements.items():
        value = value.replace(old, new)
    return value


def esc(value: str) -> str:
    return clean_text(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def inline_markup(value: str) -> str:
    text = esc(value)
    text = re.sub(r"`([^`]+)`", rf'<font name="{MONO}">\1</font>', text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<i>\1</i>", text)
    return text


base = getSampleStyleSheet()
styles = {
    "body": ParagraphStyle("Body", parent=base["BodyText"], fontName=FONT, fontSize=8.5,
                           leading=12.1, textColor=INK, spaceAfter=6.5, allowWidows=0, allowOrphans=0),
    "small": ParagraphStyle("Small", parent=base["BodyText"], fontName=FONT, fontSize=6.9,
                            leading=9.2, textColor=SLATE),
    "tiny": ParagraphStyle("Tiny", parent=base["BodyText"], fontName=FONT, fontSize=5.7,
                           leading=7.1, textColor=INK),
    "h1": ParagraphStyle("H1", parent=base["Heading1"], fontName=BOLD, fontSize=23,
                         leading=27, textColor=NAVY, spaceAfter=10),
    "h2": ParagraphStyle("H2", parent=base["Heading2"], fontName=BOLD, fontSize=16,
                         leading=19, textColor=NAVY, spaceBefore=0, spaceAfter=9, keepWithNext=True),
    "h3": ParagraphStyle("H3", parent=base["Heading3"], fontName=BOLD, fontSize=10.2,
                         leading=13, textColor=BLUE, spaceBefore=9, spaceAfter=5, keepWithNext=True),
    "h4": ParagraphStyle("H4", parent=base["Heading4"], fontName=BOLD, fontSize=8.8,
                         leading=11, textColor=INK, spaceBefore=7, spaceAfter=4, keepWithNext=True),
    "bullet": ParagraphStyle("Bullet", parent=base["BodyText"], fontName=FONT, fontSize=8.2,
                             leading=11.5, textColor=INK, leftIndent=11, firstLineIndent=-7,
                             bulletIndent=2, spaceAfter=3),
    "quote": ParagraphStyle("Quote", parent=base["BodyText"], fontName=ITALIC, fontSize=8.5,
                            leading=12.2, textColor=SLATE, leftIndent=12, rightIndent=8,
                            borderColor=BLUE, borderWidth=2, borderPadding=8, spaceAfter=7),
    "code": ParagraphStyle("Code", parent=base["Code"], fontName=MONO, fontSize=6.8,
                           leading=9.2, textColor=NAVY, backColor=HexColor("#EEF2F7"),
                           borderColor=LINE, borderWidth=0.5, borderPadding=7, spaceAfter=7),
    "toc": ParagraphStyle("TOC", parent=base["BodyText"], fontName=FONT, fontSize=8.2,
                          leading=11, textColor=INK),
}


class NumberedDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str):
        super().__init__(filename, pagesize=A4, rightMargin=MARGIN_X, leftMargin=MARGIN_X,
                         topMargin=TOP, bottomMargin=BOTTOM, title="SalesV3 2.0 Full System Handoff",
                         author="SalesV3")
        frame = Frame(MARGIN_X, BOTTOM, CONTENT_W, H - TOP - BOTTOM, id="normal", showBoundary=0)
        self.addPageTemplates(PageTemplate(id="body", frames=frame, onPage=page_decor))
        self._bookmark_counter = 0

    def beforeDocument(self):
        # multiBuild performs several pagination passes; bookmark keys must be
        # identical on every pass for the table of contents to converge.
        self._bookmark_counter = 0

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name in {"H1", "H2", "H3"}:
            level = {"H1": 0, "H2": 0, "H3": 1}[flowable.style.name]
            text = flowable.getPlainText()
            key = f"heading-{self._bookmark_counter}"
            self._bookmark_counter += 1
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(text, key, level=level, closed=False)
            # Keep the printed contents compact: section-level entries only.
            # H3 entries still appear in the PDF outline/bookmarks.
            if flowable.style.name == "H2":
                self.notify("TOCEntry", (level, text, self.page, key))


def page_decor(c: canvas.Canvas, doc):
    page = doc.page
    if page == 1:
        return
    c.saveState()
    c.setFillColor(WHITE)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(NAVY)
    c.rect(0, H - 8 * mm, W, 8 * mm, fill=1, stroke=0)
    c.setFillColor(HexColor("#9FC1FF"))
    c.setFont(BOLD, 6.8)
    c.drawString(MARGIN_X, H - 5.1 * mm, "SALESV3 2.0 / FULL SYSTEM HANDOFF")
    c.setStrokeColor(LINE)
    c.line(MARGIN_X, 11 * mm, W - MARGIN_X, 11 * mm)
    c.setFillColor(MUTED)
    c.setFont(FONT, 6.2)
    c.drawString(MARGIN_X, 7.2 * mm, "Private working document | Live implementation snapshot | 16 July 2026")
    c.drawRightString(W - MARGIN_X, 7.2 * mm, str(page))
    c.restoreState()


class CoverFlowable(Flowable):
    def __init__(self):
        super().__init__()
        self.width, self.height = W, H

    def wrap(self, availWidth, availHeight):
        return availWidth, availHeight

    def draw(self):
        c = self.canv
        x0 = -MARGIN_X
        y0 = -BOTTOM
        c.setFillColor(NAVY)
        c.rect(x0, y0, W, H, fill=1, stroke=0)
        c.setFillColor(BLUE)
        c.circle(x0 + W - 24 * mm, y0 + H - 25 * mm, 53 * mm, fill=1, stroke=0)
        c.setFillColor(HexColor("#173E73"))
        c.circle(x0 + W + 9 * mm, y0 + H - 72 * mm, 42 * mm, fill=1, stroke=0)
        c.setFillColor(HexColor("#9FC1FF"))
        c.setFont(BOLD, 9)
        c.drawString(x0 + 19 * mm, y0 + H - 40 * mm, "PRODUCT / UI / DATA / AGENT ARCHITECTURE")
        c.setFillColor(WHITE)
        c.setFont(BOLD, 27)
        c.drawString(x0 + 19 * mm, y0 + H - 62 * mm, "SalesV3 2.0")
        c.setFont(BOLD, 22)
        c.drawString(x0 + 19 * mm, y0 + H - 75 * mm, "Full System Handoff")
        p = Paragraph(
            "A complete description of what was built, how the founder revenue cockpit works, "
            "what every screen and agent does, how commercial truth flows through the architecture, "
            "and how to continue the system safely.",
            ParagraphStyle("cover", fontName=FONT, fontSize=11, leading=16, textColor=HexColor("#D9E7FF")),
        )
        p.wrapOn(c, 137 * mm, 50 * mm)
        p.drawOn(c, x0 + 19 * mm, y0 + H - 113 * mm)
        c.setFillColor(HexColor("#17304F"))
        c.roundRect(x0 + 19 * mm, y0 + H - 162 * mm, W - 38 * mm, 31 * mm, 8, fill=1, stroke=0)
        c.setFillColor(HexColor("#9FC1FF"))
        c.setFont(BOLD, 7.5)
        c.drawString(x0 + 25 * mm, y0 + H - 141 * mm, "PRODUCT THESIS")
        c.setFillColor(WHITE)
        c.setFont(BOLD, 11)
        c.drawString(x0 + 25 * mm, y0 + H - 151 * mm, "The next action is the primary object.")
        c.setFont(FONT, 8.5)
        c.setFillColor(HexColor("#D9E7FF"))
        c.drawString(x0 + 25 * mm, y0 + H - 158 * mm, "Paid commitment is the primary KPI. Evidence and human authority govern progression.")
        c.setFillColor(WHITE)
        c.setFont(BOLD, 9)
        c.drawString(x0 + 19 * mm, y0 + 28 * mm, "Prepared 16 July 2026")
        c.setFillColor(HexColor("#9DB2CF"))
        c.setFont(FONT, 7)
        c.drawString(x0 + 19 * mm, y0 + 21 * mm, "Private working document | /Users/andrewgordienko/Documents/salesv3")


def para(text, style="body"):
    return Paragraph(inline_markup(text), styles[style])


def visual_architecture():
    boxes = [
        ("RAW INPUT", "connections.txt | allchats.txt | public evidence | provider data", HexColor("#E8F0FF")),
        ("NORMALIZE", "parse | clean | fingerprint | classify | preserve lineage", HexColor("#EEF2F7")),
        ("CANONICAL CRM", "SQLite | immutable events | identity | ventures | plays | safety", HexColor("#E4F4ED")),
        ("INTELLIGENCE", "56 agents | deterministic scoring | response and experiment analysis", HexColor("#F0EAFF")),
        ("APPLICATION", "founder ops | meetings | deals | memory | reports | APIs", HexColor("#FFF3D6")),
        ("FOUNDER UX", "Today | Relationships | Calendar | Pipeline | System Health", HexColor("#FFE9E7")),
    ]
    data = []
    for title, body, color in boxes:
        data.append([Paragraph(f"<b>{title}</b><br/><font size='6.8'>{body}</font>", styles["small"])])
        if title != "FOUNDER UX":
            data.append([Paragraph("v", ParagraphStyle("arrow", fontName=BOLD, fontSize=8, alignment=TA_CENTER, textColor=BLUE))])
    table = Table(data, colWidths=[CONTENT_W * .82], hAlign="CENTER")
    commands = [("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (0, 0), (-1, -1), "CENTER")]
    row_index = 0
    for _, _, color in boxes:
        commands.extend([
            ("BACKGROUND", (0, row_index), (0, row_index), color),
            ("BOX", (0, row_index), (0, row_index), .6, LINE),
            ("LEFTPADDING", (0, row_index), (0, row_index), 10),
            ("RIGHTPADDING", (0, row_index), (0, row_index), 10),
            ("TOPPADDING", (0, row_index), (0, row_index), 7),
            ("BOTTOMPADDING", (0, row_index), (0, row_index), 7),
        ])
        row_index += 2
    table.setStyle(TableStyle(commands))
    return KeepTogether([para("Architecture at a glance", "h3"), table, Spacer(1, 8)])


def visual_ui():
    score = [[para(x, "tiny") for x in ["LIVE REPLIES", "MEETINGS", "QUALIFIED", "PROPOSALS", "PAID", "OVERDUE"]],
             [para(x, "tiny") for x in ["1", "0", "0", "0", "$0", "8"]]]
    score_table = Table(score, colWidths=[CONTENT_W / 6] * 6)
    score_table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), .5, LINE), ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE), ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    layout = Table([
        [Paragraph("<b>TODAY QUEUE</b><br/>Venture + action + due state<br/>Person + reason + evidence<br/>Complete | Snooze | Open | Close", styles["small"]),
         Paragraph("<b>PIPELINE / LEARNING</b><br/>GNK | OHUB | Morrow<br/>Engaged -> Discovery -> Qualified -> Proposal -> Won<br/><br/>Any reply is shown separately from qualified reply.", styles["small"])],
    ], colWidths=[CONTENT_W * .59, CONTENT_W * .41])
    layout.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), .6, LINE), ("INNERGRID", (0, 0), (-1, -1), .6, LINE),
        ("BACKGROUND", (0, 0), (0, 0), BLUE_SOFT), ("BACKGROUND", (1, 0), (1, 0), GREEN_SOFT),
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9), ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return KeepTogether([para("Today page wireframe", "h3"), score_table, Spacer(1, 5), layout, Spacer(1, 8)])


def table_from_markdown(block):
    parsed = []
    for line in block:
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        parsed.append(cells)
    if len(parsed) > 1 and all(re.fullmatch(r":?-{3,}:?", c.replace(" ", "")) for c in parsed[1]):
        parsed.pop(1)
    cols = max(len(row) for row in parsed)
    if cols >= 8:
        return [Paragraph("The compact wide-format registry table is represented by the complete 56-agent detailed catalogue that follows; no agent is omitted.", styles["quote"])]
    parsed = [row + [""] * (cols - len(row)) for row in parsed]
    widths = [CONTENT_W / cols] * cols
    # Give narrative columns more room in common 3-5 column tables.
    if cols == 3:
        widths = [CONTENT_W * .25, CONTENT_W * .17, CONTENT_W * .58]
    elif cols == 4:
        widths = [CONTENT_W * .18, CONTENT_W * .14, CONTENT_W * .34, CONTENT_W * .34]
    elif cols == 5:
        widths = [CONTENT_W * .13, CONTENT_W * .20, CONTENT_W * .23, CONTENT_W * .23, CONTENT_W * .21]
    cell_style = styles["tiny"] if cols >= 5 else styles["small"]
    data = []
    for ri, row in enumerate(parsed):
        data.append([Paragraph(("<b>" if ri == 0 else "") + inline_markup(c) + ("</b>" if ri == 0 else ""), cell_style) for c in row])
    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("GRID", (0, 0), (-1, -1), .4, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, HexColor("#F4F7FA")]),
    ]))
    return [table, Spacer(1, 7)]


def parse_markdown(text):
    lines = text.splitlines()
    story = []
    paragraph_lines = []

    def flush_paragraph():
        if paragraph_lines:
            combined = " ".join(x.strip() for x in paragraph_lines).strip()
            if combined:
                story.append(para(combined))
            paragraph_lines.clear()

    i = 0
    first_h1 = True
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            flush_paragraph()
            i += 1
            continue
        if line.startswith("# "):
            flush_paragraph()
            if first_h1:
                first_h1 = False
            else:
                story.append(PageBreak())
            story.append(Paragraph(inline_markup(line[2:]), styles["h1"]))
            i += 1
            continue
        if line.startswith("## "):
            flush_paragraph()
            if story and not isinstance(story[-1], PageBreak):
                story.append(PageBreak())
            title = line[3:]
            story.append(Paragraph(inline_markup(title), styles["h2"]))
            if title.startswith("5. UI/UX"):
                story.append(visual_ui())
            if title.startswith("8. Architecture"):
                story.append(visual_architecture())
            i += 1
            continue
        if line.startswith("### "):
            flush_paragraph()
            story.append(Paragraph(inline_markup(line[4:]), styles["h3"]))
            i += 1
            continue
        if line.startswith("#### "):
            flush_paragraph()
            story.append(Paragraph(inline_markup(line[5:]), styles["h4"]))
            i += 1
            continue
        if line.strip() == "---":
            flush_paragraph()
            story.append(HRFlowable(width="100%", thickness=.6, color=LINE, spaceBefore=4, spaceAfter=8))
            i += 1
            continue
        if line.startswith("|") and i + 1 < len(lines) and lines[i + 1].startswith("|"):
            flush_paragraph()
            block = []
            while i < len(lines) and lines[i].startswith("|"):
                block.append(lines[i])
                i += 1
            story.extend(table_from_markdown(block))
            continue
        if re.match(r"^\s*[-*] ", line):
            flush_paragraph()
            item = re.sub(r"^\s*[-*] ", "", line)
            story.append(Paragraph(inline_markup(item), styles["bullet"], bulletText="-"))
            i += 1
            continue
        numbered = re.match(r"^\s*(\d+)\.\s+(.*)", line)
        if numbered:
            flush_paragraph()
            story.append(Paragraph(inline_markup(numbered.group(2)), styles["bullet"], bulletText=numbered.group(1) + "."))
            i += 1
            continue
        if line.startswith("> "):
            flush_paragraph()
            story.append(Paragraph(inline_markup(line[2:]), styles["quote"]))
            i += 1
            continue
        if line.startswith("    "):
            flush_paragraph()
            story.append(Paragraph(esc(line.strip()), styles["code"]))
            i += 1
            continue
        paragraph_lines.append(line)
        i += 1
    flush_paragraph()
    return story


def build():
    raw = SOURCE.read_text(encoding="utf-8")
    # The cover already carries the title/subtitle/metadata. Start the body at
    # section 1 to avoid repeating two nearly empty title pages.
    body_start = raw.find("\n## 1. Purpose of this document")
    if body_start >= 0:
        raw = raw[body_start + 1:]
    # The wide compact agent table is valuable in Markdown but intentionally
    # omitted from the portrait PDF. The following detailed catalogue includes
    # every field for every agent and is substantially more readable.
    compact_start = raw.find("\n## 13. Full 56-agent catalogue: compact reference")
    detail_start = raw.find("\n## 14. Full 56-agent catalogue: detailed descriptions")
    if compact_start >= 0 and detail_start > compact_start:
        raw = raw[:compact_start] + raw[detail_start:]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = NumberedDocTemplate(str(OUT))
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle("TOC0", parent=styles["toc"], fontName=BOLD, leftIndent=0, firstLineIndent=0, spaceBefore=4),
        ParagraphStyle("TOC1", parent=styles["toc"], leftIndent=12, firstLineIndent=0, fontSize=7.5, leading=9.5),
    ]
    intro = [
        CoverFlowable(), PageBreak(),
        Paragraph("Contents", styles["h1"]),
        Paragraph("This edition is deliberately exhaustive. The Markdown source remains the best machine-readable handoff; this PDF is the designed human-readable edition.", styles["body"]),
        Spacer(1, 5), toc, PageBreak(),
    ]
    story = intro + parse_markdown(raw)
    doc.multiBuild(story)
    shutil.copy2(OUT, DOCUMENTS_COPY)
    print(f"Wrote {OUT}")
    print(f"Copied {DOCUMENTS_COPY}")


if __name__ == "__main__":
    build()
