"""
Blueprint 09 — Vendor Scorecard (reference solution)

Ranks every vendor on the work they've actually done: jobs, speed, tenant
rating, how far invoices land from estimates, and how often their jobs get
cancelled. Writes a markdown table to mx-summit/out/vendor-scorecard.md.

Run it:   python3 mx-summit/solutions/vendor_scorecard.py
"""

import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pm_reader as pm  # noqa: E402


def avg(values):
    values = [v for v in values if v is not None]
    return sum(values) / len(values) if values else None


def score_vendors(melds):
    by_vendor = defaultdict(list)
    for m in melds:
        if m["vendor_name"]:
            by_vendor[m["vendor_name"]].append(m)

    rows = []
    for vendor, jobs in by_vendor.items():
        done = [j for j in jobs if j["status"] == "COMPLETE"]
        cancelled = [j for j in jobs if j["status"] == "MANAGER_CANCELED"]
        days = [(pm.parse_dt(j["marked_complete"]) - pm.parse_dt(j["assigned_at"])).total_seconds() / 86400
                for j in done if pm.parse_dt(j["marked_complete"]) and pm.parse_dt(j["assigned_at"])]
        ratings = [pm.to_float(j["tenant_rating"]) for j in done]
        variances = [(pm.to_float(j["invoice_amount"]) - pm.to_float(j["estimate_total"])) / pm.to_float(j["estimate_total"])
                     for j in done if pm.to_float(j["invoice_amount"]) and pm.to_float(j["estimate_total"])]
        rows.append({
            "vendor": vendor,
            "jobs": len(jobs),
            "completed": len(done),
            "avg_days": avg(days),
            "avg_rating": avg(ratings),
            "rated_count": len([r for r in ratings if r is not None]),
            "cost_variance": avg(variances),
            "cancel_rate": len(cancelled) / len(jobs) if jobs else 0,
        })

    # Simple composite so the table has an order: rating and speed matter most,
    # then staying on estimate, then not getting cancelled. Tweak the weights.
    def composite(r):
        rating = (r["avg_rating"] or 3) / 5                      # 0..1, higher better
        speed = 1 / (1 + (r["avg_days"] or 5))                   # faster -> closer to 1
        on_budget = 1 - min(abs(r["cost_variance"] or 0), 0.5)   # 1 = on estimate
        reliable = 1 - r["cancel_rate"]
        return 0.4 * rating + 0.3 * speed + 0.2 * on_budget + 0.1 * reliable
    for r in rows:
        r["score"] = composite(r)
    return sorted(rows, key=lambda r: -r["score"])


def fmt(v, kind):
    if v is None:
        return "—"
    return {"days": f"{v:.1f}", "rating": f"{v:.1f} / 5", "pct": f"{v:+.0%}", "rate": f"{v:.0%}"}[kind]


def render(rows, today):
    out = [f"# Vendor Scorecard — as of {today:%B %d, %Y}", "",
           "| # | Vendor | Jobs | Done | Avg days to complete | Avg tenant rating | Invoice vs estimate | Cancel rate |",
           "|---|---|---|---|---|---|---|---|"]
    for i, r in enumerate(rows, 1):
        rating = fmt(r["avg_rating"], "rating") + (f" ({r['rated_count']} rated)" if r["avg_rating"] else "")
        out.append(f"| {i} | {r['vendor']} | {r['jobs']} | {r['completed']} | {fmt(r['avg_days'], 'days')} | "
                   f"{rating} | {fmt(r['cost_variance'], 'pct')} | {fmt(r['cancel_rate'], 'rate')} |")
    out += ["", "Days to complete = vendor accepted the job → marked complete. "
            "Invoice vs estimate = average of (invoice − estimate) ÷ estimate; positive means over.",
            "Ranked by a simple weighted score (rating 40%, speed 30%, on-budget 20%, not cancelled 10%). "
            "Change the weights in vendor_scorecard.py to match what you care about.", ""]
    return "\n".join(out)


def main():
    today = pm.as_of()
    report = render(score_vendors(pm.load_melds()), today)
    pm.OUT_DIR.mkdir(exist_ok=True)
    path = pm.OUT_DIR / "vendor-scorecard.md"
    path.write_text(report)
    print(report)
    print(f"(saved to {path.relative_to(pm.HERE.parent)})")


if __name__ == "__main__":
    main()
