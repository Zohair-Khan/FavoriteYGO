"""
Run this on YOUR machine -- needs internet access to yugipedia.com.

Fetches every available name/translation field from Yugipedia for every REAL
card actually shown in this site's pickers (Monsters/Spells/Traps only --
pulled directly from card_data.js/card_data_st.js, not YGOPRODeck's raw
list, so Tokens, Skill Cards, and Rush-only cards are never even
considered), keyed by the same numeric card id used everywhere else on the
site.

Covers French, German, Italian, Spanish, Portuguese, Japanese (base name,
kana reading, romanization, translated meaning, plus the same four for a
card's original pre-rename name and its alternate name, where applicable),
Korean (name, romanization, translated meaning), and Chinese, both
Traditional and Simplified (name, pinyin, translated meaning).

Only fetches once per BASE card (using baseId), never per-artwork -- alt art
variants share their base card's translation automatically at display time.

LOOKUP STRATEGY, two passes:
  1. By PASSCODE (e.g. "89631139", zero-padded to 8 digits, following
     Yugipedia's redirect page for that passcode).
  2. For anything pass 1 misses, by CARD NAME directly as a fallback. This
     catches two real cases: cards where YGOPRODeck's "id" doesn't quite
     match Konami's true passcode (e.g. Barrel Dragon: YGOPRODeck says
     81480461, true passcode is 81480460), and cards with no standard
     passcode at all (the Egyptian God cards -- Obelisk, Slifer, Ra, etc.).

ETIQUETTE (per https://yugipedia.com/wiki/Yugipedia:API):
  - Descriptive User-Agent with contact info (set below -- EDIT THIS)
  - No more than 1 request per second (enforced explicitly)
  - Multiple pages bundled per request via "|" where possible
  - Cache results instead of re-fetching -- this script's OUTPUT FILE is
    that cache; don't re-run against the full database more than roughly
    once a month

Requirements: pip install requests mwparserfromhell
"""

import re
import json
import time
import requests
import mwparserfromhell

YUGIPEDIA_API = "https://yugipedia.com/api.php"

# EDIT THIS -- Yugipedia's etiquette policy requires a descriptive
# User-Agent with contact info, or requests may be blocked without warning.
USER_AGENT = "FavoriteYGO-i18n-script/1.0 (https://zohair-khan.github.io/FavoriteYGO/; contact: @_Bawsch on X)"

OUTPUT_JS = "card_names_i18n.js"
STILL_MISSING_FILE = "still_missing.txt"
BATCH_SIZE = 50  # titles per Yugipedia API request (passcode pass only)
MIN_SECONDS_BETWEEN_REQUESTS = 1.1

_last_request_time = 0.0


def rate_limited_get(url, params):
    global _last_request_time
    elapsed = time.time() - _last_request_time
    if elapsed < MIN_SECONDS_BETWEEN_REQUESTS:
        time.sleep(MIN_SECONDS_BETWEEN_REQUESTS - elapsed)
    resp = requests.get(url, params=params, timeout=30, headers={"User-Agent": USER_AGENT})
    _last_request_time = time.time()
    return resp


def load_base_cards():
    """Pulls the exact set of {baseId: baseName} pairs actually used in the
    pickers, straight from the site's own data files -- guarantees we only
    ever fetch translations for cards that can genuinely be voted on."""
    base_cards = {}
    for filename, varname in [("card_data.js", "CARD_DATA"), ("card_data_st.js", "CARD_DATA_ST")]:
        with open(filename, encoding="utf-8") as f:
            content = f.read()
        match = re.search(rf"{varname}\s*=\s*(\{{.*\}})\s*;?\s*$", content, re.DOTALL)
        data = json.loads(match.group(1))
        for category_list in data.values():
            for card in category_list:
                if "baseId" in card:
                    base_cards[str(card["baseId"])] = card["baseName"]
    return base_cards


def fetch_yugipedia_batch(passcodes):
    """One API call for up to BATCH_SIZE passcodes at once, following
    redirects to the real card page. Returns the raw 'query' response dict
    (or None on failure)."""
    params = {
        "action": "query",
        "prop": "revisions",
        "rvprop": "content",
        "format": "json",
        "redirects": 1,
        "titles": "|".join(passcodes),
    }
    try:
        resp = rate_limited_get(YUGIPEDIA_API, params)
        resp.raise_for_status()
        return resp.json().get("query", {})
    except requests.RequestException as e:
        print(f"  batch request failed: {e}")
        return None


def fetch_yugipedia_single_by_name(name):
    """Fallback: look up a single card directly by its name instead of its
    passcode. Used only for cards the passcode pass missed."""
    params = {
        "action": "query",
        "prop": "revisions",
        "rvprop": "content",
        "format": "json",
        "redirects": 1,
        "titles": name,
    }
    try:
        resp = rate_limited_get(YUGIPEDIA_API, params)
        resp.raise_for_status()
        pages = resp.json().get("query", {}).get("pages", {})
        for page in pages.values():
            if "missing" in page:
                return None
            try:
                return page["revisions"][0]["*"]
            except (KeyError, IndexError):
                return None
    except requests.RequestException as e:
        print(f"  name lookup failed for '{name}': {e}")
    return None


def extract_ruby_part(value_wikicode, part):
    """part=0 -> base text (e.g. kanji), part=1 -> the reading/furigana
    (e.g. kana). Walks every node in order so multiple Ruby segments mixed
    with plain text (e.g. {{Ruby|焔|えん}}{{Ruby|聖剣|せいけん}}－アルマス)
    reconstruct correctly rather than only grabbing the first one. Plain
    text nodes are kept as-is in both variants, since they don't have a
    separate reading to extract."""
    parts = []
    for node in value_wikicode.nodes:
        if isinstance(node, mwparserfromhell.nodes.Template) and node.name.matches("Ruby") and len(node.params) > part:
            parts.append(str(node.params[part].value))
        elif isinstance(node, mwparserfromhell.nodes.Template) and node.name.matches("Ruby"):
            parts.append(str(node.params[0].value))  # no reading available, fall back to base
        else:
            parts.append(str(node))
    return "".join(parts).strip()


# Plain text fields -- (output_key, template_param)
FIELD_MAP = [
    ("fr_name", "fr_name"),
    ("de_name", "de_name"),
    ("it_name", "it_name"),
    ("es_name", "es_name"),
    ("pt_name", "pt_name"),

    ("ja_romaji", "romaji_name"),
    ("ja_translated", "translated_name"),
    ("ja_base", "base_romaji_name"),          # romanization of the ORIGINAL name, for cards later renamed
    ("ja_base_translated", "base_translated_name"),
    ("ja_alt_romaji", "ja_alt_romaji"),
    ("ja_alt_translated", "ja_alt_translated"),

    ("ko_name", "ko_name"),
    ("ko_romaji", "ko_rr_name"),
    ("ko_translated", "ko_translated_name"),

    ("sc_name", "sc_name"),                   # Simplified Chinese
    ("sc_pinyin", "sc_pinyin"),
    ("sc_translated", "sc_translated_name"),

    ("tc_name", "tc_name"),                   # Traditional Chinese
    ("tc_pinyin", "tc_pinyin"),
    ("tc_translated", "tc_translated_name"),

    ("alt_name", "alt_name"),                 # rare generic English alt name
]

# Ruby-wrapped fields -- (base_output_key, kana_output_key, template_param).
# Both ja_name and ja_alt_name can pair kanji with a furigana reading via
# {{Ruby|base|reading}}, same as the Japanese-name handling built earlier.
RUBY_FIELD_MAP = [
    ("ja_name", "ja_kana", "ja_name"),
    ("ja_alt_name", "ja_alt_kana", "ja_alt_name"),
]


def extract_names_from_wikitext(wikitext):
    """Parses the CardTable2 template out of a page's wikitext and pulls
    every available name/translation field, across every language the
    template supports. Returns None if no CardTable2 is found."""
    parsed = mwparserfromhell.parse(wikitext)
    for template in parsed.filter_templates():
        if template.name.matches("CardTable2"):
            result = {}

            for out_key, param in FIELD_MAP:
                if template.has(param):
                    value = str(template.get(param).value).strip()
                    result[out_key] = value or None
                else:
                    result[out_key] = None

            for base_key, kana_key, param in RUBY_FIELD_MAP:
                if template.has(param):
                    value = template.get(param).value
                    result[base_key] = extract_ruby_part(value, 0) or None
                    result[kana_key] = extract_ruby_part(value, 1) or None
                else:
                    result[base_key] = None
                    result[kana_key] = None

            return result
    return None


def main():
    print("Loading base card list from card_data.js/card_data_st.js...")
    base_cards = load_base_cards()
    print(f"Got {len(base_cards)} unique base cards actually shown in the pickers.")

    result = {}
    needs_name_fallback = []  # [(id, name), ...]

    ids = list(base_cards.keys())
    for i in range(0, len(ids), BATCH_SIZE):
        batch_ids = ids[i:i + BATCH_SIZE]
        passcodes = [pid.zfill(8) for pid in batch_ids]
        padded_to_id = {pid.zfill(8): pid for pid in batch_ids}

        print(f"Pass 1 (passcode): batch {i+1}-{i+len(batch_ids)} of {len(ids)}...")
        query = fetch_yugipedia_batch(passcodes)
        if query is None:
            needs_name_fallback.extend(batch_ids)
            continue

        redirect_map = {r["from"]: r["to"] for r in query.get("redirects", [])}
        title_to_passcode = {to: frm for frm, to in redirect_map.items()}

        pages = query.get("pages", {})
        seen = set()
        for page in pages.values():
            title = page.get("title")
            passcode = title_to_passcode.get(title, title)
            original_id = padded_to_id.get(passcode)
            if original_id is None:
                continue
            seen.add(original_id)

            if "missing" in page:
                needs_name_fallback.append(original_id)
                continue
            try:
                wikitext = page["revisions"][0]["*"]
            except (KeyError, IndexError):
                needs_name_fallback.append(original_id)
                continue

            names = extract_names_from_wikitext(wikitext)
            if names is None:
                needs_name_fallback.append(original_id)
                continue

            result[original_id] = names

        for original_id in batch_ids:
            if original_id not in seen:
                needs_name_fallback.append(original_id)

    print(f"\nPass 1 done: {len(result)} matched by passcode, "
          f"{len(needs_name_fallback)} need the name-based fallback.")

    # --- Pass 2: name-based fallback for anything pass 1 missed ---
    still_missing = []
    for i, card_id in enumerate(needs_name_fallback):
        name = base_cards[card_id]
        print(f"Pass 2 (name): {i+1}/{len(needs_name_fallback)} -- {name}")
        wikitext = fetch_yugipedia_single_by_name(name)
        if wikitext is None:
            still_missing.append((card_id, name))
            continue
        names = extract_names_from_wikitext(wikitext)
        if names is None:
            still_missing.append((card_id, name))
            continue
        result[card_id] = names

    print(f"\nGot translations for {len(result)} of {len(base_cards)} base cards.")
    print(f"{len(still_missing)} still unresolved after both passes.")

    if still_missing:
        with open(STILL_MISSING_FILE, "w", encoding="utf-8") as f:
            for card_id, name in still_missing:
                f.write(f"{card_id}\t{name}\n")
        print(f"Wrote {STILL_MISSING_FILE} ({len(still_missing)} entries) for manual review.")

    with open(OUTPUT_JS, "w", encoding="utf-8") as f:
        f.write("// Auto-generated by fetch_translations.py -- do not edit by hand.\n")
        f.write("window.CARD_NAMES_I18N = ")
        json.dump(result, f, ensure_ascii=False, indent=2)
        f.write(";\n")

    print(f"\nWrote {OUTPUT_JS}.")


if __name__ == "__main__":
    main()