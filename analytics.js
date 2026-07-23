// Same category order as the main picker, so results read in the same
// left-to-right, top-to-bottom order visitors are used to.
const CATEGORY_ORDER = [
  "NORMAL", "EFFECT", "RITUAL", "FUSION", "SYNCHRO",
  "XYZ", "LINK", "PENDULUM", "GEMINI", "TOON",
  "SPIRIT", "UNION", "FLIP", "TUNER", "OVERALL",
];

const TOP_N_PER_CATEGORY = 8;

// Fill these in -- same project as the main picker.
const SUPABASE_URL = "https://gukihinomsiwmwousjia.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1a2loaW5vbXNpd213b3VzamlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MDQxNjIsImV4cCI6MjEwMDM4MDE2Mn0.9r6K-skI0XJ88MG6xfrmVpc0yGK4-biPVvRXF-ITSRc";

const supabaseClient = SUPABASE_URL.startsWith("http")
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const categoriesEl = document.getElementById("categories");
const statusEl = document.getElementById("status");

// Bar color is on a GLOBAL scale (0 = the least-picked card anywhere,
// 1 = the single most-picked card across all categories), not scaled
// per-category. That's deliberate: a card's rank *within* its own category
// is a different question from its raw popularity magnitude site-wide --
// e.g. the top pick in a category most people never explore might still
// be objectively rare in absolute terms.
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

// Picks black or white text for readability against whatever heatmap
// color lands on that row (yellow/green need dark text, magenta/blue/red
// need light text).
function readableTextColor([r, g, b]) {
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111" : "#fff";
}

function renderCategory(category, topRows, categoryTotal, globalMax) {
  const card = document.createElement("div");
  card.className = "category-card";

  const heading = document.createElement("h2");
  heading.textContent = category;
  card.appendChild(heading);

  if (topRows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No picks yet.";
    card.appendChild(empty);
  } else {
    topRows.forEach(row => {
      const rowEl = document.createElement("div");
      rowEl.className = "row";

      const img = document.createElement("img");
      img.src = `images/${row.card_id}.jpg`;
      img.alt = row.card_name;
      img.loading = "lazy";

      const name = document.createElement("div");
      name.className = "name";
      name.textContent = row.card_name;

      const pct = categoryTotal > 0 ? ((row.net_picks / categoryTotal) * 100).toFixed(2) : "0.00";
      const fraction = globalMax > 0 ? row.net_picks / globalMax : 0;
      const rgb = heatmapColor(fraction);

      const heatBox = document.createElement("div");
      heatBox.className = "heat-box";
      heatBox.style.background = `rgb(${rgb.join(",")})`;
      heatBox.style.color = readableTextColor(rgb);
      heatBox.textContent = `${pct}% - ${row.net_picks} Votes`;

      rowEl.append(img, name, heatBox);
      card.appendChild(rowEl);
    });
  }

  categoriesEl.appendChild(card);
}

async function loadAnalytics() {
  if (!supabaseClient) {
    statusEl.textContent = "Analytics aren't set up yet (missing Supabase URL/key in analytics.js).";
    return;
  }

  statusEl.textContent = "Loading...";

  const { data, error } = await supabaseClient
    .from("card_tally_view")
    .select("category, card_id, card_name, net_picks");

  if (error) {
    statusEl.textContent = `Couldn't load analytics: ${error.message}`;
    return;
  }

  // Group rows by category
  const byCategory = {};
  data.forEach(row => {
    if (!byCategory[row.category]) byCategory[row.category] = [];
    byCategory[row.category].push(row);
  });

  // Global max across every row, in every category -- drives bar COLOR
  const globalMax = data.reduce((max, row) => Math.max(max, row.net_picks), 0);

  CATEGORY_ORDER.forEach(category => {
    const allRows = (byCategory[category] || []).sort((a, b) => b.net_picks - a.net_picks);
    // Percentage is "share of ALL votes cast in this category", so it's
    // computed against every card ever picked here, not just the ones shown.
    const categoryTotal = allRows.reduce((sum, row) => sum + row.net_picks, 0);
    const topRows = allRows.slice(0, TOP_N_PER_CATEGORY);
    renderCategory(category, topRows, categoryTotal, globalMax);
  });

  statusEl.textContent = "";
}

loadAnalytics();