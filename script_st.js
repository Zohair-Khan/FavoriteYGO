// The 15 boxes, matching templateST.png's layout. left/top/width/height are
// percentages measured from the template's card-back slots -- SAME
// coordinates as the Monster picker's template.png (same image dimensions,
// same slot positions), just relabeled/reordered to match this template.
const CATEGORY_LAYOUT = [
  { key: "SPELL_NORMAL",     label: "Normal",       left: 10.208, top: 15.149, width: 13.073, height: 25.434 },
  { key: "SPELL_CONTINUOUS", label: "Continuous",   left: 26.823, top: 15.149, width: 13.073, height: 25.434 },
  { key: "EQUIP",            label: "Equip",        left: 43.438, top: 15.149, width: 13.073, height: 25.434 },
  { key: "QUICKPLAY",        label: "Quick-Play",   left: 60.104, top: 15.149, width: 13.073, height: 25.434 },
  { key: "FAVORITE_ST",      label: "Favorite S/T", left: 76.667, top: 15.149, width: 13.073, height: 25.434 },

  { key: "FIELD",            label: "Field",        left: 10.208, top: 43.850, width: 13.073, height: 25.365 },
  { key: "RITUAL_SPELL",     label: "Ritual",       left: 26.823, top: 43.850, width: 13.073, height: 25.365 },
  { key: "FORBIDDEN",        label: "\"Forbidden\"", left: 43.438, top: 43.850, width: 13.073, height: 25.365 },
  { key: "POT",              label: "\"Pot\"",      left: 60.104, top: 43.850, width: 13.073, height: 25.365 },
  { key: "BANNED",           label: "Banned S/T",   left: 76.667, top: 43.850, width: 13.073, height: 25.365 },

  { key: "TRAP_NORMAL",      label: "Normal",       left: 10.208, top: 72.481, width: 13.073, height: 25.434 },
  { key: "TRAP_CONTINUOUS",  label: "Continuous",   left: 26.823, top: 72.481, width: 13.073, height: 25.434 },
  { key: "COUNTER",          label: "Counter",      left: 43.438, top: 72.481, width: 13.073, height: 25.434 },
  { key: "DOMINUS",          label: "Dominus",      left: 60.104, top: 72.481, width: 13.073, height: 25.434 },
  { key: "SOLEMN",           label: "Solemn",       left: 76.667, top: 72.481, width: 13.073, height: 25.434 },
];

const grid = document.getElementById("grid");
const modal = document.getElementById("modal");
const cardList = document.getElementById("cardList");
const searchBox = document.getElementById("searchBox");
const clearBtn = document.getElementById("clearBtn");

let activeBoxKey = null; // which box we're currently filling

// Picks are stored separately from the Monster picker's grid, but the
// SESSION_STORAGE_KEY is intentionally the SAME key as script.js -- one
// session id per browser, shared across both pickers on this site.
const PICKS_STORAGE_KEY = "ygo_st_picks";
const SESSION_STORAGE_KEY = "ygo_session_id";

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

// Build every card list once (used when searching Favorite S/T, which
// should open up to literally any Spell or Trap, not just what's already
// picked elsewhere on the grid)
function getAllCardsFlat() {
  const seen = new Map();
  Object.values(window.CARD_DATA_ST || {}).forEach(list => {
    list.forEach(card => seen.set(card.id, card));
  });
  return Array.from(seen.values());
}

// Favorite S/T only offers cards you've already placed in the other 14 boxes
function getCurrentSelections() {
  const seen = new Map();
  grid.querySelectorAll(".box").forEach(box => {
    if (box.dataset.key === "FAVORITE_ST") return;
    if (box.dataset.cardId) {
      seen.set(box.dataset.cardId, { id: box.dataset.cardId, name: box.dataset.cardName });
    }
  });
  return Array.from(seen.values());
}

function getListFor(key) {
  if (key === "FAVORITE_ST") return getCurrentSelections();
  return (window.CARD_DATA_ST && window.CARD_DATA_ST[key]) || [];
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

function renderCardList(list) {
  cardList.innerHTML = "";
  if (list.length === 0) {
    cardList.innerHTML = "<p style='padding:12px;'>Nothing to pick from yet — fill in some of the other boxes first.</p>";
    return;
  }
  list.forEach(card => {
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
}

searchBox.addEventListener("input", () => {
  const term = searchBox.value.toLowerCase();

  // Favorite S/T normally only offers your current picks, but once you
  // start typing a search, open it up to every Spell/Trap so you can pull
  // up literally any card as your overall favorite.
  const base = (activeBoxKey === "FAVORITE_ST" && term)
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
  const template = await loadImage("templateST.png");
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
  link.download = "my-yugioh-spelltrap-favorites.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});

// --- Log every place/clear click to Supabase ---
// Same project as the Monster picker.
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
