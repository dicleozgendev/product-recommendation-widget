// Multi-tenant store management for the script-tag widget prototype.
//
// Honest scope note: this persists each store as a few JSON files on local
// disk (server/stores/<storeId>/*.json) and gates catalog uploads with a
// single API key generated at store-creation time. That is enough to prove
// the real end-to-end flow (create store -> upload CSV -> get a script tag
// -> real recommendations served to a real embedded widget) and enough for
// a handful of pilot merchants. It is NOT a production-grade multi-tenant
// SaaS backend: no real database, no key rotation/revocation UI. Rate
// limiting (server/index.js) and optional per-store CORS origin locking
// (the `allowedOrigin` field below) ARE in place, at prototype-appropriate
// strength — real engineering work still remains for once there are paying
// customers to justify a full production hardening pass — see next-steps.md.
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const { computeRecommendations } = require("./reco-engine");

const STORES_DIR = path.join(__dirname, "stores");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
ensureDir(STORES_DIR);

function storeDir(storeId) {
  return path.join(STORES_DIR, storeId);
}

function metaPath(storeId) {
  return path.join(storeDir(storeId), "meta.json");
}

function productsPath(storeId) {
  return path.join(storeDir(storeId), "products.json");
}

function recommendationsPath(storeId) {
  return path.join(storeDir(storeId), "recommendations.json");
}

function eventsPath(storeId) {
  return path.join(storeDir(storeId), "events.json");
}

function generateId(prefix, bytes = 8) {
  return `${prefix}_${crypto.randomBytes(bytes).toString("hex")}`;
}

/**
 * Creates a new store record with a fresh id + API key. Returns both — the
 * API key is only ever returned here, at creation time (like most real API
 * key systems), so the caller (the merchant onboarding this widget) must
 * save it immediately.
 *
 * @param {string} [name]
 * @param {string} [allowedOrigin] - e.g. "https://mystore.com". If set, the
 *   public recommendations endpoint only allows cross-origin reads from this
 *   exact origin (see the CORS middleware in server/index.js). If omitted,
 *   the endpoint stays open to any origin — simpler for testing/demos, but
 *   real merchants should set this once they know their site's domain.
 */
function createStore(name, allowedOrigin) {
  const storeId = generateId("store", 6);
  const apiKey = generateId("key", 20);
  ensureDir(storeDir(storeId));

  const meta = {
    storeId,
    apiKeyHash: crypto.createHash("sha256").update(apiKey).digest("hex"),
    name: name || "Unnamed store",
    allowedOrigin: allowedOrigin || null,
    createdAt: new Date().toISOString(),
    productCount: 0,
  };
  fs.writeFileSync(metaPath(storeId), JSON.stringify(meta, null, 2));
  fs.writeFileSync(productsPath(storeId), "[]");
  fs.writeFileSync(recommendationsPath(storeId), "{}");

  return { storeId, apiKey };
}

function loadMeta(storeId) {
  try {
    return JSON.parse(fs.readFileSync(metaPath(storeId), "utf8"));
  } catch {
    return null;
  }
}

function storeExists(storeId) {
  return fs.existsSync(metaPath(storeId));
}

/** Verifies an API key against the store's stored hash (never compares plaintext keys, never stores them in plaintext). */
function verifyApiKey(storeId, apiKey) {
  const meta = loadMeta(storeId);
  if (!meta || !apiKey) return false;
  const hash = crypto.createHash("sha256").update(apiKey).digest("hex");
  // Constant-time comparison to avoid leaking hash content via timing.
  const a = Buffer.from(hash);
  const b = Buffer.from(meta.apiKeyHash);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function loadProducts(storeId) {
  try {
    return JSON.parse(fs.readFileSync(productsPath(storeId), "utf8"));
  } catch {
    return [];
  }
}

function loadRecommendations(storeId) {
  try {
    return JSON.parse(fs.readFileSync(recommendationsPath(storeId), "utf8"));
  } catch {
    return {};
  }
}

/**
 * Replaces a store's product catalog and recomputes recommendations for it
 * using the shared reco-engine. This is the operation a real merchant
 * triggers by re-uploading their CSV (e.g. after adding new products).
 */
function setProducts(storeId, products) {
  const meta = loadMeta(storeId);
  if (!meta) throw new Error("Store not found");

  const { recommendations } = computeRecommendations(products);

  fs.writeFileSync(productsPath(storeId), JSON.stringify(products, null, 2));
  fs.writeFileSync(recommendationsPath(storeId), JSON.stringify(recommendations, null, 2));

  meta.productCount = products.length;
  meta.updatedAt = new Date().toISOString();
  fs.writeFileSync(metaPath(storeId), JSON.stringify(meta, null, 2));

  return { productCount: products.length };
}

function getProductRecommendations(storeId, productId) {
  const products = loadProducts(storeId);
  const recs = loadRecommendations(storeId);
  const rec = recs[productId];
  if (!rec) return null;

  const byId = new Map(products.map((p) => [p.id, p]));
  const similar = rec.similar.slice(0, rec.similarDisplay ?? 4).map((id) => byId.get(id)).filter(Boolean);
  const complementary = rec.complementary.slice(0, rec.complementaryDisplay ?? 3).map((id) => byId.get(id)).filter(Boolean);

  return { similar, complementary };
}

function appendEvent(storeId, evt) {
  const file = eventsPath(storeId);
  let events = [];
  try {
    events = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    events = [];
  }
  events.push({ ...evt, ts: Date.now() });
  // Keep the per-store log from growing unbounded (prototype-scale cap).
  const trimmed = events.slice(-5000);
  fs.writeFileSync(file, JSON.stringify(trimmed, null, 2));
}

function readEvents(storeId) {
  try {
    return JSON.parse(fs.readFileSync(eventsPath(storeId), "utf8"));
  } catch {
    return [];
  }
}

/** Same real (not fabricated) aggregate stats logic as the single-store admin panel, scoped per store. */
function computeStats(storeId) {
  const events = readEvents(storeId);

  const views = events.filter((e) => e.type === "view");
  const recoClicks = events.filter((e) => e.type === "recommendation_click");
  const addToCart = events.filter((e) => e.type === "add_to_cart");
  const addMain = addToCart.filter((e) => e.source === "main");
  const addAi = addToCart.filter((e) => e.source === "ai");
  const sessions = new Set(events.map((e) => e.sessionId).filter(Boolean));
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

  return {
    totalEvents: events.length,
    sessions: sessions.size,
    views: views.length,
    recommendationClicks: recoClicks.length,
    addToCartMain: addMain.length,
    addToCartAi: addAi.length,
    upliftPct,
    topRecommended,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  createStore,
  loadMeta,
  storeExists,
  verifyApiKey,
  loadProducts,
  loadRecommendations,
  setProducts,
  getProductRecommendations,
  appendEvent,
  readEvents,
  computeStats,
};
