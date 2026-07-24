"""
Run this on YOUR machine (not in a sandbox) -- it needs internet access to
db.ygoprodeck.com.

What it does, in one pass:
1. Downloads the full YGOPRODeck card database (one JSON request, ~15k cards).
2. Splits cards into Monsters vs. Spells/Traps.
3. Sorts Monsters into the 15 Monster-picker categories.
4. Sorts Spells/Traps into the 15 Spell/Trap-picker categories.
5. Downloads the small (268x391) image for every unique card referenced by
   EITHER picker into images/ -- one combined dedup pass, so nothing is
   ever downloaded twice.
6. Writes card_data.js (for the Monster picker) and card_data_st.js (for the
   Spell/Trap picker).

Requirements: pip install requests
"""

import json
import os
import sys
import time
import requests

API_URL = "https://db.ygoprodeck.com/api/v7/cardinfo.php"
IMG_DIR = "images"
OUTPUT_JS_MONSTERS = "card_data.js"
OUTPUT_JS_SPELLS_TRAPS = "card_data_st.js"

# Pass a number as the first argument to only process that many cards of
# EACH kind (monsters, spells/traps) -- e.g.:   python fetch_and_build.py 100
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


def make_entries(card):
    """card_images holds one entry per artwork (default art is always index 0;
    anything after that is alternate art). Each has its own "id" -- that's
    what the image filename/URL is built from, NOT the card's main "id"."""
    images = card.get("card_images", [{"id": card["id"]}])
    if not INCLUDE_ALT_ART:
        images = images[:1]
    entries = []
    for idx, img in enumerate(images):
        name = card["name"]
        if len(images) > 1 and idx > 0:
            name = f"{name} (Alt Art {idx})"
        entries.append({"name": name, "id": img["id"]})
    return entries


# ============================================================
# MONSTERS
# ============================================================
monsters = [c for c in all_cards if "Monster" in c.get("type", "")]
print(f"{len(monsters)} are monsters.")
if LIMIT:
    monsters = monsters[:LIMIT]
    print(f"LIMIT set: only processing the first {len(monsters)} monsters.")

monster_categories = {
    "LINK": [], "PENDULUM": [], "XYZ": [],
    "SYNCHRO": [], "FUSION": [], "RITUAL": [],
    "NORMAL": [], "GEMINI": [], "EFFECT": [],
    "TOON": [], "SPIRIT": [], "UNION": [],
    "FLIP": [], "TUNER": [],
}

for card in monsters:
    ctype = card["type"]                # e.g. "Effect Monster", "Tuner Monster"
    frame = card.get("frameType", "")   # e.g. "normal", "effect", "xyz_pendulum"
    entries = make_entries(card)

    # --- The 8 main frame-based categories ---
    # IMPORTANT: these use "frameType" (the actual card frame/border color),
    # NOT the "type" text field. YGOPRODeck's "type" field collapses down to
    # a single label -- e.g. a Normal Tuner monster's type is just
    # "Tuner Monster", with no mention of "Normal" at all. frameType stays
    # reliable because Konami always renders the same frame color for a
    # given main category regardless of sub-tags like Tuner/Gemini/Spirit/etc.
    if "pendulum" in frame:
        monster_categories["PENDULUM"].extend(entries)

    base_frame = frame.replace("_pendulum", "")
    if base_frame == "normal":
        monster_categories["NORMAL"].extend(entries)
    elif base_frame == "effect":
        monster_categories["EFFECT"].extend(entries)
    elif base_frame == "ritual":
        monster_categories["RITUAL"].extend(entries)
    elif base_frame == "fusion":
        monster_categories["FUSION"].extend(entries)
    elif base_frame == "synchro":
        monster_categories["SYNCHRO"].extend(entries)
    elif base_frame == "xyz":
        monster_categories["XYZ"].extend(entries)
    elif base_frame == "link":
        monster_categories["LINK"].extend(entries)

    # --- Additive sub-tags ---
    # These aren't frame types -- they're extra abilities/labels layered on
    # top of one of the 8 categories above, so a card can (and often does)
    # land in one of the categories above *and* one or more of these.
    if "Gemini" in ctype:
        monster_categories["GEMINI"].extend(entries)
    if "Toon" in ctype:
        monster_categories["TOON"].extend(entries)
    if "Spirit" in ctype:
        monster_categories["SPIRIT"].extend(entries)
    if "Union" in ctype:
        monster_categories["UNION"].extend(entries)
    if "Tuner" in ctype:
        monster_categories["TUNER"].extend(entries)
    if "Flip" in ctype:
        monster_categories["FLIP"].extend(entries)

for k, v in monster_categories.items():
    print(f"{k}: {len(v)} cards")


# ============================================================
# SPELLS / TRAPS
# ============================================================
spells_traps = [c for c in all_cards if c.get("type") in ("Spell Card", "Trap Card")]
print(f"\n{len(spells_traps)} are Spells/Traps.")
if LIMIT:
    spells_traps = spells_traps[:LIMIT]
    print(f"LIMIT set: only processing the first {len(spells_traps)} Spells/Traps.")

st_categories = {
    "SPELL_NORMAL": [], "SPELL_CONTINUOUS": [], "EQUIP": [],
    "QUICKPLAY": [], "FIELD": [], "RITUAL_SPELL": [],
    "TRAP_NORMAL": [], "TRAP_CONTINUOUS": [], "COUNTER": [],
    "BANNED": [],
    "FORBIDDEN": [], "POT": [], "SOLEMN": [], "DOMINUS": [],
}

for card in spells_traps:
    ctype = card["type"]          # "Spell Card" or "Trap Card"
    race = card.get("race", "")   # the actual subtype: Normal/Continuous/Equip/etc.
    name = card["name"]
    ban_tcg = card.get("banlist_info", {}).get("ban_tcg")
    entries = make_entries(card)

    is_spell = ctype == "Spell Card"
    is_trap = ctype == "Trap Card"

    if is_spell:
        if race == "Normal":
            st_categories["SPELL_NORMAL"].extend(entries)
        elif race == "Continuous":
            st_categories["SPELL_CONTINUOUS"].extend(entries)
        elif race == "Equip":
            st_categories["EQUIP"].extend(entries)
        elif race == "Quick-Play":
            st_categories["QUICKPLAY"].extend(entries)
        elif race == "Field":
            st_categories["FIELD"].extend(entries)
        elif race == "Ritual":
            st_categories["RITUAL_SPELL"].extend(entries)

        if race == "Quick-Play" and "Forbidden" in name:
            st_categories["FORBIDDEN"].extend(entries)
        if "Pot of" in name:
            st_categories["POT"].extend(entries)

    if is_trap:
        if race == "Normal":
            st_categories["TRAP_NORMAL"].extend(entries)
        elif race == "Continuous":
            st_categories["TRAP_CONTINUOUS"].extend(entries)
        elif race == "Counter":
            st_categories["COUNTER"].extend(entries)

        if "Solemn" in name:
            st_categories["SOLEMN"].extend(entries)
        if "Dominus" in name:
            st_categories["DOMINUS"].extend(entries)

    if ban_tcg == "Forbidden":
        st_categories["BANNED"].extend(entries)

print()
for k, v in st_categories.items():
    print(f"{k}: {len(v)} cards")


# ============================================================
# IMAGES -- one combined pass across both pickers' categories
# ============================================================
seen_ids = {str(cid) for cid in (
    entry["id"]
    for cat_list in list(monster_categories.values()) + list(st_categories.values())
    for entry in cat_list
)}

# One directory listing instead of thousands of individual os.path.exists()
# checks -- much cheaper, and lets the download loop below only iterate over
# what's actually missing rather than skip-checking everything each time.
existing_ids = {
    os.path.splitext(fname)[0]
    for fname in os.listdir(IMG_DIR)
    if fname.endswith(".jpg")
}

already_have = seen_ids & existing_ids
to_download = sorted(seen_ids - existing_ids, key=int)

print(f"\n{len(seen_ids)} unique cards needed (monsters + spells/traps combined).")
print(f"{len(already_have)} already downloaded, {len(to_download)} new to fetch.\n")

downloaded = 0
failed = 0
for i, card_id in enumerate(to_download, start=1):
    path = os.path.join(IMG_DIR, f"{card_id}.jpg")
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
    if i % 25 == 0 or i == len(to_download):
        print(f"  {i}/{len(to_download)} downloaded so far "
              f"({downloaded} succeeded, {failed} failed)", flush=True)
    time.sleep(0.05)  # still space requests apart to avoid rate limits

print(f"\nImage pass complete: {downloaded} new images downloaded, "
      f"{len(already_have)} already present, {failed} failed.")


# ============================================================
# WRITE OUTPUT FILES
# ============================================================
with open(OUTPUT_JS_MONSTERS, "w", encoding="utf-8") as f:
    f.write("// Auto-generated by fetch_and_build.py\n")
    f.write("window.CARD_DATA = ")
    json.dump(monster_categories, f)
    f.write(";\n")

with open(OUTPUT_JS_SPELLS_TRAPS, "w", encoding="utf-8") as f:
    f.write("// Auto-generated by fetch_and_build.py\n")
    f.write("window.CARD_DATA_ST = ")
    json.dump(st_categories, f)
    f.write(";\n")

print(f"\nDone. Wrote {OUTPUT_JS_MONSTERS}, {OUTPUT_JS_SPELLS_TRAPS}, and images/ folder.")