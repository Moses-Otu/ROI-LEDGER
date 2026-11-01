"""Builds the AI ROI Ledger one pager (page 1) and getting-started guide (page 2).

Plain style, mirroring the Builda one pager: header, two-column intro, user flow,
tables, capabilities grid, worked example, footer.

Usage (needs `pip install reportlab`; uses Windows' Arial for £, € and arrows):
    python docs/make_onepager.py docs/AI-ROI-Ledger-One-Pager.pdf
"""
import sys

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUT = sys.argv[1]
URL = "roi-ledger-pi.vercel.app"

# Arial covers £, €, → and en dashes, which the built-in Helvetica does not.
pdfmetrics.registerFont(TTFont("Arial", r"C:\Windows\Fonts\arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", r"C:\Windows\Fonts\arialbd.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Italic", r"C:\Windows\Fonts\ariali.ttf"))
pdfmetrics.registerFontFamily("Arial", normal="Arial", bold="Arial-Bold", italic="Arial-Italic")

INK = colors.HexColor("#1a1a1a")
MUTED = colors.HexColor("#5c5c5c")
RULE = colors.HexColor("#d4d4d4")
ACCENT = colors.HexColor("#0f766e")  # the app's teal accent
TINT = colors.HexColor("#f4f4f2")

title = ParagraphStyle("title", fontName="Arial-Bold", fontSize=21, leading=24, textColor=INK)
tagline = ParagraphStyle("tagline", fontName="Arial", fontSize=10, leading=13, textColor=INK)
url = ParagraphStyle("url", fontName="Arial", fontSize=8.5, leading=11, textColor=MUTED, alignment=TA_RIGHT)
label = ParagraphStyle("label", fontName="Arial-Bold", fontSize=7.4, leading=10, textColor=ACCENT, spaceAfter=3)
body = ParagraphStyle("body", fontName="Arial", fontSize=8.3, leading=11.2, textColor=INK)
small = ParagraphStyle("small", parent=body, fontSize=7.6, leading=10)
cell = ParagraphStyle("cell", parent=body, fontSize=7.5, leading=9.6)
cellb = ParagraphStyle("cellb", parent=cell, fontName="Arial-Bold")
head = ParagraphStyle("head", parent=cell, fontName="Arial-Bold", fontSize=6.9, textColor=MUTED)
step_n = ParagraphStyle("stepn", fontName="Arial-Bold", fontSize=8.2, leading=10.5, textColor=ACCENT)
note = ParagraphStyle("note", parent=small, textColor=MUTED, fontName="Arial-Italic")

W = A4[0] - 2 * 15 * mm - 12  # frame text width (6pt frame padding each side)


def P(text, style=body):
    return Paragraph(text, style)


def section(text):
    return Paragraph(text.upper(), label)


def rule_table(rows, widths, header=True, zebra=False):
    t = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 2.2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.2),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, RULE),
    ]
    if header:
        style += [("LINEBELOW", (0, 0), (-1, 0), 0.8, MUTED)]
    if zebra:
        for r in range(1 if header else 0, len(rows), 2):
            style.append(("BACKGROUND", (0, r), (-1, r), TINT))
    t.setStyle(TableStyle(style))
    return t


def header_block(subtitle):
    t = Table(
        [[[P("AI ROI LEDGER", title), Spacer(1, 2), P(subtitle, tagline)], P(URL, url)]],
        colWidths=[W * 0.72, W * 0.28],
    )
    t.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("LINEBELOW", (0, 0), (-1, 0), 1.2, INK),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return t


def grid(items, cols=2):
    """Capability-style grid: bold lead-in followed by text."""
    rows, row = [], []
    for lead, text in items:
        row.append(P(f"<b>{lead}</b> {text}", small))
        if len(row) == cols:
            rows.append(row)
            row = []
    if row:
        rows.append(row + [""] * (cols - len(row)))
    t = Table(rows, colWidths=[W / cols] * cols)
    t.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
            ]
        )
    )
    return t


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.5)
    canvas.line(15 * mm + 6, 12 * mm, A4[0] - 15 * mm - 6, 12 * mm)
    canvas.setFont("Arial", 7.4)
    canvas.setFillColor(MUTED)
    canvas.drawString(15 * mm + 6, 8 * mm, "AI ROI Ledger · Is each AI deployment paying for itself?")
    canvas.drawRightString(A4[0] - 15 * mm - 6, 8 * mm, f"{URL} · page {doc.page}")
    canvas.restoreState()


story = []

# ---------------------------------------------------------------- page 1
story.append(header_block("Know whether each AI deployment is paying for itself."))
story.append(Spacer(1, 6))

intro = Table(
    [
        [section("What it is"), section("Who it's for")],
        [
            P(
                "AI ROI Ledger tracks every AI deployment a company runs (agents, automation workflows, "
                "AI tools) and answers one question for each: <b>is it paying for itself?</b> It compares what "
                "the deployment costs (build, hosting, AI tokens and the staff time still spent checking it) "
                "with the value it returns against how the work was done <i>before</i> AI. It then shows net "
                "return, ROI, payback date, cost per run and a clear <b>Scale / Fix / Kill / Watch</b> flag. "
                "Every figure opens up to show its inputs and formula, so it can be defended in a budget meeting."
            ),
            P(
                "<b>Operations and finance leads</b> who need to know which AI projects to expand and which to stop.<br/>"
                "<b>AI and automation owners</b> proving the value of what they built.<br/>"
                "<b>Consultants</b> measuring results for clients after go-live.<br/>"
                "<b>Builders</b> who want runs and costs reported automatically from their tools."
            ),
        ],
    ],
    colWidths=[W * 0.62, W * 0.38],
)
intro.setStyle(
    TableStyle(
        [
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (0, -1), 16),
            ("RIGHTPADDING", (1, 0), (1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 0),
        ]
    )
)
story.append(intro)
story.append(Spacer(1, 6))

story.append(section("How it works"))
flow = [
    ("1. Sign in", "One click. Set your organisation's name, currency (GBP, EUR, USD) and staff hourly cost."),
    ("2. Register", "Add a deployment: what it does, the task it replaced, its owner and go-live date."),
    ("3. Set the baseline", "How the task was done before AI: volume, minutes per task, hourly cost, errors."),
    ("4. Feed it data", "Runs, costs and human review time, from connectors, the API, a CSV or quick forms."),
    ("5. Read the verdict", "Cost, value, net, ROI, payback and a flag, refreshed daily, every number explained."),
    ("6. Act on it", "Alerts when a flag changes or cost per run spikes, plus a monthly summary."),
]
flow_t = Table([[P(f"<b>{t}</b>", step_n) for t, _ in flow], [P(d, small) for _, d in flow]], colWidths=[W / 6] * 6)
flow_t.setStyle(
    TableStyle(
        [
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 1),
        ]
    )
)
story.append(flow_t)
story.append(Spacer(1, 6))

story.append(section("The numbers it gives you"))
numbers = [
    [P("FIGURE", head), P("HOW IT IS WORKED OUT", head), P("WHAT IT TELLS YOU", head)],
    [P("Cost to date", cellb), P("One-off costs (build, setup, training) + running costs (AI tokens, hosting, licences, spread by day) + human time (review, fixes, escalations × hourly rate).", cell), P("The full cost, including the people still needed around the AI.", cell)],
    [P("Value to date", cellb), P("Completed runs × baseline minutes per task ÷ 60 × hourly rate, plus errors avoided × cost per error when both error rates are known.", cell), P("Staff time and rework the deployment has saved.", cell)],
    [P("Net and ROI", cellb), P("Net = value − cost. ROI = net ÷ cost.", cell), P("Whether it is ahead, and by how much per £1 spent.", cell)],
    [P("Payback date", cellb), P("First day cumulative value passes cumulative cost; otherwise projected from the last 30 days.", cell), P("When the investment is (or will be) recovered.", cell)],
    [P("Cost per completed run", cellb), P("Total cost ÷ runs that got the work done (including those a person finished).", cell), P("Unit cost to compare across deployments and over time.", cell)],
    [P("Flag", cellb), P("Kill → Fix → Scale → Watch, using thresholds you can change.", cell), P("What to do next, with the reasons listed.", cell)],
    [P("Confidence", cellb), P("Medium when the baseline was measured and runs cover 80%+ of days; otherwise Low.", cell), P("How far to trust the result before acting on it.", cell)],
]
story.append(rule_table(numbers, [W * 0.2, W * 0.5, W * 0.3]))
story.append(Spacer(1, 6))

story.append(section("Getting data in: works with any stack"))
story.append(
    grid(
        [
            ("Quick forms.", "Costs and a weekly human-time entry, typed in under a minute."),
            ("CSV import.", "Templates for runs, costs and time, with a checked preview before anything is saved."),
            ("Push API.", "One call at the end of each run from any code, Make, Zapier or Power Automate. Re-sending never duplicates."),
            ("Langfuse.", "Pulls AI cost, tokens and model per run every day."),
            ("OpenRouter.", "Pulls daily AI spend per API key."),
            ("n8n.", "Pulls workflow executions; ready-made templates report runs, collect weekly time and send alerts."),
        ]
    )
)
story.append(Spacer(1, 6))

story.append(section("Capabilities"))
story.append(
    grid(
        [
            ("Every number explained.", "Click any figure to see its formula, inputs and any assumptions made."),
            ("Counted once.", "Human review time is a cost; value is the full time saved. Nothing is deducted twice."),
            ("Daily snapshots.", "Data syncs and results recalculate every night, building a history over time."),
            ("Alerts out.", "Signed webhooks for flag changes, cost-per-run spikes and the monthly summary."),
            ("Secure by design.", "Each organisation sees only its own data; keys are encrypted and never shown again."),
            ("Metadata only.", "Prompts and AI outputs are never stored: just counts, timings, status and cost."),
        ]
    )
)
story.append(Spacer(1, 8))

example = Table(
    [
        [
            [
                section("Example (illustrative figures)"),
                P(
                    "<b>Procurement assistant.</b> Requests used to take days by email: about 600 a month at 30 minutes of staff "
                    "time each, at £40 an hour, so £20 of staff time per request. With the assistant, around 570 a month complete "
                    "(about £11,400 of value). It cost £25,000 to build, about £600 a month to run, and staff spend roughly 20 hours "
                    "a month reviewing it (£800). <b>Result:</b> payback in about 2.5 months; after six months, about £35,000 net, "
                    "ROI around 105%, flag <b>Scale</b>. Confidence stays <b>Low</b> until the baseline is measured rather than "
                    "reconstructed: the ledger says so, and shows why.",
                    small,
                ),
            ]
        ]
    ],
    colWidths=[W],
)
example.setStyle(
    TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, -1), TINT),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]
    )
)
story.append(example)

# ---------------------------------------------------------------- page 2
story.append(PageBreak())
story.append(header_block("Getting started: a step-by-step guide for anyone using the app."))
story.append(Spacer(1, 8))
story.append(
    P(
        "Allow about 20 minutes for your first deployment. You can come back to any step later; results update as soon as you save. "
        "Rough numbers are fine to start with: the app marks them as estimates and shows lower confidence.",
        small,
    )
)
story.append(Spacer(1, 7))

steps = [
    ("1", "Sign in and set up", f"Go to <b>{URL}</b> → <b>Sign in</b>.",
     "First time only: enter your organisation's name, choose its currency (<b>GBP, EUR or USD</b>) and the "
     "<b>default loaded hourly rate</b> (salary plus about 30% overheads, e.g. £40). Changing currency later does not convert amounts."),
    ("2", "Register a deployment", "Deployments → <b>Register deployment</b>",
     "Name it, choose the type (agent, workflow, seat tool, custom GPT), set status <b>Live</b> and the <b>go-live date</b>. "
     "Describe the task it replaced and add the owner's email. Under <i>Data source mapping</i>, add the IDs your tools use "
     "(n8n workflow ID, Langfuse tag, OpenRouter key label) so data finds it."),
    ("3", "Add the baseline", "Deployment → <b>Baseline</b>",
     "How the work was done before AI: tasks per month, hands-on minutes per task, hourly rate, and error rates if known. "
     "No records? Count requests in the old inbox or queue for 2–3 months and ask 3–5 people for typical minutes; choose "
     "<b>Reconstructed</b>. The page includes guidance."),
    ("4", "Record costs", "Deployment → <b>Log time / cost</b>",
     "Add <b>one-off</b> costs (build, setup, training) with their date, and <b>recurring</b> costs (hosting, licences, AI tokens) "
     "with the period they cover. Recurring costs are spread evenly across their days."),
    ("5", "Log human time weekly", "Deployment → <b>Log time / cost</b>",
     "Minutes your team spent last week reviewing output, fixing mistakes, handling escalations and maintaining it. "
     "This is the honest cost of the AI; it takes under a minute. (The n8n check-in template can email owners for it.)"),
    ("6", "Bring in runs", "<b>Settings</b> or <b>Import</b>",
     "Pick one: a <b>connector</b> (Settings → Connectors → add n8n, Langfuse or OpenRouter, then <b>Sync now</b>); the "
     "<b>push API</b> (Settings → Ingest keys → create a key for your developer or automation); or a <b>CSV</b> "
     "(Import → download template → upload → check preview → import). No run data? Value is estimated from the baseline."),
    ("7", "Read the dashboard", "Deployments → your deployment",
     "Six headline figures, a cost-versus-value chart with the payback point, cost split by layer, run statistics and the "
     "baseline. Click <b>Explain</b> under any number to see exactly how it was calculated. <b>Recalculate</b> refreshes it now; "
     "otherwise it updates every night."),
    ("8", "Stay informed", "<b>Settings</b>",
     "Adjust the flag thresholds to your appetite for risk. Add a <b>webhook</b> (for example the n8n alerts template) to be told "
     "when a flag changes, cost per run jumps, or the monthly summary is ready."),
]
rows = [[P("#", head), P("STEP", head), P("WHERE", head), P("WHAT TO DO", head)]]
for n, name, where, what in steps:
    rows.append([P(n, step_n), P(name, cellb), P(where, cell), P(what, cell)])
story.append(rule_table(rows, [W * 0.04, W * 0.17, W * 0.2, W * 0.59], zebra=True))
story.append(Spacer(1, 6))

flags = [
    [P("FLAG", head), P("WHEN", head), P("WHAT TO DO", head)],
    [P("Scale", cellb), P("ROI above 100% and value at or above the business case.", cell), P("Roll it out further.", cell)],
    [P("Fix", cellb), P("People touch more than 20% of runs, or it loses money despite normal use.", cell), P("Improve prompts, rules or process.", cell)],
    [P("Kill", cellb), P("Live 90+ days, losing money, and used at under 30% of the old volume.", cell), P("Stop it or rethink it.", cell)],
    [P("Watch", cellb), P("None of the above yet.", cell), P("Keep collecting data.", cell)],
]
conf = [
    [P("CONFIDENCE", head), P("MEANING", head)],
    [P("Medium", cellb), P("Baseline was measured, and run data covers at least 80% of days since go-live.", cell)],
    [P("Low", cellb), P("Baseline reconstructed or estimated, or gaps in run data. Results are indicative.", cell)],
    [P("High", cellb), P("Reserved for controlled comparisons (e.g. staggered roll-out). Coming later.", cell)],
]
pair = Table(
    [[[section("Reading the flag"), rule_table(flags, [W * 0.09, W * 0.3, W * 0.17])],
      [section("Reading the confidence"), rule_table(conf, [W * 0.11, W * 0.29])]]],
    colWidths=[W * 0.58, W * 0.42],
)
pair.setStyle(
    TableStyle(
        [
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (0, -1), 10),
            ("RIGHTPADDING", (1, 0), (1, -1), 0),
        ]
    )
)
story.append(pair)
story.append(Spacer(1, 6))

story.append(section("Good to know"))
story.append(
    grid(
        [
            ("Nothing is counted twice.", "Review and fix time is always a cost; value is always the full time the baseline says the task took."),
            ("Re-sending is safe.", "Runs, costs and CSV rows with the same ID update the existing record instead of adding a new one."),
            ("Keys stay secret.", "Connector keys are encrypted and never shown again; ingest keys are shown once, so copy them when created."),
            ("Pilot access.", "During the pilot, everyone signs in to one shared workspace. Email sign-in can be switched back on at any time."),
        ]
    )
)

doc = SimpleDocTemplate(
    OUT,
    pagesize=A4,
    leftMargin=15 * mm,
    rightMargin=15 * mm,
    topMargin=13 * mm,
    bottomMargin=16 * mm,
    title="AI ROI Ledger — One Pager and Getting Started",
    author="AI ROI Ledger",
    subject="What AI ROI Ledger is, how it works, and how to use it",
)
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print("written", OUT)
