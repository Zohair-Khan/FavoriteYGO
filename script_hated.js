// The 15 boxes, matching hated.png's layout. left/top/width/height are
// percentages measured from the template's card-back slots -- SAME
// coordinates as the other two pickers (same template image dimensions).
//
// IMPORTANT: 8 of these use a "HATED_" prefix on their key (HATED_NORMAL,
// etc.) even though the underlying card DATA they show is the exact same
// Normal/Effect/Ritual/etc. categories the Favorite Monster picker uses.
// This is deliberate -- click_events' "category" column is a flat string
// shared across every page on the site, so if this page logged clicks under
// plain "NORMAL"/"EFFECT"/etc., votes for "Most Hated Normal Monster" would
// get mixed in with "Favorite Normal Monster" votes from index.html,
// indistinguishably. The prefix keeps them separate for analytics purposes;
// getStoredList() below still maps back to the original data category.
const CATEGORY_LAYOUT = [
  { key: "HATED_NORMAL",     label: "Normal",          left: 10.208, top: 15.149, width: 13.073, height: 25.434 },
  { key: "HATED_EFFECT",     label: "Effect",          left: 26.823, top: 15.149, width: 13.073, height: 25.434 },
  { key: "HATED_RITUAL",     label: "Ritual",          left: 43.438, top: 15.149, width: 13.073, height: 25.434 },
  { key: "HATED_FUSION",     label: "Fusion",          left: 60.104, top: 15.149, width: 13.073, height: 25.434 },
  { key: "HATED_SYNCHRO",    label: "Synchro",         left: 76.667, top: 15.149, width: 13.073, height: 25.434 },

  { key: "HATED_XYZ",        label: "Xyz",             left: 10.208, top: 43.850, width: 13.073, height: 25.365 },
  { key: "HATED_LINK",       label: "Link",            left: 26.823, top: 43.850, width: 13.073, height: 25.365 },
  { key: "HATED_PENDULUM",   label: "Pendulum",        left: 43.438, top: 43.850, width: 13.073, height: 25.365 },
  { key: "HANDTRAP",         label: "Handtrap",        left: 60.104, top: 43.850, width: 13.073, height: 25.365 },
  { key: "TOWER",            label: "Tower",           left: 76.667, top: 43.850, width: 13.073, height: 25.365 },

  { key: "SPELL",            label: "Spell",           left: 10.208, top: 72.481, width: 13.073, height: 25.434 },
  { key: "TRAP",             label: "Trap",            left: 26.823, top: 72.481, width: 13.073, height: 25.434 },
  { key: "FLOODGATE",        label: "Floodgate",       left: 43.438, top: 72.481, width: 13.073, height: 25.434 },
  { key: "ONE_CARD_STARTER", label: "1-Card Starter",  left: 60.104, top: 72.481, width: 13.073, height: 25.434 },
  { key: "MOST_HATED",       label: "Most Hated",      left: 76.667, top: 72.481, width: 13.073, height: 25.434 },
];

const grid = document.getElementById("grid");
const modal = document.getElementById("modal");
const cardList = document.getElementById("cardList");
const searchBox = document.getElementById("searchBox");
const clearBtn = document.getElementById("clearBtn");

let activeBoxKey = null; // which box we're currently filling

const PICKS_STORAGE_KEY = "ygo_hated_picks";
const SESSION_STORAGE_KEY = "ygo_session_id"; // shared across all pickers/pages on this site

function getSessionId() {
  let id = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_STORAGE_KEY, id);
  }
  return id;
}
const SESSION_ID = getSessionId();

function savePicksToStorage() {
  const data = {};
  grid.querySelectorAll(".box").forEach(box => {
    if (box.dataset.cardId) {
      data[box.dataset.key] = { id: box.dataset.cardId, name: box.dataset.cardName };
    }
  });
  localStorage.setItem(PICKS_STORAGE_KEY, JSON.stringify(data));
}

function restorePicksFromStorage() {
  let data;
  try {
    data = JSON.parse(localStorage.getItem(PICKS_STORAGE_KEY) || "{}");
  } catch (e) {
    data = {};
  }
  Object.entries(data).forEach(([key, card]) => renderBoxImage(key, card));
}

// --- Data lookup across all three source files ---
// Each of the 14 "themed" boxes is stored in whichever file its category
// actually lives in (monster categories in CARD_DATA, spell/trap in
// CARD_DATA_ST, cross-type ones in CARD_DATA_SPECIAL) -- this just checks
// all three so the rest of the code doesn't need to know which.
function dedupeById(...lists) {
  const seen = new Map();
  lists.forEach(list => (list || []).forEach(card => seen.set(String(card.id), card)));
  return Array.from(seen.values());
}

// Maps a box's tracking key (used for click logging/localStorage/DOM
// identity) to the underlying data category it should actually pull cards
// from -- only needed where they differ (the 8 renamed-for-collision keys).
const DATA_KEY_OVERRIDES = {
  HATED_NORMAL: "NORMAL",
  HATED_EFFECT: "EFFECT",
  HATED_RITUAL: "RITUAL",
  HATED_FUSION: "FUSION",
  HATED_SYNCHRO: "SYNCHRO",
  HATED_XYZ: "XYZ",
  HATED_LINK: "LINK",
  HATED_PENDULUM: "PENDULUM",
};

function getStoredList(key) {
  const dataKey = DATA_KEY_OVERRIDES[key] || key;

  // "Spell"/"Trap" aren't stored as their own combined category anywhere --
  // built here from the sub-categories that already exist in card_data_st.js.
  if (dataKey === "SPELL") {
    const st = window.CARD_DATA_ST || {};
    return dedupeById(st.SPELL_NORMAL, st.SPELL_CONTINUOUS, st.EQUIP, st.QUICKPLAY, st.FIELD, st.RITUAL_SPELL);
  }
  if (dataKey === "TRAP") {
    const st = window.CARD_DATA_ST || {};
    return dedupeById(st.TRAP_NORMAL, st.TRAP_CONTINUOUS, st.COUNTER);
  }
  if (window.CARD_DATA && window.CARD_DATA[dataKey]) return window.CARD_DATA[dataKey];
  if (window.CARD_DATA_ST && window.CARD_DATA_ST[dataKey]) return window.CARD_DATA_ST[dataKey];
  if (window.CARD_DATA_SPECIAL && window.CARD_DATA_SPECIAL[dataKey]) return window.CARD_DATA_SPECIAL[dataKey];
  return [];
}

// The full known-card directory, combining all three sources, deduped by id.
// This is what searching opens up to for EVERY box on this page.
function getAllCardsFlat() {
  const seen = new Map();
  [window.CARD_DATA, window.CARD_DATA_ST, window.CARD_DATA_SPECIAL].forEach(dataset => {
    Object.values(dataset || {}).forEach(list => {
      list.forEach(card => seen.set(String(card.id), card));
    });
  });
  return Array.from(seen.values());
}

// "Most Hated" only offers cards you've already placed in the other 14 boxes
// by default (search still opens to everything, same as every other box here)
function getCurrentSelections() {
  const seen = new Map();
  grid.querySelectorAll(".box").forEach(box => {
    if (box.dataset.key === "MOST_HATED") return;
    if (box.dataset.cardId) {
      seen.set(box.dataset.cardId, { id: box.dataset.cardId, name: box.dataset.cardName });
    }
  });
  return Array.from(seen.values());
}

function getListFor(key) {
  if (key === "MOST_HATED") return getCurrentSelections();
  if (key === "ONE_CARD_STARTER") return getAllCardsFlat(); // no restriction at all -- pick from anything
  return getStoredList(key);
}

// --- Build the grid boxes ---
CATEGORY_LAYOUT.forEach(cat => {
  const box = document.createElement("div");
  box.className = "box";
  box.dataset.key = cat.key;
  box.style.left = cat.left + "%";
  box.style.top = cat.top + "%";
  box.style.width = cat.width + "%";
  box.style.height = cat.height + "%";
  box.addEventListener("click", () => openModal(cat.key));
  grid.appendChild(box);
});

restorePicksFromStorage();

// Pure DOM update -- no persistence, no logging. Used both by real selections
// and by restoring saved picks on page load (which shouldn't count as a new click).
function renderBoxImage(key, card) {
  const box = grid.querySelector(`.box[data-key="${key}"]`);
  let img = box.querySelector("img");
  if (!img) {
    img = document.createElement("img");
    box.appendChild(img);
  }
  img.src = `images/${card.id}.jpg`;
  img.alt = card.name;
  box.dataset.cardId = card.id;
  box.dataset.cardName = card.name;
}

// A real selection: click a thumbnail -> render it, save it, log it.
// If the box already had a different card in it, that old pick gets
// auto-cleared (logged as "clear") first, so swapping a choice never
// inflates counts -- only Clear vs. no-selection reflects an actual undo.
function setBoxImage(key, card) {
  const box = grid.querySelector(`.box[data-key="${key}"]`);
  const prevId = box.dataset.cardId;
  const prevName = box.dataset.cardName;

  if (prevId && String(prevId) !== String(card.id)) {
    logClickEvent(key, { id: prevId, name: prevName }, "clear");
  }

  renderBoxImage(key, card);
  savePicksToStorage();
  logClickEvent(key, card, "place");
}

// Remove whatever's currently in a box (used by the Clear button).
function clearBoxImage(key) {
  const box = grid.querySelector(`.box[data-key="${key}"]`);
  if (!box.dataset.cardId) return; // nothing selected, nothing to clear

  const card = { id: box.dataset.cardId, name: box.dataset.cardName };
  const img = box.querySelector("img");
  if (img) img.remove();
  delete box.dataset.cardId;
  delete box.dataset.cardName;

  savePicksToStorage();
  logClickEvent(key, card, "clear");
}

// --- Modal picker ---
function openModal(key) {
  activeBoxKey = key;
  searchBox.value = "";
  renderCardList(getListFor(key));
  updateClearBtnState();
  modal.classList.remove("hidden");
  searchBox.focus();
}

function updateClearBtnState() {
  const box = grid.querySelector(`.box[data-key="${activeBoxKey}"]`);
  clearBtn.disabled = !box.dataset.cardId;
}

clearBtn.addEventListener("click", () => {
  clearBoxImage(activeBoxKey);
  updateClearBtnState();
});

const BATCH_SIZE = 60;
let currentFullList = [];
let renderedCount = 0;

function renderCardList(list) {
  currentFullList = list;
  renderedCount = 0;
  cardList.innerHTML = "";

  if (list.length === 0) {
    cardList.innerHTML = "<p style='padding:12px;'>Nothing to pick from yet — fill in some of the other boxes first.</p>";
    return;
  }

  renderNextBatch();
}

function renderNextBatch() {
  const nextItems = currentFullList.slice(renderedCount, renderedCount + BATCH_SIZE);
  nextItems.forEach(card => {
    const img = document.createElement("img");
    img.src = `images/${card.id}.jpg`;
    img.alt = card.name;
    img.title = card.name;
    img.loading = "lazy";
    img.addEventListener("click", () => {
      setBoxImage(activeBoxKey, card);
      modal.classList.add("hidden");
    });
    cardList.appendChild(img);
  });
  renderedCount += nextItems.length;
}

// Load the next batch automatically once the user scrolls near the bottom --
// keeps the DOM light (never much more than one batch beyond what's visible)
// while still making the entire list reachable by scrolling.
cardList.addEventListener("scroll", () => {
  if (renderedCount >= currentFullList.length) return; // already showing everything
  const nearBottom = cardList.scrollTop + cardList.clientHeight >= cardList.scrollHeight - 300;
  if (nearBottom) renderNextBatch();
});

// Only these categories open up to the FULL card database while searching --
// they're the ones built from best-effort text filters (Floodgate, Handtrap,
// Tower) or are meant to pull from your other picks (Most Hated), so a
// search escape hatch matters in case a filter missed a real card. The other
// 11 categories are reliably classified from structural API fields
// (frameType, banlist status), so they stay restricted even while searching.
const OPEN_SEARCH_KEYS = new Set(["FLOODGATE", "HANDTRAP", "TOWER", "ONE_CARD_STARTER", "MOST_HATED"]);

searchBox.addEventListener("input", () => {
  const term = searchBox.value.toLowerCase();
  const base = (OPEN_SEARCH_KEYS.has(activeBoxKey) && term)
    ? getAllCardsFlat()
    : getListFor(activeBoxKey);
  renderCardList(term ? base.filter(c => c.name.toLowerCase().includes(term)) : base);
});

document.getElementById("closeModal").addEventListener("click", () => {
  modal.classList.add("hidden");
});
modal.addEventListener("click", e => {
  if (e.target === modal) modal.classList.add("hidden");
});

// --- Download as image (drawn from scratch on a canvas, not a screenshot) ---
const OUTPUT_SCALE = 2;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawCover(ctx, img, x, y, w, h) {
  const boxRatio = w / h;
  const imgRatio = img.width / img.height;
  let sx, sy, sw, sh;
  if (imgRatio > boxRatio) {
    sh = img.height;
    sw = sh * boxRatio;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / boxRatio;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

async function buildGridImage() {
  const template = await loadImage("hated.png");
  const canvasW = template.width * OUTPUT_SCALE;
  const canvasH = template.height * OUTPUT_SCALE;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");

  ctx.drawImage(template, 0, 0, canvasW, canvasH);

  const boxes = grid.querySelectorAll(".box");
  const loaded = await Promise.all(
    Array.from(boxes).map(box =>
      box.dataset.cardId ? loadImage(`images/${box.dataset.cardId}.jpg`) : null
    )
  );

  boxes.forEach((box, i) => {
    const img = loaded[i];
    if (!img) return;

    const cat = CATEGORY_LAYOUT[i];
    const x = (cat.left / 100) * canvasW;
    const y = (cat.top / 100) * canvasH;
    const w = (cat.width / 100) * canvasW;
    const h = (cat.height / 100) * canvasH;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    drawCover(ctx, img, x, y, w, h);
    ctx.restore();
  });

  return canvas;
}

document.getElementById("downloadBtn").addEventListener("click", async () => {
  const canvas = await buildGridImage();
  const link = document.createElement("a");
  link.download = "my-yugioh-most-hated.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});

// --- Log every place/clear click to Supabase ---
// Same project as the other pickers.
const SUPABASE_URL = "https://gukihinomsiwmwousjia.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1a2loaW5vbXNpd213b3VzamlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MDQxNjIsImV4cCI6MjEwMDM4MDE2Mn0.9r6K-skI0XJ88MG6xfrmVpc0yGK4-biPVvRXF-ITSRc";

const supabaseClient = (SUPABASE_URL.startsWith("http"))
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

async function logClickEvent(category, card, action) {
  if (!supabaseClient) return;
  try {
    const { error } = await supabaseClient.from("click_events").insert({
      session_id: SESSION_ID,
      category,
      card_id: String(card.id),
      card_name: card.name,
      action,
    });
    if (error) {
      console.error("click_events insert failed:", error.message);
    } else {
      console.log(`click_events logged: ${action} - ${category} - ${card.name}`);
    }
  } catch (e) {
    console.error("click_events insert failed:", e);
  }
}