"""
pm_reader.py — a tiny, READ-ONLY way to get Property Meld data into Python.

Two modes, same output either way:

  csv  (default)  Reads the sample export in mx-summit/data/*.csv.
                  This is what Session 1 uses. No credentials, no internet.

  api             Reads your LIVE Property Meld account through the v2 API.
                  This is the Session 2 upgrade. Needs three values in a .env
                  file next to this script (copy .env.example to .env).

Pick the mode with an environment variable:

    PM_MODE=api python3 mx-summit/my_briefing.py

Every function returns a plain list of dictionaries with the SAME keys in both
modes, so anything you build against the CSV keeps working when you switch to
the live API. Column meanings are documented in data/README.md.

This file never sends anything to Property Meld. There is no POST, PUT, PATCH,
or DELETE anywhere in it, on purpose. It only reads.
"""

import csv
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA_DIR = HERE / "data"
OUT_DIR = HERE / "out"
API_BASE = "https://api.propertymeld.com/api/v2"

# Melds in these statuses are considered "still open" throughout the track.
OPEN_STATUSES = {"PENDING_ASSIGNMENT", "OPEN", "PENDING_COMPLETION"}


# ── Small helpers ─────────────────────────────────────────────────────────

def _load_dotenv():
    """Read KEY=VALUE lines from mx-summit/.env into os.environ (if the file exists).
    Real environment variables win over the file."""
    env_path = HERE / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def mode():
    """'csv' unless PM_MODE=api is set."""
    _load_dotenv()
    return os.environ.get("PM_MODE", "csv").strip().lower()


def parse_dt(value):
    """Turn a timestamp string into a datetime. Blank -> None."""
    if not value:
        return None
    value = value.replace("Z", "")
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(value[:26], fmt)
        except ValueError:
            continue
    return None


def to_float(value):
    """'123.45' -> 123.45, blank/None -> None."""
    try:
        return float(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def as_of():
    """The date every report treats as 'today'.

    csv mode: the newest 'updated' timestamp in the sample, so the demo data is
              always fresh no matter when you run it.
    api mode: right now.
    """
    if mode() == "api":
        return datetime.now()
    newest = max((parse_dt(m["updated"]) for m in load_melds()), default=None)
    return newest or datetime.now()


# ── CSV mode ──────────────────────────────────────────────────────────────

def _read_csv(name):
    with (DATA_DIR / name).open(newline="") as f:
        return list(csv.DictReader(f))


# ── API mode ──────────────────────────────────────────────────────────────

def _token():
    """Swap the client id + secret for a short-lived bearer token (OAuth2
    client-credentials). The exact token URL is in your Property Meld API
    docs; PM_TOKEN_URL in .env lets you set it without editing code."""
    client_id = os.environ.get("PM_CLIENT_ID")
    secret = os.environ.get("PM_CLIENT_SECRET")
    if not client_id or not secret:
        raise SystemExit("PM_MODE=api needs PM_CLIENT_ID and PM_CLIENT_SECRET in mx-summit/.env")
    token_url = os.environ.get("PM_TOKEN_URL", f"{API_BASE}/oauth/token/")
    body = urllib.parse.urlencode({
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": secret,
    }).encode()
    req = urllib.request.Request(token_url, data=body, method="POST")  # the ONLY POST: login, not data
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)["access_token"]


def _get_all(path, params=None):
    """GET one list endpoint and follow the 'next' links until there are none.
    Property Meld pages look like {count, next, previous, results}."""
    token = _token()
    tenant = os.environ.get("PM_TENANT_ID")
    if not tenant:
        raise SystemExit("PM_MODE=api needs PM_TENANT_ID in mx-summit/.env")
    url = f"{API_BASE}/{path.strip('/')}/"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    rows = []
    while url:
        req = urllib.request.Request(url, method="GET")
        req.add_header("Authorization", f"Bearer {token}")
        req.add_header("X-Multitenant-Id", tenant)
        with urllib.request.urlopen(req, timeout=60) as resp:
            page = json.load(resp)
        rows.extend(page.get("results", []))
        url = page.get("next")
    return rows


def _person_name(person):
    """Name from a person payload. Property Meld returns first_name/last_name at
    the top level; a nested `user` is used as a fallback so this keeps working
    either way instead of quietly returning an empty string."""
    p = person or {}
    user = p.get("user") or {}
    first = p.get("first_name") or user.get("first_name", "")
    last = p.get("last_name") or user.get("last_name", "")
    return f"{first} {last}".strip()


def _flatten_meld(m):
    """Reshape one live API meld into the same flat keys the CSV uses."""
    # Property Meld names these `accepted` / `canceled` / `rejected` — NOT
    # `accepted_at`. Filtering on the _at spelling matches nothing, so every
    # meld comes back with no vendor at all. Verified against the published
    # OpenAPI (docs.propertymeld.com/reference/meld_list).
    accepted = [
        r for r in (m.get("vendor_assignment_requests") or [])
        if r.get("accepted") and not r.get("canceled") and not r.get("rejected")
    ]
    vendor = accepted[0] if accepted else {}
    # `vendor` on an assignment request is a nested object ({id, name}), not a
    # bare id, and there is no `vendor_name` key on the request itself.
    vendor_obj = vendor.get("vendor") or {}
    appt = (m.get("vendorappointment") or [{}])[0] or {}
    return {
        "id": m.get("id"),
        "brief_description": m.get("brief_description", ""),
        "description": m.get("description", ""),
        "status": m.get("status", ""),
        "priority": m.get("priority", ""),
        "work_category": m.get("work_category", ""),
        "created": m.get("created", ""),
        "updated": m.get("updated", ""),
        "due_date": m.get("due_date") or "",
        "assigned_at": vendor.get("accepted") or "",
        "scheduled_start": appt.get("scheduled_start") or "",
        "marked_complete": m.get("marked_complete") or "",
        "property_id": m.get("prop") or "",
        "unit_id": m.get("unit") or "",
        "unit": "",  # unit name lives on the /units/ endpoint; address below is enough for reports
        "unit_address": ((m.get("unit_address") or m.get("prop_address") or {}).get("full_address", "")),
        "tenant_name": "",  # not on the meld payload; left blank in api mode
        "vendor_id": vendor_obj.get("id") or "",
        "vendor_name": vendor_obj.get("name") or "",
        "estimate_total": "",   # estimates and invoices are separate endpoints —
        "invoice_amount": "",   # left blank in api mode; see session2/README.md
        "tenant_rating": m.get("tenant_rating") if m.get("tenant_rating") is not None else "",
    }


# ── The four public functions ─────────────────────────────────────────────

def load_melds():
    """Every meld (work order) as a list of dicts. Keys match melds.csv."""
    if mode() == "api":
        return [_flatten_meld(m) for m in _get_all("meld", {"limit": 100})]
    return _read_csv("melds.csv")


def load_vendors():
    if mode() == "api":
        return [{"id": v.get("id"), "name": v.get("name", ""), "email": v.get("email") or "",
                 "phone": v.get("phone") or "",
                 # /vendor/ does not return a `categories` field — it is not in
                 # the API response, so this is always blank in api mode. The
                 # sample CSV has it because the CSV is a flattened export.
                 "categories": "",
                 "is_active": str(v.get("is_active", True)).lower()}
                for v in _get_all("vendor", {"limit": 100})]
    return _read_csv("vendors.csv")


def load_properties():
    if mode() == "api":
        return [{"id": p.get("id"), "property_name": p.get("property_name", ""),
                 "line_1": p.get("line_1", ""), "city": p.get("city") or "",
                 "county_province": p.get("county_province") or "", "postcode": p.get("postcode") or "",
                 "unit_count": len(p.get("units") or []),
                 "owner_id": (p.get("owners") or [""])[0],
                 "is_active": str(p.get("is_active", True)).lower()}
                for p in _get_all("property", {"limit": 100})]
    return _read_csv("properties.csv")


def load_owners():
    if mode() == "api":
        rows = []
        for o in _get_all("owner", {"limit": 100}):
            # /owner/ returns first_name / last_name / email at the TOP level.
            # Older code here read them from a nested `user` object; falling
            # back to that keeps this working either way rather than silently
            # producing blank owner names.
            user = o.get("user") or {}
            rows.append({"id": o.get("id"),
                         "first_name": o.get("first_name") or user.get("first_name", ""),
                         "last_name": o.get("last_name") or user.get("last_name", ""),
                         "email": o.get("email") or user.get("email", ""),
                         "properties": "|".join(str(p) for p in (o.get("properties") or [])),
                         "is_active": str(o.get("is_active", True)).lower()})
        return rows
    return _read_csv("owners.csv")


# ── Prove it works: python3 mx-summit/pm_reader.py ────────────────────────

if __name__ == "__main__":
    print(f"mode: {mode()}")
    melds = load_melds()
    print(f"melds:      {len(melds)}  (open: {sum(1 for m in melds if m['status'] in OPEN_STATUSES)})")
    print(f"vendors:    {len(load_vendors())}")
    print(f"properties: {len(load_properties())}")
    print(f"owners:     {len(load_owners())}")
    print(f"as of:      {as_of():%Y-%m-%d}")
