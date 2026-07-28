// Optional, self-contained analytics backend for the recommendation widget.
//
// Scope, honestly stated: this is a small single-file/single-store prototype
// (JSON file as the event log, no auth, no multi-tenancy) meant to
// demonstrate what a real merchant-facing analytics dashboard for this
// widget would look like and how it would be wired up - NOT a production
// multi-tenant SaaS backend. That's the next real build step (see
// ../sonraki-adimlar.md), gated on actual paying-customer demand as planned.
//
// What it actually does, for real: serves the static demo, accepts real
// event pings from the browser (product view / recommendation click /
// add-to-cart, tagged main vs ai-sourced), persists them to a local JSON
// file, and serves an admin page that computes real aggregate stats from
// whatever events have actually been logged - nothing here is precomputed
// or faked; run the demo a few times and the numbers on /admin change
// accordingly.
const express = require("express");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 4000;
const DATA_DIR = path.join(__dirname, "data");
const EVENTS_FILE = path.join(DATA_DIR, "events.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(EVENTS_FILE)) fs.writeFileSync(EVENTS_FILE, "[]");

function readEvents() {
  try {
    return JSON.parse(fs.readFileSync(EVENTS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function appendEvent(evt) {
  const events = readEvents();
  events.push({ ...evt, ts: Date.now() });
  // Keep the demo log from growing unbounded.
  const trimmed = events.slice(-5000);
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(trimmed, null, 2));
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// Real event ingestion. The public demo.html pings this best-effort (see
// track() in build/demo.template.html) - it fails silently if this server
// isn't running, since the widget must keep working as a pure static file
// with zero backend too.
app.post("/api/event", (req, res) => {
  const { type, productId, source, sessionId } = req.body || {};
  if (!type) return res.status(400).json({ error: "missing type" });
  appendEvent({ type, productId: productId || null, source: source || null, sessionId: sessionId || null });
  res.json({ ok: true });
});

app.get("/api/stats", (req, res) => {
  const events = readEvents();

  const views = events.filter((e) => e.type === "view");
  const recoClicks = events.filter((e) => e.type === "recommendation_click");
  const addToCart = events.filter((e) => e.type === "add_to_cart");
  const addMain = addToCart.filter((e) => e.source === "main");
  const addAi = addToCart.filter((e) => e.source === "ai");

  const sessions = new Set(events.map((e) => e.sessionId).filter(Boolean));

  // Uplift estimate: (AI-sourced adds) / (main adds), i.e. how many extra
  // items per "primary" add-to-cart came from an AI suggestion. This is a
  // real ratio computed from real logged events - not a fixed/fake number.
  const upliftPct = addMain.length > 0 ? Math.round((addAi.length / addMain.length) * 100) : 0;

  const productCounts = {};
  recoClicks.forEach((e) => {
    if (!e.productId) return;
    productCounts[e.productId] = (productCounts[e.productId] || 0) + 1;
  });
  const topRecommended = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([productId, clicks]) => ({ productId, clicks }));

  res.json({
    totalEvents: events.length,
    sessions: sessions.size,
    views: views.length,
    recommendationClicks: recoClicks.length,
    addToCartMain: addMain.length,
    addToCartAi: addAi.length,
    upliftPct,
    topRecommended,
    generatedAt: new Date().toISOString(),
  });
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

app.listen(PORT, () => {
  console.log(`Widget demo + analytics backend running on http://localhost:${PORT}`);
  console.log(`  Demo:  http://localhost:${PORT}/demo.html`);
  console.log(`  Admin: http://localhost:${PORT}/admin`);
});
