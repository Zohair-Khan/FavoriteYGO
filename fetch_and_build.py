"""
Run this on YOUR machine (not in a sandbox) — it needs internet access to
db.ygoprodeck.com.

What it does:
1. Downloads the full YGOPRODeck card database (one JSON request, ~15k cards).
2. Filters down to monster cards only.
3. Sorts every monster into one or more of your 15 grid categories.
4. Downloads the small (268x391) image for every unique card into images/.
5. Writes card_data.js, which your front-end (index.html/script.js) reads.

Requirements: pip install requests
"""

import json
import os
import sys
import time
import requests

API_URL = "https://db.ygoprodeck.com/api/v7/cardinfo.php"
IMG_DIR = "images"
OUTPUT_JS = "card_data.js"

# Pass a number as the first argument to only process that many monster cards,
# e.g.:   python fetch_and_build.py 100
# Leave it off to run the full ~15k card set.
LIMIT = int(sys.argv[1]) if len(sys.argv) > 1 else None

# Set to False if you only want one image per card (the default artwork).
INCLUDE_ALT_ART = True

os.makedirs(IMG_DIR, exist_ok=True)

print("Fetching full card database...")
resp = requests.get(API_URL, timeout=60)
resp.raise_for_status()
all_cards = resp.json()["data"]
print(f"Got {len(all_cards)} total cards.")

# Only keep actual monster cards (drop Spell/Trap/Skill/Token)
monsters = [c for c in all_cards if "Monster" in c.get("type", "")]
print(f"{len(monsters)} are monsters.")

if LIMIT:
    monsters = monsters[:LIMIT]
    print(f"LIMIT set: only processing the first {len(monsters)} monsters "
          f"(for testing).")

categories = {
    "LINK": [], "PENDULUM": [], "XYZ": [],
    "SYNCHRO": [], "FUSION": [], "RITUAL": [],
    "NORMAL": [], "GEMINI": [], "EFFECT": [],
    "TOON": [], "SPIRIT": [], "UNION": [],
    "FLIP": [], "TUNER": [],
}

for card in monsters:
    ctype = card["type"]           # e.g. "Effect Monster", "Tuner Monster" (sub-tags only)
    frame = card.get("frameType", "")  # e.g. "normal", "effect", "xyz_pendulum" -- the actual card frame/border
    desc = card.get("desc", "")

    # card_images holds one entry per artwork (default art is always index 0;
    # anything after that is alternate art). Each has its own "id" -- that's
    # what the image filename/URL is built from, NOT the card's main "id".
    images = card.get("card_images", [{"id": card["id"]}])
    if not INCLUDE_ALT_ART:
        images = images[:1]

    entries = []
    for idx, img in enumerate(images):
        name = card["name"]
        if len(images) > 1 and idx > 0:
            name = f"{name} (Alt Art {idx})"
        entries.append({"name": name, "id": img["id"]})

    # --- The 8 main frame-based categories ---
    # IMPORTANT: these use "frameType" (the actual card frame/border color),
    # NOT the "type" text field. YGOPRODeck's "type" field collapses down to
    # a single label -- e.g. a Normal Tuner monster's type is just
    # "Tuner Monster", with no mention of "Normal" at all. frameType stays
    # reliable because Konami always renders the same frame color for a
    # given main category regardless of sub-tags like Tuner/Gemini/Spirit/etc.
    if "pendulum" in frame:
        categories["PENDULUM"].extend(entries)

    base_frame = frame.replace("_pendulum", "")
    if base_frame == "normal":
        categories["NORMAL"].extend(entries)
    elif base_frame == "effect":
        categories["EFFECT"].extend(entries)
    elif base_frame == "ritual":
        categories["RITUAL"].extend(entries)
    elif base_frame == "fusion":
        categories["FUSION"].extend(entries)
    elif base_frame == "synchro":
        categories["SYNCHRO"].extend(entries)
    elif base_frame == "xyz":
        categories["XYZ"].extend(entries)
    elif base_frame == "link":
        categories["LINK"].extend(entries)

    # --- Additive sub-tags ---
    # These aren't frame types -- they're extra abilities/labels layered on
    # top of one of the 8 categories above, so a card can (and often does)
    # land in one of the categories above *and* one or more of these.
    if "Gemini" in ctype:
        categories["GEMINI"].extend(entries)
    if "Toon" in ctype:
        categories["TOON"].extend(entries)
    if "Spirit" in ctype:
        categories["SPIRIT"].extend(entries)
    if "Union" in ctype:
        categories["UNION"].extend(entries)
    if "Tuner" in ctype:
        categories["TUNER"].extend(entries)

    # Flip isn't in "type" or "frameType" at all -- it's only mentioned in
    # the card text, so this is a best-effort text search.
    # NOTE: you'll likely want to manually review/clean this list, since
    # text matching can both over- and under-catch cards.
    if desc.startswith("FLIP:") or "This card is flipped" in desc:
        categories["FLIP"].extend(entries)

for k, v in categories.items():
    print(f"{k}: {len(v)} cards")

# Download images (dedupe by id so we don't fetch the same card twice
# even if it appears in multiple categories)
seen_ids = set()
for cat_list in categories.values():
    for entry in cat_list:
        seen_ids.add(entry["id"])

print(f"\nChecking {len(seen_ids)} unique cards against local images/ folder...")
already_have = sum(1 for cid in seen_ids if os.path.exists(os.path.join(IMG_DIR, f"{cid}.jpg")))
to_download = len(seen_ids) - already_have
print(f"{already_have} already downloaded, {to_download} new to fetch.\n")

downloaded = 0
failed = 0
for i, card_id in enumerate(sorted(seen_ids), start=1):
    path = os.path.join(IMG_DIR, f"{card_id}.jpg")
    if os.path.exists(path):
        continue  # already have it -- this is what makes reruns incremental
    url = f"https://images.ygoprodeck.com/images/cards_small/{card_id}.jpg"
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        with open(path, "wb") as f:
            f.write(r.content)
        downloaded += 1
    except Exception as e:
        print(f"  failed on {card_id}: {e}", flush=True)
        failed += 1
    if i % 25 == 0 or i == len(seen_ids):
        print(f"  {i}/{len(seen_ids)} checked "
              f"({downloaded} downloaded, {failed} failed)", flush=True)
    time.sleep(0.05)  # be polite to their server

print(f"\nImage pass complete: {downloaded} new images downloaded, "
      f"{already_have} already present, {failed} failed.")

# Write the JS file the front-end will load
with open(OUTPUT_JS, "w", encoding="utf-8") as f:
    f.write("// Auto-generated by fetch_and_build.py\n")
    f.write("window.CARD_DATA = ")
    json.dump(categories, f)
    f.write(";\n")

print(f"\nDone. Wrote {OUTPUT_JS} and images/ folder.")