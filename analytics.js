// Each entry: key = the raw category value stored in click_events/card_tally_view,
// label = what's actually shown on the tab button. These differ for the
// Spell/Trap categories since their keys (e.g. "SPELL_NORMAL") aren't
// meant to be displayed as-is.
const CATEGORY_ORDER = [
  { key: "OVERALL", label: "Favorite Monster" },
  { key: "FAVORITE_ST", label: "Favorite S/T" },
  { key: "NORMAL", label: "Normal" },
  { key: "EFFECT", label: "Effect" },
  { key: "RITUAL", label: "Ritual" },
  { key: "FUSION", label: "Fusion" },
  { key: "SYNCHRO", label: "Synchro" },
  { key: "XYZ", label: "Xyz" },
  { key: "LINK", label: "Link" },
  { key: "PENDULUM", label: "Pendulum" },
  { key: "TUNER", label: "Tuner" },
  { key: "GEMINI", label: "Gemini" },
  { key: "TOON", label: "Toon" },
  { key: "SPIRIT", label: "Spirit" },
  { key: "UNION", label: "Union" },
  { key: "FLIP", label: "Flip" },

  { key: "SPELL_NORMAL", label: "Normal Spell" },
  { key: "SPELL_CONTINUOUS", label: "Continuous Spell" },
  { key: "EQUIP", label: "Equip Spell" },
  { key: "QUICKPLAY", label: "Quick-Play Spell" },
  { key: "FIELD", label: "Field Spell" },
  { key: "RITUAL_SPELL", label: "Ritual Spell" },
  { key: "TRAP_NORMAL", label: "Normal Trap" },
  { key: "TRAP_CONTINUOUS", label: "Continuous Trap" },
  { key: "COUNTER", label: "Counter Trap" },
  { key: "BANNED", label: "Banned S/T" },
  { key: "FORBIDDEN", label: "\"Forbidden\"" },
  { key: "POT", label: "\"Pot\"" },
  { key: "SOLEMN", label: "\"Solemn\"" },
  { key: "DOMINUS", label: "\"Dominus\"" },
];

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
    searchResultsEl.innerHTML = "<p class=\"search-empty\">No cards matching that name have any votes yet in this category.</p>";
    return;
  }

  rows.forEach(row => {
    const el = document.createElement("div");
    el.className = "search-result";
    const alreadyAdded = compareCards.some(c => String(c.id) === String(row.card_id));
    el.innerHTML = `
      <img src="images/${row.card_id}.jpg" alt="${row.card_name}">
      <div class="info">
        <div class="sr-name">${row.card_name}</div>
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

    const box = document.createElement("div");
    box.className = "trend-card-box";
    box.style.borderColor = colorForIndex(i);
    box.innerHTML = `
      <div class="sr-rank">#${card.rank}</div>
      <img src="images/${card.id}.jpg" alt="${card.name}">
      <div class="info">
        <div class="sr-name">${card.name}</div>
      </div>
      <div class="heat-box" style="background: rgb(${rgb.join(",")}); color: ${readableTextColor(rgb)};">
        ${pct}% - ${card.netPicks} Votes
      </div>
      <button class="remove-btn" title="Remove">&times;</button>
    `;
    box.querySelector(".remove-btn").addEventListener("click", () => removeCardFromCompare(card.id));
    trendCardBoxesEl.appendChild(box);
  });
}

async function fetchCardHistory(cardId) {
  const { data, error } = await supabaseClient
    .from("card_event_history_view")
    .select("action, created_at")
    .eq("category", activeCategory)
    .eq("card_id", String(cardId))
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to load card history:", error.message);
    statusEl.textContent = `Trend chart error: ${error.message}`;
    return [];
  }

  let running = 0;
  const points = data.map(row => {
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
  trendTitleEl.textContent = `${activeLabel}: Votes over Time`;

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
      max: "dataMax",
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

async function runSearch() {
  const term = searchBoxEl.value.trim();

  if (term.length < 2) {
    searchResultsEl.innerHTML = "";
    return;
  }

  const { data, error } = await supabaseClient
    .from("card_tally_ranked_view")
    .select("category, card_id, card_name, net_picks, rank")
    .eq("category", activeCategory)
    .ilike("card_name", `%${term}%`)
    .order("card_name")
    .limit(50);

  if (error) {
    searchResultsEl.innerHTML = `<p class="search-empty">Search failed: ${error.message}</p>`;
    return;
  }

  renderSearchResults(data);
}

let searchDebounce = null;
searchBoxEl.addEventListener("input", () => {
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
  heading.textContent = `${label} — ${categoryTotal} Votes`;
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
  const medals = ["1st", "2nd", "3rd"];
  top3.forEach((row, i) => {
    const pct = categoryTotal > 0 ? ((row.net_picks / categoryTotal) * 100).toFixed(2) : "0.00";
    const fraction = globalMax > 0 ? row.net_picks / globalMax : 0;
    const rgb = heatmapColor(fraction);

    const card = document.createElement("div");
    card.className = `podium-card rank-${i + 1}`;
    card.style.cursor = "pointer";
    card.title = "Click to add to trend chart";
    card.innerHTML = `
      <div class="medal">${medals[i]}</div>
      <img src="images/${row.card_id}.jpg" alt="${row.card_name}">
      <div class="pname">${row.card_name}</div>
      <div class="heat-box" style="background: rgb(${rgb.join(",")}); color: ${readableTextColor(rgb)};">
        ${pct}% - ${row.net_picks} Votes
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
      rowEl.innerHTML = `
        <div class="rank">#${rank}</div>
        <img src="images/${row.card_id}.jpg" alt="${row.card_name}">
        <div class="name">${row.card_name}</div>
        <div class="heat-box" style="background: rgb(${rgb.join(",")}); color: ${readableTextColor(rgb)};">
          ${pct}% - ${row.net_picks} Votes
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

  panelEl.innerHTML = "<p class=\"empty\">Loading...</p>";

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

function buildTabs() {
  CATEGORY_ORDER.forEach((cat, i) => {
    const btn = document.createElement("button");
    btn.textContent = cat.label;
    if (i === 0) btn.classList.add("active");
    btn.addEventListener("click", () => {
      tabsEl.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeCategory = cat.key;
      activeLabel = cat.label;
      loadCategory(cat.key, cat.label);
      compareCards = [];
      updateTrendChart();
      if (searchBoxEl.value.trim().length >= 2) runSearch();
    });
    tabsEl.appendChild(btn);
  });
}

async function init() {
  if (!supabaseClient) {
    statusEl.textContent = "Analytics aren't set up yet (missing Supabase URL/key in analytics-v2.js).";
    return;
  }

  statusEl.textContent = "Loading...";

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

    buildTabs();
    await loadCategory(CATEGORY_ORDER[0].key, CATEGORY_ORDER[0].label);

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