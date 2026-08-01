// Backend for the recommendation widget. Two things live here:
//
// 1. The original single-store analytics prototype (/api/event, /api/stats,
//    /admin) behind the all-in-one public/demo.html - unchanged, still a
//    JSON-file, no-auth, single-tenant demo of what a merchant analytics
//    dashboard would look like.
//
// 2. A real multi-tenant script-tag API (/api/stores/*, see server/stores.js)
//    that a real embeddable widget (public/widget.js) can call from an
//    arbitrary third-party storefront: create a store, upload a CSV catalog,
//    get real per-product recommendations back over HTTP.
//
// Honest scope note (see server/stores.js for the long version): this is a
// working prototype-grade multi-tenant backend - JSON files on local disk,
// one API key per store, no billing, no per-domain CORS allow-listing yet.
// Good enough to onboard a handful of real pilot stores and prove the whole
// loop works; not yet a scaled production SaaS backend.
const express = require("express");
const fs = require("fs");
const path = require("path");
const stores = require("./stores");
const { parseProductsCsv } = require("./csv");

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

// --- Multi-tenant script-tag widget API ------------------------------------
// These /api/stores/* routes are what a real embedded widget.js on a real
// merchant's site talks to (see public/widget.js). CORS is wide open here
// on purpose for this prototype, since the whole point is to be called from
// an arbitrary third-party domain (the merchant's storefront) - a real
// production version would allow-list each store's registered domain(s)
// instead of "*", to stop other sites from scraping a store's catalog data
// through this endpoint.
app.use("/api/stores", (req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

function requireApiKey(req, res, next) {
  const { storeId } = req.params;
  const apiKey = req.header("x-api-key");
  if (!stores.storeExists(storeId)) return res.status(404).json({ error: "store not found" });
  if (!stores.verifyApiKey(storeId, apiKey)) return res.status(401).json({ error: "invalid or missing x-api-key" });
  next();
}

// Create a new store. In a real product this would sit behind a signup/
// login flow with its own auth; here it's intentionally open so the whole
// create -> upload -> embed loop can be tested end-to-end without building
// a merchant dashboard first. The apiKey is only ever returned in this one
// response - store it now, there is no "forgot my key" recovery endpoint.
app.post("/api/stores", (req, res) => {
  const { name } = req.body || {};
  const { storeId, apiKey } = stores.createStore(name);
  res.json({ storeId, apiKey });
});

// Upload/replace a store's product catalog via CSV (raw text body,
// Content-Type: text/csv or text/plain). Recomputes recommendations
// synchronously - fine at prototype scale (hundreds/low thousands of
// products); a real production version would move this to a background job
// for very large catalogs so the HTTP request doesn't hang.
app.post(
  "/api/stores/:storeId/products",
  express.text({ type: ["text/csv", "text/plain"], limit: "5mb" }),
  requireApiKey,
  (req, res) => {
    const csvText = typeof req.body === "string" ? req.body : "";
    if (!csvText.trim()) {
      return res.status(400).json({ error: "empty request body - send the CSV as raw text with Content-Type: text/csv" });
    }
    const { products, errors } = parseProductsCsv(csvText);
    if (products.length === 0) {
      return res.status(400).json({ error: "no valid products parsed", details: errors });
    }
    const result = stores.setProducts(req.params.storeId, products);
    res.json({ ...result, warnings: errors });
  }
);

app.get("/api/stores/:storeId/products", (req, res) => {
  if (!stores.storeExists(req.params.storeId)) return res.status(404).json({ error: "store not found" });
  res.json(stores.loadProducts(req.params.storeId));
});

// Public (no API key) - this is what widget.js calls from the merchant's
// live storefront pages, so it must be callable cross-origin without a
// secret embedded in client-side JS (an API key in front-end JS wouldn't be
// secret anyway - anyone viewing page source would see it).
app.get("/api/stores/:storeId/products/:productId/recommendations", (req, res) => {
  const { storeId, productId } = req.params;
  if (!stores.storeExists(storeId)) return res.status(404).json({ error: "store not found" });
  const result = stores.getProductRecommendations(storeId, productId);
  if (!result) return res.json({ similar: [], complementary: [] });
  res.json(result);
});

app.post("/api/stores/:storeId/events", (req, res) => {
  const { storeId } = req.params;
  if (!stores.storeExists(storeId)) return res.status(404).json({ error: "store not found" });
  const { type, productId, source, sessionId } = req.body || {};
  if (!type) return res.status(400).json({ error: "missing type" });
  stores.appendEvent(storeId, { type, productId: productId || null, source: source || null, sessionId: sessionId || null });
  res.json({ ok: true });
});

app.get("/api/stores/:storeId/stats", requireApiKey, (req, res) => {
  res.json(stores.computeStats(req.params.storeId));
});

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

// Renders a fake third-party merchant product page that embeds widget.js
// exactly the way a real store would - real proof the script-tag actually
// works cross-site, not just inside our own polished demo.html. The store
// and product come from query params so `node server/create-demo-store.js`
// (run against a live server) can print a ready-to-open URL after it
// creates a real store and uploads a real catalog.
app.get("/merchant-example.html", (req, res) => {
  const storeId = req.query.store;
  const productId = req.query.product || "p1";
  const lang = req.query.lang === "en" ? "en" : "tr";
  const apiBase = `${req.protocol}://${req.get("host")}`;

  if (!storeId || !stores.storeExists(storeId)) {
    res.status(200).send(`<!DOCTYPE html><html lang="tr"><body style="font-family:-apple-system,sans-serif;max-width:640px;margin:60px auto;line-height:1.6;">
      <h2>Önce bir mağaza oluştur / Create a store first</h2>
      <p>Bu sayfa, script-tag widget'ının gerçek bir üçüncü taraf mağaza sitesinde nasıl çalıştığını gösterir, ama önce gerçek bir mağaza kaydı ve ürün kataloğu gerekiyor.</p>
      <p>Çalıştır: <code>node server/create-demo-store.js</code> (sunucu ayaktayken) — bu sana açman gereken tam URL'yi verecek.</p>
      <p><em>This page demonstrates the script-tag widget on a real third-party store, but needs a real store + catalog first. Run <code>node server/create-demo-store.js</code> while the server is up — it will print the exact URL to open.</em></p>
      </body></html>`);
    return;
  }

  const products = stores.loadProducts(storeId);
  const product = products.find((p) => p.id === productId) || products[0];

  const template = fs.readFileSync(path.join(__dirname, "merchant-example.template.html"), "utf8");
  const title = product ? (lang === "en" ? product.title_en : product.title_tr) : "(product not found)";
  const desc = product ? (lang === "en" ? product.desc_en : product.desc_tr) : "";
  const price = product ? `₺${Number(product.price).toLocaleString("tr-TR")}` : "";
  const emoji = product?.img && product.img.length <= 4 ? product.img : "🛍️";

  const html = template
    .replaceAll("__STORE_ID__", storeId)
    .replaceAll("__PRODUCT_ID__", product ? product.id : productId)
    .replaceAll("__LANG__", lang)
    .replaceAll("__API_BASE__", apiBase)
    .replaceAll("__PRODUCT_TITLE__", title)
    .replaceAll("__PRODUCT_DESC__", desc)
    .replaceAll("__PRODUCT_PRICE__", price)
    .replaceAll("__PRODUCT_EMOJI__", emoji);

  res.send(html);
});

app.listen(PORT, () => {
  console.log(`Widget demo + analytics backend running on http://localhost:${PORT}`);
  console.log(`  Demo:  http://localhost:${PORT}/demo.html`);
  console.log(`  Admin: http://localhost:${PORT}/admin`);
});
