"""
Generate the synthetic Property Meld export used in the MX Summit sessions.

Everything here is made up. The company (Blue Ridge Property Management), the
properties, the tenants, the vendors, and the owners are all fictional.

Run it yourself any time:

    python3 mx-summit/data/generate_sample_data.py

It is seeded, so it writes the exact same four CSV files every time. That means
everyone in the room is looking at the same data, and the "what good looks like"
output in solutions/README.md matches what you get on your laptop.

Column names mirror Property Meld's public API where it makes sense. See
data/README.md for the mapping and the places we simplified.
"""

import csv
import random
from datetime import datetime, timedelta
from pathlib import Path

SEED = 2026
# The export is anchored to a fixed "today". pm_reader treats the newest
# timestamp in the file as "today", so the sample never goes stale.
AS_OF = datetime(2026, 9, 22, 8, 0)
DAYS_OF_HISTORY = 90

OUT_DIR = Path(__file__).resolve().parent

PROPERTIES = [
    # id, property_name, line_1, city, state, zip, units
    (101, "Maple Court Apartments", "410 Maple Ct", "Asheville", "NC", "28801", 6),
    (102, "Riverbend Townhomes", "88 Riverbend Dr", "Asheville", "NC", "28803", 4),
    (103, "Cedar Ridge Flats", "1520 Cedar Ridge Rd", "Hendersonville", "NC", "28791", 5),
    (104, "Hilltop Duplex", "27 Hilltop Ln", "Weaverville", "NC", "28787", 2),
    (105, "Laurel Park Cottages", "300 Laurel Park Ave", "Hendersonville", "NC", "28739", 3),
    (106, "Old Mill Lofts", "9 Old Mill St", "Asheville", "NC", "28801", 4),
    (107, "Sunset Terrace", "615 Sunset Terrace", "Black Mountain", "NC", "28711", 3),
    (108, "Pinecrest House", "72 Pinecrest Way", "Asheville", "NC", "28806", 1),
    (109, "Harbor View Apartments", "1201 Harbor View Blvd", "Asheville", "NC", "28804", 3),
]

OWNERS = [
    # id, first_name, last_name, email, property_ids
    (901, "Dana", "Whitfield", "dana.whitfield@example.com", [101, 108]),
    (902, "Marcus", "Bellamy", "marcus.bellamy@example.com", [102]),
    (903, "Priya", "Raman", "priya.raman@example.com", [103, 107]),
    (904, "Tom", "Okafor", "tom.okafor@example.com", [104]),
    (905, "Elena", "Castellano", "elena.castellano@example.com", [105, 109]),
    (906, "Greg", "Lindqvist", "greg.lindqvist@example.com", [106]),
]

VENDORS = [
    # id, name, email, phone, categories
    (501, "Blue Ridge Plumbing Co.", "dispatch@brplumbing.example.com", "828-555-0101", ["PLUMBING"]),
    (502, "Summit HVAC Services", "service@summithvac.example.com", "828-555-0102", ["HVAC"]),
    (503, "Bright Spark Electric", "jobs@brightspark.example.com", "828-555-0103", ["ELECTRICAL"]),
    (504, "Appliance Doctors", "hello@appliancedoctors.example.com", "828-555-0104", ["APPLIANCE"]),
    (505, "Handy Hank Home Repair", "hank@handyhank.example.com", "828-555-0105", ["GENERAL", "PLUMBING", "APPLIANCE"]),
    (506, "Mountain Air Heating & Cooling", "office@mountainair.example.com", "828-555-0106", ["HVAC"]),
    (507, "Ridgeline Maintenance Crew", "crew@ridgeline.example.com", "828-555-0107", ["GENERAL", "ELECTRICAL"]),
]

TENANT_FIRST = ["Jordan", "Sam", "Alex", "Taylor", "Morgan", "Casey", "Riley", "Jamie",
                "Avery", "Quinn", "Reese", "Drew", "Skyler", "Parker", "Rowan", "Emerson"]
TENANT_LAST = ["Nguyen", "Patel", "Garcia", "Kowalski", "Hughes", "Abara", "Fischer",
               "Delgado", "Moreau", "Sato", "Brennan", "Lindgren", "Osei", "Vance"]

# (work_category, brief_description, description, typical estimate range)
REQUEST_TYPES = [
    ("PLUMBING", "Kitchen sink leaking under cabinet", "Water pooling under the kitchen sink. Tenant put a bucket down.", (120, 350)),
    ("PLUMBING", "Toilet running constantly", "Toilet in the main bath runs nonstop. Jiggling the handle does not help.", (90, 220)),
    ("PLUMBING", "No hot water", "Water heater not producing hot water since this morning.", (150, 900)),
    ("PLUMBING", "Bathtub drain slow", "Tub takes 20 minutes to drain.", (80, 200)),
    ("HVAC", "AC not cooling", "Thermostat set to 70, unit blows warm air.", (150, 1200)),
    ("HVAC", "Furnace making loud bang on startup", "Loud bang when heat kicks on. Tenant is nervous.", (120, 600)),
    ("HVAC", "Thermostat screen blank", "Thermostat display is dead. Batteries replaced already.", (80, 250)),
    ("ELECTRICAL", "Outlet in bedroom not working", "One outlet dead, breaker looks fine.", (90, 250)),
    ("ELECTRICAL", "Bathroom light flickers", "Vanity light flickers and buzzes.", (80, 200)),
    ("ELECTRICAL", "Breaker keeps tripping", "Kitchen breaker trips when microwave and toaster run together.", (120, 400)),
    ("APPLIANCE", "Refrigerator not cold", "Fridge is at 55 degrees. Freezer still works.", (120, 700)),
    ("APPLIANCE", "Dishwasher won't drain", "Standing water at the bottom after every cycle.", (90, 300)),
    ("APPLIANCE", "Dryer not heating", "Dryer runs but clothes come out wet.", (100, 350)),
    ("APPLIANCE", "Oven door won't close", "Oven door hangs open about an inch.", (80, 250)),
    ("GENERAL", "Front door lock sticking", "Key hard to turn in deadbolt.", (60, 180)),
    ("GENERAL", "Window screen torn", "Living room screen has a tear.", (40, 120)),
    ("GENERAL", "Smoke detector chirping", "Chirps every minute. Tenant cannot reach it.", (40, 100)),
    ("GENERAL", "Garbage disposal jammed", "Disposal hums but does not spin.", (60, 200)),
    ("GENERAL", "Ceiling stain in bathroom", "Brown stain spreading on bathroom ceiling.", (150, 600)),
    ("GENERAL", "Closet door off track", "Sliding closet door came off its track.", (40, 120)),
]

PRIORITY_WEIGHTS = [("LOW", 25), ("MEDIUM", 45), ("HIGH", 22), ("EMERGENCY", 8)]


def _pick_weighted(rng, pairs):
    values = [p[0] for p in pairs]
    weights = [p[1] for p in pairs]
    return rng.choices(values, weights=weights, k=1)[0]


def _fmt(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%S") if dt else ""


def build_units():
    """One row per unit. Unit ids are property_id * 10 + n so they read naturally."""
    units = []
    for pid, name, line_1, city, state, postcode, count in PROPERTIES:
        for n in range(1, count + 1):
            label = f"Unit {n}" if count > 1 else "Main"
            units.append({
                "unit_id": pid * 10 + n,
                "unit": label,
                "unit_address": f"{line_1} {label}, {city}, {state} {postcode}" if count > 1
                else f"{line_1}, {city}, {state} {postcode}",
                "property_id": pid,
            })
    return units


def vendor_for(rng, category):
    """Prefer a vendor that lists the category; fall back to a generalist."""
    matches = [v for v in VENDORS if category in v[4]]
    return rng.choice(matches)


def build_melds(rng, units):
    melds = []
    start = AS_OF - timedelta(days=DAYS_OF_HISTORY)
    next_id = 7001

    # Status mix for ~120 melds. The last few are forced so the session demos
    # always have "completed in the last 24 hours", "scheduled today", and
    # "unassigned" rows to point at.
    status_plan = (
        ["COMPLETE"] * 62
        + ["MANAGER_CANCELED"] * 11
        + ["OPEN"] * 20
        + ["PENDING_ASSIGNMENT"] * 12
        + ["PENDING_COMPLETION"] * 10
    )
    rng.shuffle(status_plan)

    for status in status_plan:
        category, brief, description, est_range = rng.choice(REQUEST_TYPES)
        priority = _pick_weighted(rng, PRIORITY_WEIGHTS)
        unit = rng.choice(units)
        tenant = f"{rng.choice(TENANT_FIRST)} {rng.choice(TENANT_LAST)}"

        # Open work skews recent; completed work is spread across the 90 days.
        if status in ("COMPLETE", "MANAGER_CANCELED"):
            created = start + timedelta(days=rng.uniform(0, DAYS_OF_HISTORY - 1))
        else:
            created = AS_OF - timedelta(days=rng.uniform(0.2, 28))
        created = created.replace(hour=rng.randint(7, 19), minute=rng.randint(0, 59), second=0)

        due_days = {"EMERGENCY": 1, "HIGH": 3, "MEDIUM": 7, "LOW": 14}[priority]
        due_date = created + timedelta(days=due_days)

        vendor = None
        assigned_at = scheduled_start = marked_complete = None
        estimate = actual = rating = None

        if status != "PENDING_ASSIGNMENT":
            vendor = vendor_for(rng, category)
            assigned_at = created + timedelta(hours=rng.uniform(1, 48))
            estimate = round(rng.uniform(*est_range), 2)

        if status in ("OPEN", "PENDING_COMPLETION", "COMPLETE"):
            scheduled_start = assigned_at + timedelta(days=rng.uniform(0.5, 6))
            scheduled_start = scheduled_start.replace(minute=rng.choice([0, 30]), second=0)

        if status == "COMPLETE":
            # Vendor-specific speed and pricing habits so the scorecard has a story.
            speed = {501: 1.0, 502: 1.3, 503: 0.9, 504: 1.6, 505: 0.8, 506: 2.2, 507: 1.1}[vendor[0]]
            markup = {501: 1.05, 502: 1.10, 503: 0.98, 504: 1.25, 505: 1.02, 506: 1.35, 507: 1.08}[vendor[0]]
            marked_complete = scheduled_start + timedelta(days=rng.uniform(0.1, 3) * speed)
            actual = round(estimate * markup * rng.uniform(0.9, 1.1), 2)
            if rng.random() < 0.65:
                base = {501: 4.4, 502: 4.0, 503: 4.7, 504: 3.4, 505: 4.6, 506: 2.9, 507: 4.1}[vendor[0]]
                rating = max(1, min(5, round(rng.gauss(base, 0.8))))

        if status == "MANAGER_CANCELED":
            marked_complete = None

        melds.append({
            "id": next_id,
            "brief_description": brief,
            "description": description,
            "status": status,
            "priority": priority,
            "work_category": category,
            "created": created,
            "due_date": due_date,
            "assigned_at": assigned_at,
            "scheduled_start": scheduled_start,
            "marked_complete": marked_complete,
            "property_id": unit["property_id"],
            "unit_id": unit["unit_id"],
            "unit": unit["unit"],
            "unit_address": unit["unit_address"],
            "tenant_name": tenant,
            "vendor_id": vendor[0] if vendor else "",
            "vendor_name": vendor[1] if vendor else "",
            "estimate_total": estimate,
            "invoice_amount": actual,
            "tenant_rating": rating,
        })
        next_id += 1

    # Force a handful of rows into the demo-critical windows.
    completes = [m for m in melds if m["status"] == "COMPLETE"]
    for m in completes[:5]:  # completed in the last 24 hours
        m["marked_complete"] = AS_OF - timedelta(hours=rng.uniform(2, 22))
        m["scheduled_start"] = m["marked_complete"] - timedelta(days=rng.uniform(0.5, 2))
        m["assigned_at"] = m["scheduled_start"] - timedelta(days=1)
        m["created"] = m["assigned_at"] - timedelta(days=rng.uniform(1, 4))
    opens = [m for m in melds if m["status"] == "OPEN"]
    for m in opens[:4]:  # scheduled today
        m["scheduled_start"] = AS_OF.replace(hour=rng.choice([9, 10, 13, 15]), minute=0)
    for m in opens[4:8]:  # clearly overdue
        m["created"] = AS_OF - timedelta(days=rng.uniform(12, 26))
        m["due_date"] = m["created"] + timedelta(days=3)
        m["assigned_at"] = m["created"] + timedelta(days=1)
        m["scheduled_start"] = m["assigned_at"] + timedelta(days=2)

    melds.sort(key=lambda m: m["created"])
    for m in melds:
        # "updated" never runs past the anchor — a future appointment was booked today, not in the future.
        m["updated"] = min(AS_OF, max(x for x in [m["created"], m["assigned_at"], m["scheduled_start"], m["marked_complete"]] if x))
    return melds


def write_csv(name, rows, columns):
    path = OUT_DIR / name
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=columns)
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in columns})
    print(f"wrote {path.name}: {len(rows)} rows")


def main():
    rng = random.Random(SEED)
    units = build_units()
    melds = build_melds(rng, units)

    meld_cols = ["id", "brief_description", "description", "status", "priority", "work_category",
                 "created", "updated", "due_date", "assigned_at", "scheduled_start", "marked_complete",
                 "property_id", "unit_id", "unit", "unit_address", "tenant_name",
                 "vendor_id", "vendor_name", "estimate_total", "invoice_amount", "tenant_rating"]
    meld_rows = []
    for m in melds:
        row = dict(m)
        for k in ("created", "updated", "due_date", "assigned_at", "scheduled_start", "marked_complete"):
            row[k] = _fmt(row[k])
        for k in ("estimate_total", "invoice_amount", "tenant_rating"):
            row[k] = "" if row[k] is None else row[k]
        meld_rows.append(row)
    write_csv("melds.csv", meld_rows, meld_cols)

    write_csv("vendors.csv", [
        {"id": v[0], "name": v[1], "email": v[2], "phone": v[3],
         "categories": "|".join(v[4]), "is_active": "true"} for v in VENDORS
    ], ["id", "name", "email", "phone", "categories", "is_active"])

    owner_by_property = {pid: o[0] for o in OWNERS for pid in o[4]}
    write_csv("properties.csv", [
        {"id": p[0], "property_name": p[1], "line_1": p[2], "city": p[3],
         "county_province": p[4], "postcode": p[5], "unit_count": p[6],
         "owner_id": owner_by_property[p[0]], "is_active": "true"} for p in PROPERTIES
    ], ["id", "property_name", "line_1", "city", "county_province", "postcode", "unit_count", "owner_id", "is_active"])

    write_csv("owners.csv", [
        {"id": o[0], "first_name": o[1], "last_name": o[2], "email": o[3],
         "properties": "|".join(str(p) for p in o[4]), "is_active": "true"} for o in OWNERS
    ], ["id", "first_name", "last_name", "email", "properties", "is_active"])


if __name__ == "__main__":
    main()
