// Each entry: key = the raw category value stored in click_events/card_tally_view,
// label = what's actually shown on the tab button. These differ for the
// Spell/Trap categories since their keys (e.g. "SPELL_NORMAL") aren't
// meant to be displayed as-is.
const CATEGORY_ORDER = [
  { key: "OVERALL", label: "Favorite Monster", group: "monster" },
  { key: "NORMAL", label: "Normal", group: "monster" },
  { key: "EFFECT", label: "Effect", group: "monster" },
  { key: "RITUAL", label: "Ritual", group: "monster" },
  { key: "FUSION", label: "Fusion", group: "monster" },
  { key: "SYNCHRO", label: "Synchro", group: "monster" },
  { key: "XYZ", label: "Xyz", group: "monster" },
  { key: "LINK", label: "Link", group: "monster" },
  { key: "PENDULUM", label: "Pendulum", group: "monster" },
  { key: "TUNER", label: "Tuner", group: "monster" },
  { key: "GEMINI", label: "Gemini", group: "monster" },
  { key: "TOON", label: "Toon", group: "monster" },
  { key: "SPIRIT", label: "Spirit", group: "monster" },
  { key: "UNION", label: "Union", group: "monster" },
  { key: "FLIP", label: "Flip", group: "monster" },

  { key: "FAVORITE_ST", label: "Favorite S/T", group: "spell_trap" },
  { key: "SPELL_NORMAL", label: "Normal Spell", group: "spell_trap" },
  { key: "SPELL_CONTINUOUS", label: "Continuous Spell", group: "spell_trap" },
  { key: "EQUIP", label: "Equip Spell", group: "spell_trap" },
  { key: "QUICKPLAY", label: "Quick-Play Spell", group: "spell_trap" },
  { key: "FIELD", label: "Field Spell", group: "spell_trap" },
  { key: "RITUAL_SPELL", label: "Ritual Spell", group: "spell_trap" },
  { key: "TRAP_NORMAL", label: "Normal Trap", group: "spell_trap" },
  { key: "TRAP_CONTINUOUS", label: "Continuous Trap", group: "spell_trap" },
  { key: "COUNTER", label: "Counter Trap", group: "spell_trap" },
  { key: "BANNED", label: "Banned S/T", group: "spell_trap" },
  { key: "FORBIDDEN", label: "\"Forbidden\"", group: "spell_trap" },
  { key: "POT", label: "\"Pot\"", group: "spell_trap" },
  { key: "SOLEMN", label: "\"Solemn\"", group: "spell_trap" },
  { key: "DOMINUS", label: "\"Dominus\"", group: "spell_trap" },

  { key: "HATED_NORMAL", label: "Hated Normal", group: "hated" },
  { key: "HATED_EFFECT", label: "Hated Effect", group: "hated" },
  { key: "HATED_RITUAL", label: "Hated Ritual", group: "hated" },
  { key: "HATED_FUSION", label: "Hated Fusion", group: "hated" },
  { key: "HATED_SYNCHRO", label: "Hated Synchro", group: "hated" },
  { key: "HATED_XYZ", label: "Hated Xyz", group: "hated" },
  { key: "HATED_LINK", label: "Hated Link", group: "hated" },
  { key: "HATED_PENDULUM", label: "Hated Pendulum", group: "hated" },
  { key: "SPELL", label: "Hated Spell", group: "hated" },
  { key: "TRAP", label: "Hated Trap", group: "hated" },
  { key: "FLOODGATE", label: "Hated Floodgate", group: "hated" },
  { key: "HANDTRAP", label: "Hated Handtrap", group: "hated" },
  { key: "TOWER", label: "Hated Tower", group: "hated" },
  { key: "ONE_CARD_STARTER", label: "Hated 1-Card Starter", group: "hated" },
  { key: "MOST_HATED", label: "Most Hated", group: "hated" },
];

const GROUPS = [
  { key: "monster", i18nKey: "group_favorite_monster", label: "Favorite Monster" },
  { key: "spell_trap", i18nKey: "group_favorite_spell_trap", label: "Favorite Spell/Trap" },
  { key: "hated", i18nKey: "group_most_hated", label: "Most Hated" },
];
let activeGroup = "monster";

const TOP_N_PER_CATEGORY = 10;

// Fill these in -- same project as the main picker.
const SUPABASE_URL = "https://gukihinomsiwmwousjia.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1a2loaW5vbXNpd213b3VzamlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MDQxNjIsImV4cCI6MjEwMDM4MDE2Mn0.9r6K-skI0XJ88MG6xfrmVpc0yGK4-biPVvRXF-ITSRc";

const supabaseClient = SUPABASE_URL.startsWith("http")
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const tabsEl = document.getElementById("tabs");
const panelEl = document.getElementById("panel");
const statusEl = document.getElementById("status");
const searchBoxEl = document.getElementById("search-box");
const searchResultsEl = document.getElementById("search-results");

// Same global-scale heatmap as the original analytics page -- used here as
// a subtle accent stripe instead of a full loud box, so card art stays the
// visual focus.
const HEATMAP_STOPS = [
  { t: 0.00, c: [255, 0, 255] },
  { t: 0.25, c: [0, 0, 255] },
  { t: 0.50, c: [0, 255, 0] },
  { t: 0.75, c: [255, 255, 0] },
  { t: 1.00, c: [255, 0, 0] },
];

function heatmapColor(t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 0; i < HEATMAP_STOPS.length - 1; i++) {
    const a = HEATMAP_STOPS[i], b = HEATMAP_STOPS[i + 1];
    if (t >= a.t && t <= b.t) {
      const localT = (t - a.t) / (b.t - a.t);
      return [
        Math.round(a.c[0] + (b.c[0] - a.c[0]) * localT),
        Math.round(a.c[1] + (b.c[1] - a.c[1]) * localT),
        Math.round(a.c[2] + (b.c[2] - a.c[2]) * localT),
      ];
    }
  }
  return HEATMAP_STOPS[HEATMAP_STOPS.length - 1].c;
}

function readableTextColor([r, g, b]) {
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111" : "#fff";
}

let globalMax = 0;
let totalsByCategory = {};
let cache = {}; // category -> rows, so switching tabs back doesn't re-fetch
let activeCategory = CATEGORY_ORDER[0].key;
let activeLabel = CATEGORY_ORDER[0].label;

// --- Trend comparison state ---
let compareCards = []; // [{id, name}, ...] -- cards currently on the chart
let trendChart = null;
const trendSectionEl = document.getElementById("trend-section");
const trendCardBoxesEl = document.getElementById("trend-card-boxes");
const trendTitleEl = document.getElementById("trend-title");
const TREND_COLORS = [
  "#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#d35400",
  "#16a085", "#c2185b", "#7f8c8d", "#f39c12", "#2c3e50",
];

function renderSearchResults(rows) {
  searchResultsEl.innerHTML = "";

  if (rows.length === 0) {
    searchResultsEl.innerHTML = `<p class="search-empty">${t("search_empty")}</p>`;
    return;
  }

  rows.forEach(row => {
    const el = document.createElement("div");
    el.className = "search-result";
    const shownName = displayCardName(row.card_id, row.card_name);
    const alreadyAdded = compareCards.some(c => String(c.id) === String(row.card_id));
    el.innerHTML = `
      <img src="images/${row.card_id}.jpg" alt="${shownName}">
      <div class="info">
        <div class="sr-name">${shownName}</div>
      </div>
      <div class="sr-rank">#${row.rank}</div>
    `;
    if (alreadyAdded) {
      el.style.opacity = "0.5";
      el.title = "Already on the chart";
    } else {
      el.addEventListener("click", () => {
        searchResultsEl.innerHTML = ""; // close the dropdown
        searchBoxEl.value = "";
        addCardToCompare(row.card_id, row.card_name, row.rank, row.net_picks);
      });
    }
    searchResultsEl.appendChild(el);
  });
}

// --- Trend comparison: add/remove cards, render chips, fetch + draw chart ---

function colorForIndex(i) {
  return TREND_COLORS[i % TREND_COLORS.length];
}

function renderTrendCardBoxes() {
  trendCardBoxesEl.innerHTML = "";
  const total = totalsByCategory[activeCategory] || 0;

  compareCards.forEach((card, i) => {
    const pct = total > 0 ? ((card.netPicks / total) * 100).toFixed(2) : "0.00";
    const fraction = globalMax > 0 ? card.netPicks / globalMax : 0;
    const rgb = heatmapColor(fraction);
    const shownName = displayCardName(card.id, card.name);

    const box = document.createElement("div");
    box.className = "trend-card-box";
    box.style.borderColor = colorForIndex(i);
    box.innerHTML = `
      <div class="sr-rank">#${card.rank}</div>
      <img src="images/${card.id}.jpg" alt="${shownName}">
      <div class="info">
        <div class="sr-name">${shownName}</div>
      </div>
      <div class="heat-box" style="background: rgb(${rgb.join(",")}); color: ${readableTextColor(rgb)};">
        ${pct}% - ${card.netPicks} ${t("votes_suffix")}
      </div>
      <button class="remove-btn" title="Remove">&times;</button>
    `;
    box.querySelector(".remove-btn").addEventListener("click", () => removeCardFromCompare(card.id));
    trendCardBoxesEl.appendChild(box);
  });
}

async function fetchCardHistory(cardId) {
  // Paginate in chunks rather than trusting one request to return everything --
  // Supabase's REST API caps how many rows a single request returns, and a
  // popular card with lots of swap-in/swap-out churn can generate more raw
  // place/clear events than that cap, silently truncating the tail end
  // otherwise (this bit us once before with the XYZ category rankings).
  const PAGE_SIZE = 1000;
  let allRows = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabaseClient
      .from("card_event_history_view")
      .select("action, created_at")
      .eq("category", activeCategory)
      .eq("card_id", String(cardId))
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error("Failed to load card history:", error.message);
      statusEl.textContent = `Trend chart error: ${error.message}`;
      return [];
    }

    allRows = allRows.concat(data);
    if (data.length < PAGE_SIZE) break; // last page was partial -- we're done
    offset += PAGE_SIZE;
  }

  let running = 0;
  const points = allRows.map(row => {
    running += row.action === "place" ? 1 : -1;
    return { x: row.created_at, y: running };
  });
  // Extend the line to the present moment at its last known value, so every
  // card's line reaches the same right edge of the chart -- otherwise a
  // card with no recent activity would visually stop short, which could be
  // misread as it "losing" votes rather than just being quiet recently.
  if (points.length > 0) {
    points.push({ x: new Date().toISOString(), y: running });
  }
  return points;
}

async function updateTrendChart() {
  renderTrendCardBoxes();

  if (compareCards.length === 0) {
    trendSectionEl.classList.add("hidden");
    if (trendChart) {
      trendChart.dispose();
      trendChart = null;
    }
    return;
  }

  trendSectionEl.classList.remove("hidden");
  trendTitleEl.textContent = `${activeLabel}: ${t("trend_title_suffix")}`;

  const series = await Promise.all(compareCards.map(async (card, i) => {
    const points = await fetchCardHistory(card.id);
    const color = colorForIndex(i);
    return {
      name: card.name,
      type: "line",
      showSymbol: true,
      symbolSize: 5,
      lineStyle: { color, width: 2 },
      itemStyle: { color },
      data: points.map(p => [new Date(p.x).getTime(), p.y]),
    };
  }));

  // Compute the real max ourselves rather than relying on ECharts' "dataMax"
  // string keyword, which can get stuck at a stale value across repeated
  // setOption calls (e.g. after adding/removing cards) instead of properly
  // recomputing from the current series every time.
  const allYValues = series.flatMap(s => s.data.map(p => p[1]));
  const realMaxY = allYValues.length ? Math.max(...allYValues) : 1;
  const yAxisMax = Math.ceil(realMaxY * 1.1); // small headroom above the tallest line

  if (!trendChart) {
    trendChart = echarts.init(document.getElementById("trendChart"));
    window.addEventListener("resize", () => trendChart && trendChart.resize());
  }

  trendChart.setOption({
    tooltip: {
      trigger: "axis",
      formatter: params => {
        const date = new Date(params[0].value[0]).toLocaleString();
        const lines = params.map(p => `${p.marker} ${p.seriesName}: ${p.value[1]} net votes`);
        return [date, ...lines].join("<br>");
      },
    },
    grid: { left: 55, right: 20, top: 50, bottom: 30 },
    xAxis: {
      type: "value", // NOT "time" -- a plain numeric axis is what gives fully
                     // symmetric 2D drag/pan in both directions; ECharts'
                     // special "time" axis type has extra handling that was
                     // blocking vertical panning specifically.
      min: "dataMin",
      max: "dataMax",
      axisLabel: {
        formatter: value => new Date(value).toLocaleString([], {
          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
        }),
      },
    },
    yAxis: {
      type: "value",
      name: "Net Votes",
      nameGap: 30,
      minInterval: 1,
      min: 0,
      max: yAxisMax,
    },
    dataZoom: [
      {
        type: "inside", // scroll wheel = zoom (correctly anchored at the cursor),
        xAxisIndex: 0,   // click-drag in the plot = pan -- X only, kept as its
                         // own entry since combining both axes into a single
                         // wheel gesture was throwing off the zoom's anchor point
        filterMode: "none",
      },
      {
        type: "inside", // drag directly on the Y-axis number labels (not the
        yAxisIndex: 0,   // main plot) to pan/zoom vertically -- ECharts treats
        filterMode: "none", // axis-label-drag as that axis's own dedicated gesture
      },
    ],
    series,
  }, true); // true = don't merge with previous series (avoids stale lines when cards are removed)
}

function addCardToCompare(id, name, rank, netPicks) {
  if (compareCards.some(c => String(c.id) === String(id))) return; // already added
  compareCards.push({ id, name, rank, netPicks });
  updateTrendChart();
}

function removeCardFromCompare(id) {
  compareCards = compareCards.filter(c => String(c.id) !== String(id));
  updateTrendChart();
}

document.getElementById("trend-close").addEventListener("click", () => {
  compareCards = [];
  updateTrendChart();
});

document.getElementById("trend-reset-zoom").addEventListener("click", () => {
  if (trendChart) trendChart.dispatchAction({ type: "restore" });
});

function getAllCardsFlat() {
  const seen = new Map();
  [window.CARD_DATA, window.CARD_DATA_ST, window.CARD_DATA_SPECIAL].forEach(dataset => {
    Object.values(dataset || {}).forEach(list => {
      list.forEach(card => seen.set(String(card.id), card));
    });
  });
  return Array.from(seen.values());
}

// Matches against the English name as usual, PLUS Japanese/Korean
// names+romanizations (from card_names_i18n.js, keyed by baseId).
function cardMatchesSearch(card, term) {
  if (card.name.toLowerCase().includes(term)) return true;
  const i18n = (window.CARD_NAMES_I18N || {})[String(card.baseId ?? card.id)];
  if (!i18n) return false;
  return [
    i18n.fr_name, i18n.de_name, i18n.it_name, i18n.es_name, i18n.pt_name,
    i18n.ja_name, i18n.ja_kana, i18n.ja_romaji, i18n.ja_translated, i18n.ja_base, i18n.ja_base_translated,
    i18n.ja_alt_name, i18n.ja_alt_kana, i18n.ja_alt_romaji, i18n.ja_alt_translated,
    i18n.ko_name, i18n.ko_romaji, i18n.ko_translated,
    i18n.sc_name, i18n.sc_pinyin, i18n.sc_translated,
    i18n.tc_name, i18n.tc_pinyin, i18n.tc_translated,
    i18n.alt_name,
  ]
    .some(n => n && n.toLowerCase().includes(term));
}

async function runSearch() {
  const term = searchBoxEl.value.trim();

  if (term.length < 1) {
    searchResultsEl.innerHTML = "";
    return;
  }

  // Two sources of matches, merged: (1) the existing English-name substring
  // search directly against the database, and (2) cards whose JA/KO name
  // matches locally, looked up in the database by id. A card found via (2)
  // might not actually have any votes in this category, which the query's
  // own category filter handles naturally.
  const localMatchIds = getAllCardsFlat()
    .filter(c => cardMatchesSearch(c, term.toLowerCase()))
    .map(c => String(c.baseId ?? c.id));

  const queries = [
    supabaseClient
      .from("card_tally_ranked_view")
      .select("category, card_id, card_name, net_picks, rank")
      .eq("category", activeCategory)
      .ilike("card_name", `%${term}%`)
      .order("card_name")
      .limit(50),
  ];

  if (localMatchIds.length > 0) {
    queries.push(
      supabaseClient
        .from("card_tally_ranked_view")
        .select("category, card_id, card_name, net_picks, rank")
        .eq("category", activeCategory)
        .in("card_id", localMatchIds)
        .order("card_name")
        .limit(50)
    );
  }

  const results = await Promise.all(queries);
  const error = results.find(r => r.error)?.error;
  if (error) {
    searchResultsEl.innerHTML = `<p class="search-empty">Search failed: ${error.message}</p>`;
    return;
  }

  const merged = new Map();
  results.forEach(r => (r.data || []).forEach(row => merged.set(row.card_id, row)));
  const data = Array.from(merged.values()).sort((a, b) => a.card_name.localeCompare(b.card_name));

  renderSearchResults(data);
}

let searchDebounce = null;
let isComposing = false;
searchBoxEl.addEventListener("compositionstart", () => { isComposing = true; });
searchBoxEl.addEventListener("compositionend", () => {
  isComposing = false;
  clearTimeout(searchDebounce);
  runSearch();
});
searchBoxEl.addEventListener("input", () => {
  if (isComposing) return; // wait for IME composition to be confirmed
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(runSearch, 300); // debounce so we're not firing a query on every keystroke
});

document.addEventListener("click", (e) => {
  const searchSection = document.getElementById("search-section");
  if (!searchSection.contains(e.target)) {
    searchResultsEl.innerHTML = "";
  }
});

function renderPanel(label, rows, categoryTotal) {
  panelEl.innerHTML = "";

  const heading = document.createElement("h2");
  heading.textContent = `${label} — ${categoryTotal} ${t("votes_suffix")}`;
  panelEl.appendChild(heading);

  if (rows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No picks yet.";
    panelEl.appendChild(empty);
    return;
  }

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);

  // --- Podium for top 3 ---
  const podium = document.createElement("div");
  podium.className = "podium";
  const medals = [t("rank_1st"), t("rank_2nd"), t("rank_3rd")];
  top3.forEach((row, i) => {
    const pct = categoryTotal > 0 ? ((row.net_picks / categoryTotal) * 100).toFixed(2) : "0.00";
    const fraction = globalMax > 0 ? row.net_picks / globalMax : 0;
    const rgb = heatmapColor(fraction);

    const card = document.createElement("div");
    card.className = `podium-card rank-${i + 1}`;
    card.style.cursor = "pointer";
    card.title = "Click to add to trend chart";
    const shownName = displayCardName(row.card_id, row.card_name);
    card.innerHTML = `
      <div class="medal">${medals[i]}</div>
      <img src="images/${row.card_id}.jpg" alt="${shownName}">
      <div class="pname">${shownName}</div>
      <div class="heat-box" style="background: rgb(${rgb.join(",")}); color: ${readableTextColor(rgb)};">
        ${pct}% - ${row.net_picks} ${t("votes_suffix")}
      </div>
    `;
    card.addEventListener("click", () => addCardToCompare(row.card_id, row.card_name, i + 1, row.net_picks));
    podium.appendChild(card);
  });
  panelEl.appendChild(podium);

  // --- Ranks 4+ as a compact list ---
  if (rest.length > 0) {
    const list = document.createElement("div");
    list.className = "rest-list";
    rest.forEach((row, i) => {
      const rank = i + 4;
      const pct = categoryTotal > 0 ? ((row.net_picks / categoryTotal) * 100).toFixed(2) : "0.00";
      const fraction = globalMax > 0 ? row.net_picks / globalMax : 0;
      const rgb = heatmapColor(fraction);

      const rowEl = document.createElement("div");
      rowEl.className = "row";
      rowEl.style.cursor = "pointer";
      rowEl.title = "Click to add to trend chart";
      const shownName = displayCardName(row.card_id, row.card_name);
      rowEl.innerHTML = `
        <div class="rank">#${rank}</div>
        <img src="images/${row.card_id}.jpg" alt="${shownName}">
        <div class="name">${shownName}</div>
        <div class="heat-box" style="background: rgb(${rgb.join(",")}); color: ${readableTextColor(rgb)};">
          ${pct}% - ${row.net_picks} ${t("votes_suffix")}
        </div>
      `;
      rowEl.addEventListener("click", () => addCardToCompare(row.card_id, row.card_name, rank, row.net_picks));
      list.appendChild(rowEl);
    });
    panelEl.appendChild(list);
  }
}

async function loadCategory(category, label) {
  if (cache[category]) {
    renderPanel(label, cache[category], totalsByCategory[category] || 0);
    return;
  }

  panelEl.innerHTML = `<p class="empty">${t("loading")}</p>`;

  const { data, error } = await supabaseClient
    .from("card_tally_view")
    .select("card_id, card_name, net_picks")
    .eq("category", category)
    .order("net_picks", { ascending: false })
    .limit(TOP_N_PER_CATEGORY);

  if (error) {
    panelEl.innerHTML = `<p class="empty">Couldn't load this category: ${error.message}</p>`;
    return;
  }

  cache[category] = data;
  renderPanel(label, data, totalsByCategory[category] || 0);
}

function buildGroupSelector() {
  const groupSelectorEl = document.getElementById("group-selector");
  groupSelectorEl.innerHTML = "";
  GROUPS.forEach(g => {
    const btn = document.createElement("button");
    btn.textContent = t(g.i18nKey);
    btn.dataset.group = g.key;
    if (g.key === activeGroup) btn.classList.add("active");
    btn.addEventListener("click", () => {
      if (g.key === activeGroup) return;
      activeGroup = g.key;
      groupSelectorEl.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      buildTabs(); // rebuild the tab row for the newly selected group, and
                   // select+load its first category automatically
    });
    groupSelectorEl.appendChild(btn);
  });
}

function catLabel(cat) {
  return t("cat_" + cat.key.toLowerCase());
}

// Shows a card's name in whatever language is currently active, using the
// translated name from card_names_i18n.js (keyed by card_id) when
// available, falling back to the English name otherwise -- this is
// independent of the UI-chrome translations above, since it's translating
// actual card data, not interface text.
// Escapes HTML-significant characters in a string before it gets inserted
// via innerHTML -- necessary because some real card names contain literal
// "<"/">" characters (e.g. "Maliss <P> Dormouse"), which browsers would
// otherwise parse as actual HTML tags (case-insensitively -- "<P>" reads
// as an actual <p> paragraph tag, forcing an unwanted line break) rather
// than displaying as the literal text they're supposed to be.
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function displayCardName(cardId, englishName) {
  if (currentLanguage === "en") return escapeHtml(englishName);
  const i18n = (window.CARD_NAMES_I18N || {})[String(cardId)];
  if (!i18n) return escapeHtml(englishName);
  const candidatesByLang = {
    ja: [i18n.ja_name, i18n.ja_kana, i18n.ja_romaji],
    ko: [i18n.ko_name],
    "zh-Hans": [i18n.sc_name],
  };
  const candidates = candidatesByLang[currentLanguage] || [];
  return escapeHtml(candidates.find(v => v) || englishName);
}

function buildTabs({ preserveSelection = false } = {}) {
  tabsEl.innerHTML = "";
  tabsEl.classList.toggle("hated-group", activeGroup === "hated");

  const categoriesInGroup = CATEGORY_ORDER.filter(cat => cat.group === activeGroup);
  const keepCurrent = preserveSelection && categoriesInGroup.some(cat => cat.key === activeCategory);

  categoriesInGroup.forEach((cat, i) => {
    const btn = document.createElement("button");
    btn.textContent = catLabel(cat);
    const isActive = keepCurrent ? cat.key === activeCategory : i === 0;
    if (isActive) btn.classList.add("active");
    btn.addEventListener("click", () => {
      tabsEl.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeCategory = cat.key;
      activeLabel = catLabel(cat);
      loadCategory(cat.key, activeLabel);
      compareCards = [];
      updateTrendChart();
      if (searchBoxEl.value.trim().length >= 2) runSearch();
    });
    tabsEl.appendChild(btn);
  });

  if (keepCurrent) {
    // Language switch on the same category -- just refresh the translated
    // label and re-render the currently loaded panel/trend chart in place.
    // Trend selections (compareCards) and any active search are left alone.
    const cat = categoriesInGroup.find(c => c.key === activeCategory);
    activeLabel = catLabel(cat);
    loadCategory(activeCategory, activeLabel);
    updateTrendChart();
    if (searchBoxEl.value.trim().length >= 2) runSearch();
  } else {
    // Genuine group switch (or first load) -- jump to that group's first category.
    if (categoriesInGroup.length > 0) {
      activeCategory = categoriesInGroup[0].key;
      activeLabel = catLabel(categoriesInGroup[0]);
      loadCategory(activeCategory, activeLabel);
      compareCards = [];
      updateTrendChart();
    }
  }
}

async function init() {
  applyTranslations();
  buildLanguageSwitcher("lang-switcher", () => {
    // Language changed -- refresh translated text (group pills, category
    // tab labels, and the currently loaded panel/trend chart) WITHOUT
    // resetting back to the group's first category or clearing trend
    // selections -- that's only supposed to happen on a genuine group switch.
    buildGroupSelector();
    buildTabs({ preserveSelection: true });
  });

  if (!supabaseClient) {
    statusEl.textContent = "Analytics aren't set up yet (missing Supabase URL/key in analytics-v2.js).";
    return;
  }

  statusEl.textContent = t("loading");

  try {
    const { data: maxRows, error: maxError } = await supabaseClient
      .from("card_tally_view")
      .select("net_picks")
      .order("net_picks", { ascending: false })
      .limit(1);

    if (maxError) {
      statusEl.textContent = `Couldn't load analytics: ${maxError.message}`;
      return;
    }
    globalMax = maxRows.length ? maxRows[0].net_picks : 0;

    const { data: totalsData, error: totalsError } = await supabaseClient
      .from("category_totals_view")
      .select("category, total_votes");

    if (totalsError) {
      statusEl.textContent = `Couldn't load analytics: ${totalsError.message}`;
      return;
    }
    totalsData.forEach(row => { totalsByCategory[row.category] = row.total_votes; });

    buildGroupSelector();
    buildTabs(); // loads the first category of the active group internally

    statusEl.textContent = "";
  } catch (e) {
    // Catches network-level failures (timeout, CORS, connection refused,
    // paused project, etc.) that don't come back as a clean Supabase error
    // object -- without this, a failure here just silently hangs on
    // "Loading..." forever with nothing visible to debug from.
    console.error("Analytics failed to load:", e);
    statusEl.textContent = `Couldn't load analytics (network error): ${e.message || e}`;
  }
}

init();