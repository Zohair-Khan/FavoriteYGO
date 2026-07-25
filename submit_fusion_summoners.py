"""
One-off script: finds every card whose text contains "Fusion Summon 1" and
bulk-submits them to the "FUSIONSUMMONERS" crowdsource category in Supabase,
automatically skipping any that are already there (no error, no duplicate).

Run this on YOUR machine (needs internet access): pip install requests
"""

import uuid
import requests

YGOPRODECK_API = "https://db.ygoprodeck.com/api/v7/cardinfo.php"

# Same project/key already used by the site's front-end.
SUPABASE_URL = "https://gukihinomsiwmwousjia.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1a2loaW5vbXNpd213b3VzamlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MDQxNjIsImV4cCI6MjEwMDM4MDE2Mn0.9r6K-skI0XJ88MG6xfrmVpc0yGK4-biPVvRXF-ITSRc"

CATEGORY = "FUSIONSUMMONERS"
SEARCH_PHRASE = "fusion summon 1"  # matches the official templated card-text phrasing

print("Fetching full card database...")
resp = requests.get(YGOPRODECK_API, timeout=60)
resp.raise_for_status()
all_cards = resp.json()["data"]
print(f"Got {len(all_cards)} total cards.")

# No type restriction beyond Monster/Spell/Trap -- this excludes Skill Cards
# (used in Rush/Speed Duel formats) and any other non-standard card types,
# even if their text happens to contain the search phrase too.
matches = [
    c for c in all_cards
    if SEARCH_PHRASE in c.get("desc", "").lower()
    and ("Monster" in c.get("type", "") or c.get("type") in ("Spell Card", "Trap Card"))
]
print(f"\nFound {len(matches)} cards mentioning \"{SEARCH_PHRASE}\":")
for card in matches:
    print(f"  - {card['name']}")

if not matches:
    print("Nothing to submit.")
    raise SystemExit

headers = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    "Content-Type": "application/json",
}

# Check what's already submitted via the safe read-only view first, and
# filter those out ourselves -- rather than relying on ON CONFLICT DO
# NOTHING, which needs to read existing rows to detect conflicts, and the
# anon role only has read access through this view, not the raw table.
print("\nChecking which of these are already submitted...")
existing_resp = requests.get(
    f"{SUPABASE_URL}/rest/v1/category_submissions_view",
    headers=headers,
    params={"category": f"eq.{CATEGORY}", "select": "card_id"},
    timeout=30,
)
existing_resp.raise_for_status()
existing_ids = {row["card_id"] for row in existing_resp.json()}
print(f"{len(existing_ids)} already submitted.")

new_matches = [c for c in matches if str(c["id"]) not in existing_ids]
print(f"{len(new_matches)} are new and will be submitted.")

if not new_matches:
    print("Nothing new to submit -- everything matching is already there.")
    raise SystemExit

# One placeholder "submitter" id for this whole bulk import, just to satisfy
# the NOT NULL constraint -- not a real visitor session.
session_id = str(uuid.uuid4())

rows = [
    {
        "category": CATEGORY,
        "card_id": str(card["id"]),
        "card_name": card["name"],
        "session_id": session_id,
    }
    for card in new_matches
]

headers["Prefer"] = "return=minimal"

BATCH_SIZE = 100
print(f"\nSubmitting {len(rows)} new cards to '{CATEGORY}'...")
for i in range(0, len(rows), BATCH_SIZE):
    batch = rows[i:i + BATCH_SIZE]
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/category_submissions",
        headers=headers,
        json=batch,
        timeout=30,
    )
    if r.status_code >= 300:
        print(f"  batch {i+1}-{i+len(batch)} FAILED: {r.status_code} {r.text}")
    else:
        print(f"  batch {i+1}-{i+len(batch)} of {len(rows)} submitted")

print("\nDone. Refresh the submission page to see them in 'Fusion Summoners'.")