// Same category order as the main picker (with Overall moved to the front
// and Tuner moved to sit between Pendulum and Gemini), so results read in
// a left-to-right, top-to-bottom order.
const CATEGORY_ORDER = [
  "OVERALL",
  "NORMAL", "EFFECT", "RITUAL", "FUSION", "SYNCHRO",
  "XYZ", "LINK", "PENDULUM", "TUNER", "GEMINI",
  "TOON", "SPIRIT", "UNION", "FLIP",
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

function createCategoryContainer(category, totalVotes) {
  const card = document.createElement("div");
  card.className = "category-card";

  const heading = document.createElement("h2");
  heading.textContent = `${category} - ${totalVotes} Votes`;
  card.appendChild(heading);

  const body = document.createElement("div");
  body.className = "category-body";
  body.innerHTML = "<p class=\"empty\">Loading...</p>";
  card.appendChild(body);

  categoriesEl.appendChild(card);
  return body;
}

function renderCategory(bodyEl, topRows, categoryTotal, globalMax) {
  bodyEl.innerHTML = "";

  if (topRows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No picks yet.";
    bodyEl.appendChild(empty);
    return;
  }

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
    bodyEl.appendChild(rowEl);
  });
}

async function loadAnalytics() {
  if (!supabaseClient) {
    statusEl.textContent = "Analytics aren't set up yet (missing Supabase URL/key in analytics.js).";
    return;
  }

  statusEl.textContent = "Loading...";

  // Global max (for bar/box color scale) -- just the single highest net_picks
  // value across everything, fetched as one row, not the whole table.
  const { data: maxRows, error: maxError } = await supabaseClient
    .from("card_tally_view")
    .select("net_picks")
    .order("net_picks", { ascending: false })
    .limit(1);

  if (maxError) {
    statusEl.textContent = `Couldn't load analytics: ${maxError.message}`;
    return;
  }
  const globalMax = maxRows.length ? maxRows[0].net_picks : 0;

  // Per-category totals -- only ever 15 rows regardless of traffic, so no
  // risk of this ever getting truncated.
  const { data: totalsData, error: totalsError } = await supabaseClient
    .from("category_totals_view")
    .select("category, total_votes");

  if (totalsError) {
    statusEl.textContent = `Couldn't load analytics: ${totalsError.message}`;
    return;
  }
  const totalsByCategory = {};
  totalsData.forEach(row => { totalsByCategory[row.category] = row.total_votes; });

  // Create every category's container UP FRONT, in the correct order --
  // important because the per-category fetches below run concurrently and
  // resolve in whatever order the network happens to return them, which
  // would otherwise shuffle the categories around on the page.
  const containers = {};
  CATEGORY_ORDER.forEach(category => {
    containers[category] = createCategoryContainer(category, totalsByCategory[category] || 0);
  });

  // Top N rows PER category, fetched as its own small bounded query -- this
  // is the key fix. Fetching everything in one request could silently get
  // truncated by Supabase's row cap once enough distinct cards across all
  // categories had votes; querying one category at a time with its own
  // .limit() means no single request can ever be large enough to hit that
  // cap, no matter how much traffic the site gets.
  await Promise.all(CATEGORY_ORDER.map(async category => {
    const { data, error } = await supabaseClient
      .from("card_tally_view")
      .select("card_id, card_name, net_picks")
      .eq("category", category)
      .order("net_picks", { ascending: false })
      .limit(TOP_N_PER_CATEGORY);

    if (error) {
      console.error(`Failed to load ${category}:`, error.message);
      renderCategory(containers[category], [], 0, globalMax);
      return;
    }

    renderCategory(containers[category], data, totalsByCategory[category] || 0, globalMax);
  }));

  statusEl.textContent = "";
}

loadAnalytics();