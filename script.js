// The 15 boxes. left/top/width/height are percentages measured directly from
// template.png's card-back slots (source image is 1920x1439), so these boxes
// sit exactly on top of the card backs regardless of how large the page
// renders the template.
const CATEGORY_LAYOUT = [
  { key: "NORMAL",   left: 10.208, top: 15.149, width: 13.073, height: 25.434 },
  { key: "EFFECT",   left: 26.823, top: 15.149, width: 13.073, height: 25.434 },
  { key: "RITUAL",   left: 43.438, top: 15.149, width: 13.073, height: 25.434 },
  { key: "FUSION",   left: 60.104, top: 15.149, width: 13.073, height: 25.434 },
  { key: "SYNCHRO",  left: 76.667, top: 15.149, width: 13.073, height: 25.434 },

  { key: "XYZ",      left: 10.208, top: 43.850, width: 13.073, height: 25.365 },
  { key: "LINK",     left: 26.823, top: 43.850, width: 13.073, height: 25.365 },
  { key: "PENDULUM", left: 43.438, top: 43.850, width: 13.073, height: 25.365 },
  { key: "GEMINI",   left: 60.104, top: 43.850, width: 13.073, height: 25.365 },
  { key: "TOON",     left: 76.667, top: 43.850, width: 13.073, height: 25.365 },

  { key: "SPIRIT",   left: 10.208, top: 72.481, width: 13.073, height: 25.434 },
  { key: "UNION",    left: 26.823, top: 72.481, width: 13.073, height: 25.434 },
  { key: "FLIP",     left: 43.438, top: 72.481, width: 13.073, height: 25.434 },
  { key: "TUNER",    left: 60.104, top: 72.481, width: 13.073, height: 25.434 },
  { key: "OVERALL",  left: 76.667, top: 72.481, width: 13.073, height: 25.434 },
];

const grid = document.getElementById("grid");
const modal = document.getElementById("modal");
const cardList = document.getElementById("cardList");
const searchBox = document.getElementById("searchBox");
const clearBtn = document.getElementById("clearBtn");

let activeBoxKey = null; // which box we're currently filling

const PICKS_STORAGE_KEY = "ygo_picks";
const SESSION_STORAGE_KEY = "ygo_session_id";

// One random id per browser, generated once and reused -- lets you tell
// "these clicks all came from the same visitor" without any login.
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

// Build every card list once (used by Import Code, which needs to match
// against the whole database regardless of what's currently on the grid)
function getAllCardsFlat() {
  const seen = new Map();
  Object.values(window.CARD_DATA || {}).forEach(list => {
    list.forEach(card => seen.set(card.id, card));
  });
  return Array.from(seen.values());
}

// Overall Favorite only offers cards you've already placed in the other 14 boxes
function getCurrentSelections() {
  const seen = new Map();
  grid.querySelectorAll(".box").forEach(box => {
    if (box.dataset.key === "OVERALL") return;
    if (box.dataset.cardId) {
      seen.set(box.dataset.cardId, { id: box.dataset.cardId, name: box.dataset.cardName });
    }
  });
  return Array.from(seen.values());
}

function getListFor(key) {
  if (key === "OVERALL") return getCurrentSelections();
  return (window.CARD_DATA && window.CARD_DATA[key]) || [];
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

  // Overall Favorite normally only offers your current picks, but once you
  // start typing a search, open it up to the whole database so you can pull
  // up literally any card as your overall favorite.
  const base = (activeBoxKey === "OVERALL" && term)
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
// Output resolution is the template's own size x this multiplier, so exports
// stay crisp regardless of screen size.
const OUTPUT_SCALE = 2;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Mimics CSS object-fit: cover -- scales the image up to fill the slot
// completely, cropping whichever dimension overflows.
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
  const template = await loadImage("template.png");
  const canvasW = template.width * OUTPUT_SCALE;
  const canvasH = template.height * OUTPUT_SCALE;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");

  // Base layer: the template itself (background, header, card backs, labels)
  ctx.drawImage(template, 0, 0, canvasW, canvasH);

  // Preload every selected card image up front (same-origin, so no CORS issues)
  const boxes = grid.querySelectorAll(".box");
  const loaded = await Promise.all(
    Array.from(boxes).map(box =>
      box.dataset.cardId ? loadImage(`images/${box.dataset.cardId}.jpg`) : null
    )
  );

  boxes.forEach((box, i) => {
    const img = loaded[i];
    if (!img) return; // nothing picked -- leave the card-back showing through

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
  link.download = "my-yugioh-favorites.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});

// Write/Import Code feature is on hold for now -- getAllCardsFlat() is kept
// above since nothing else needs it currently removed, but no UI calls it.

// --- Log every place/clear click to Supabase ---
// Fill these in from your Supabase project: Settings > API
const SUPABASE_URL = "https://gukihinomsiwmwousjia.supabase.co"; // e.g. https://xxxxx.supabase.co
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1a2loaW5vbXNpd213b3VzamlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MDQxNjIsImV4cCI6MjEwMDM4MDE2Mn0.9r6K-skI0XJ88MG6xfrmVpc0yGK4-biPVvRXF-ITSRc";

const supabaseClient = (SUPABASE_URL.startsWith("http"))
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

async function logClickEvent(category, card, action) {
  if (!supabaseClient) return; // not configured yet -- fail silently, don't break the UI
  try {
    const { error } = await supabaseClient.from("click_events").insert({
      session_id: SESSION_ID,
      category,
      card_id: String(card.id),
      card_name: card.name,
      action, // "place" or "clear"
    });
    if (error) console.error("click_events insert failed:", error.message);
  } catch (e) {
    console.error("click_events insert failed:", e);
  }
}