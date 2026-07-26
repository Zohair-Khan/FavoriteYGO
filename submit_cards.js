// ============================================================
// EDIT THIS LIST as you open up new categories for crowdsourcing.
// "key" is what gets stored in the database; "label" is what's displayed.
// ============================================================
const CROWDSOURCE_CATEGORIES = [
  { key: "HANDTRAPS", label: "Hand Traps" },
  { key: "BOARDBREAKERS", label: "Board Breakers" },
  { key: "ONECARDSTARTERS", label: "One-Card Starters" },
  { key: "FLOODGATES", label: "Flood Gates" },
  { key: "TOWERS", label: "Towers" },
  { key: "BRICKS", label: "Bricks" },
  { key: "BOSSMONSTERS", label: "Boss Monsters" },
  { key: "DRAWCARDS", label: "Draw Cards" }
  // { key: "ANOTHER_CATEGORY", label: "Another Category" },
];

const SUPABASE_URL = "https://gukihinomsiwmwousjia.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1a2loaW5vbXNpd213b3VzamlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MDQxNjIsImV4cCI6MjEwMDM4MDE2Mn0.9r6K-skI0XJ88MG6xfrmVpc0yGK4-biPVvRXF-ITSRc";

const supabaseClient = SUPABASE_URL.startsWith("http")
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const SESSION_STORAGE_KEY = "ygo_session_id"; // shared with the pickers/analytics
function getSessionId() {
  let id = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_STORAGE_KEY, id);
  }
  return id;
}
const SESSION_ID = getSessionId();

const categoryTabsEl = document.getElementById("category-tabs");
const searchBoxEl = document.getElementById("search-box");
const searchResultsEl = document.getElementById("search-results");
const statusCardEl = document.getElementById("status-card");
const existingTitleEl = document.getElementById("existing-title");
const existingGridEl = document.getElementById("existing-grid");
const pageStatusEl = document.getElementById("page-status");

let activeCategory = CROWDSOURCE_CATEGORIES[0]?.key;
let activeLabel = CROWDSOURCE_CATEGORIES[0]?.label;
let submittedCards = []; // [{card_id, card_name}, ...] for the active category

// Build the full known-card directory from both pickers' data, deduped by id.
// This is what search/autocomplete matches against.
function getAllKnownCards() {
  const seen = new Map();
  [window.CARD_DATA, window.CARD_DATA_ST].forEach(dataset => {
    Object.values(dataset || {}).forEach(list => {
      list.forEach(card => seen.set(String(card.id), card));
    });
  });
  return Array.from(seen.values());
}
const ALL_CARDS = getAllKnownCards();

function buildCategoryTabs() {
  categoryTabsEl.innerHTML = "";
  CROWDSOURCE_CATEGORIES.forEach((cat, i) => {
    const btn = document.createElement("button");
    btn.textContent = cat.label;
    if (i === 0) btn.classList.add("active");
    btn.addEventListener("click", () => {
      categoryTabsEl.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeCategory = cat.key;
      activeLabel = cat.label;
      statusCardEl.classList.add("hidden");
      searchBoxEl.value = "";
      searchResultsEl.innerHTML = "";
      loadExistingSubmissions();
    });
    categoryTabsEl.appendChild(btn);
  });
}

// --- Search (local, against the known-card directory -- no network needed) ---
let searchDebounce = null;
searchBoxEl.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  const term = searchBoxEl.value.trim().toLowerCase();
  renderExistingSubmissions(term); // live-filter the "already submitted" grid too

  if (term.length < 2) {
    searchResultsEl.innerHTML = "";
    return;
  }
  searchDebounce = setTimeout(() => {
    const submittedIds = new Set(submittedCards.map(c => String(c.card_id)));
    const matches = ALL_CARDS
      .filter(c => c.name.toLowerCase().includes(term))
      .filter(c => !submittedIds.has(String(c.id))) // already-submitted cards show in the list below instead
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 30);
    renderSearchResults(matches);
  }, 200);
});

function renderSearchResults(matches) {
  searchResultsEl.innerHTML = "";
  matches.forEach(card => {
    const row = document.createElement("div");
    row.className = "search-result-row";
    row.innerHTML = `
      <img src="images/${card.id}.jpg" alt="${card.name}">
      <div class="name">${card.name}</div>
    `;
    row.addEventListener("click", () => {
      searchResultsEl.innerHTML = "";
      searchBoxEl.value = "";
      selectCard(card);
    });
    searchResultsEl.appendChild(row);
  });
}

document.addEventListener("click", (e) => {
  if (!document.getElementById("search-section").contains(e.target)) {
    searchResultsEl.innerHTML = "";
  }
});

// --- Selecting a card: check if it's already submitted, else offer to submit ---
async function selectCard(card) {
  statusCardEl.classList.remove("hidden");
  statusCardEl.innerHTML = `<p class="empty">Checking...</p>`;

  const { data, error } = await supabaseClient
    .from("category_submissions_view")
    .select("submitted_at")
    .eq("category", activeCategory)
    .eq("card_id", String(card.id))
    .limit(1);

  if (error) {
    statusCardEl.innerHTML = `<p class="message error">Something went wrong checking this card: ${error.message}</p>`;
    return;
  }

  if (data.length > 0) {
    renderAlreadySubmitted(card);
  } else {
    renderSubmitPrompt(card);
  }
}

function renderAlreadySubmitted(card) {
  statusCardEl.innerHTML = `
    <div class="row">
      <img src="images/${card.id}.jpg" alt="${card.name}">
      <div class="name">${card.name}</div>
    </div>
    <p class="message already">This card has already been submitted for "${activeLabel}" by someone else -- no need to submit it again!</p>
  `;
}

function renderSubmitPrompt(card) {
  statusCardEl.innerHTML = `
    <div class="row">
      <img src="images/${card.id}.jpg" alt="${card.name}">
      <div class="name">${card.name}</div>
    </div>
    <p class="message">Not in "${activeLabel}" yet. Think it belongs?</p>
    <button class="cta-button" id="submitBtn">Submit to ${activeLabel}</button>
  `;
  document.getElementById("submitBtn").addEventListener("click", () => submitCard(card));
}

async function submitCard(card) {
  const btn = document.getElementById("submitBtn");
  btn.disabled = true;
  btn.textContent = "Submitting...";

  const { error } = await supabaseClient.from("category_submissions").insert({
    category: activeCategory,
    card_id: String(card.id),
    card_name: card.name,
    session_id: SESSION_ID,
  });

  if (error) {
    // 23505 = unique_violation -- someone else submitted this exact card in
    // the moment between us checking and us inserting. Not an error from the
    // user's point of view, just means it's already covered.
    if (error.code === "23505" || /duplicate/i.test(error.message)) {
      renderAlreadySubmitted(card);
    } else {
      statusCardEl.innerHTML += `<p class="message error">Submission failed: ${error.message}</p>`;
      btn.disabled = false;
      btn.textContent = `Submit to ${activeLabel}`;
    }
    return;
  }

  statusCardEl.innerHTML = `
    <div class="row">
      <img src="images/${card.id}.jpg" alt="${card.name}">
      <div class="name">${card.name}</div>
    </div>
    <p class="message success">Submitted! Thanks for helping build out "${activeLabel}".</p>
  `;
  loadExistingSubmissions(); // refresh the browsable list below
}

// --- Browsable list of everything already submitted for the active category ---
async function loadExistingSubmissions() {
  existingGridEl.innerHTML = `<p class="empty">Loading...</p>`;

  const { data, error } = await supabaseClient
    .from("category_submissions_view")
    .select("card_id, card_name")
    .eq("category", activeCategory)
    .order("card_name", { ascending: true });

  if (error) {
    existingGridEl.innerHTML = `<p class="empty">Couldn't load: ${error.message}</p>`;
    return;
  }

  submittedCards = data;
  renderExistingSubmissions(searchBoxEl.value.trim().toLowerCase());
}

function renderExistingSubmissions(term) {
  existingTitleEl.textContent = `Already submitted to "${activeLabel}"`;

  const filtered = term
    ? submittedCards.filter(c => c.card_name.toLowerCase().includes(term))
    : submittedCards;

  if (submittedCards.length === 0) {
    existingGridEl.innerHTML = `<p class="empty">Nothing submitted yet -- be the first!</p>`;
    return;
  }
  if (filtered.length === 0) {
    existingGridEl.innerHTML = `<p class="empty">No matching submitted cards.</p>`;
    return;
  }

  existingGridEl.innerHTML = "";
  filtered.forEach(row => {
    const el = document.createElement("div");
    el.className = "existing-card";
    el.innerHTML = `
      <img src="images/${row.card_id}.jpg" alt="${row.card_name}">
      <div class="name">${row.card_name}</div>
      <button class="remove-btn" title="Remove from this category">&times;</button>
    `;
    el.querySelector(".remove-btn").addEventListener("click", () => removeSubmission(row));
    existingGridEl.appendChild(el);
  });
}

// --- Admin mode: a light UI deterrent, NOT real security. The public anon
// key can technically call the delete endpoint directly regardless of this
// gate -- this just keeps the remove buttons from being visible/obvious to
// casual visitors. Change this password to whatever you like.
const ADMIN_PASSWORD = "changeme";

document.getElementById("admin-toggle").addEventListener("click", (e) => {
  e.preventDefault();
  if (document.body.classList.contains("admin-mode")) {
    document.body.classList.remove("admin-mode");
    return;
  }
  const attempt = prompt("Admin password:");
  if (attempt === ADMIN_PASSWORD) {
    document.body.classList.add("admin-mode");
  } else if (attempt !== null) {
    alert("Wrong password.");
  }
});

async function removeSubmission(row) {
  if (!confirm(`Remove "${row.card_name}" from "${activeLabel}"?`)) return;

  const { error, count } = await supabaseClient
    .from("category_submissions")
    .delete({ count: "exact" })
    .eq("category", activeCategory)
    .eq("card_id", String(row.card_id));

  console.log("Delete result:", { error, count, category: activeCategory, card_id: row.card_id });

  if (error) {
    alert(`Couldn't remove: ${error.message}`);
    return;
  }

  if (!count) {
    alert("Nothing was actually deleted (0 rows matched). This usually means the DELETE policy isn't set up yet -- check the console for the exact filter values used, and confirm add_delete_policy.sql has been run in Supabase.");
    return;
  }

  loadExistingSubmissions(); // refresh the grid
}

function init() {
  if (!supabaseClient) {
    pageStatusEl.textContent = "Not set up yet (missing Supabase URL/key).";
    return;
  }
  if (CROWDSOURCE_CATEGORIES.length === 0) {
    pageStatusEl.textContent = "No categories configured yet -- edit CROWDSOURCE_CATEGORIES in submit_cards.js.";
    return;
  }
  buildCategoryTabs();
  loadExistingSubmissions();
}

init();