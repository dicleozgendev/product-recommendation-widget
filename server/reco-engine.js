// Shared recommendation engine: TF-IDF (with bigrams + light Turkish
// suffix-stripping) reduced to a low-dimensional "latent semantic" space via
// truncated SVD (classic Latent Semantic Analysis / LSA), then cosine
// similarity + a category-adjacency rule for "frequently bought together".
//
// This is the exact logic that used to live only in build/generate.js
// (which bakes ONE fixed catalog into the static demo.html at build time).
// It's now a reusable module so the multi-tenant script-tag backend
// (server/stores.js) can run the same, already-tested computation on
// whatever product catalog a real store uploads, on demand.
//
// Not a neural embedding model (no OpenAI/Claude call) — see the comment in
// build/generate.js for why. Swapping in a neural embedding model later only
// requires changing the `embed()` function; the rest (SVD projection, cosine
// similarity, category rule) stays the same.
const { Matrix, SVD } = require("ml-matrix");

// Default category adjacency map used when a store doesn't supply its own.
// This is tuned for the demo electronics/accessories catalog — a real store
// in a different vertical (clothing, groceries, furniture...) would need its
// own map, since "frequently bought together" categories are business-
// specific knowledge, not something derivable from product text alone.
const DEFAULT_COMPLEMENTARY_MAP = {
  telefon: ["kilif", "ekran_koruyucu", "sarj", "kulaklik", "powerbank"],
  kilif: ["telefon", "ekran_koruyucu"],
  ekran_koruyucu: ["telefon", "kilif"],
  sarj: ["telefon", "powerbank", "kablo"],
  kulaklik: ["telefon", "sarj"],
  powerbank: ["telefon", "kablo", "sarj"],
  laptop: ["laptop_aksesuar", "usb"],
  laptop_aksesuar: ["laptop", "usb"],
  saat: ["saat_aksesuar"],
  saat_aksesuar: ["saat"],
  hoparlor: ["kablo"],
  kamera: ["kamera_aksesuar"],
  kamera_aksesuar: ["kamera"],
  tablet: ["tablet_aksesuar", "usb"],
  tablet_aksesuar: ["tablet"],
  oyun: ["oyun_aksesuar"],
  oyun_aksesuar: ["oyun"],
  usb: ["laptop", "tablet"],
  kablo: ["sarj", "powerbank"],
};

const STOPWORDS = new Set([
  "ve", "ile", "için", "bir", "bu", "the", "for", "with", "and", "a", "of",
  "inch", "inç",
]);

const TR_SUFFIXES = [
  "lardan", "lerden", "larla", "lerle", "ların", "lerin",
  "dan", "den", "tan", "ten", "nın", "nin", "nun", "nün",
  "ın", "in", "un", "ün", "lar", "ler", "la", "le", "sı", "si",
  "su", "sü", "u", "i", "ı",
];

function stem(token) {
  if (token.length <= 4) return token;
  for (const suf of TR_SUFFIXES) {
    if (token.length - suf.length >= 3 && token.endsWith(suf)) {
      return token.slice(0, token.length - suf.length);
    }
  }
  return token;
}

function tokenize(text) {
  const words = (text || "")
    .toLowerCase()
    .replace(/[^a-zçğıöşü0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
  const bigrams = [];
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.push(`${words[i]}_${words[i + 1]}`);
  }
  return words.concat(bigrams);
}

function buildTfidfMatrix(docsTokens) {
  const df = new Map();
  docsTokens.forEach((tokens) => {
    new Set(tokens).forEach((t) => df.set(t, (df.get(t) || 0) + 1));
  });
  const vocab = Array.from(df.keys());
  const vocabIndex = new Map(vocab.map((t, i) => [t, i]));
  const N = docsTokens.length;

  const rows = docsTokens.map((tokens) => {
    const tf = new Map();
    tokens.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
    const row = new Array(vocab.length).fill(0);
    tf.forEach((count, term) => {
      const idf = Math.log(N / (1 + df.get(term))) + 1;
      row[vocabIndex.get(term)] = (count / (tokens.length || 1)) * idf;
    });
    return row;
  });

  return { rows, vocab };
}

function embed(docsTokens) {
  const { rows } = buildTfidfMatrix(docsTokens);
  const tfidf = new Matrix(rows);

  const maxRank = Math.min(tfidf.rows, tfidf.columns) - 1;
  const k = Math.max(1, Math.min(20, maxRank));

  if (k < 1 || tfidf.rows < 2) {
    // Degenerate case: 0 or 1 product, or an empty vocabulary. SVD isn't
    // meaningful here — return zero vectors so callers still get a
    // well-formed (if empty) result instead of a crash.
    return rows.map(() => [0]);
  }

  const svd = new SVD(tfidf.transpose(), { computeLeftSingularVectors: true, computeRightSingularVectors: true });
  const V = svd.rightSingularVectors.to2DArray();
  const S = svd.diagonal;

  return rows.map((_, docIdx) =>
    S.slice(0, k).map((s, dim) => (V[docIdx]?.[dim] || 0) * s)
  );
}

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const SIMILAR_DISPLAY = 4;
const SIMILAR_CANDIDATE_POOL = 7;
const COMPLEMENTARY_DISPLAY = 3;
const COMPLEMENTARY_CANDIDATE_POOL = 5;

/**
 * Computes similar + complementary product recommendations for an entire
 * catalog. Pure function: given the same products (and complementary map),
 * always returns the same result — makes it easy to test and to re-run
 * whenever a store re-uploads its catalog.
 *
 * @param {Array<{id, category, title_tr, title_en, desc_tr, desc_en}>} products
 * @param {Object} [complementaryMap] category -> array of complementary categories
 * @returns {{ recommendations: Object, vectors: Object }}
 */
function computeRecommendations(products, complementaryMap) {
  const compMap = complementaryMap || DEFAULT_COMPLEMENTARY_MAP;

  if (!Array.isArray(products) || products.length === 0) {
    return { recommendations: {}, vectors: {} };
  }

  const docs = products.map((p) => `${p.title_tr || ""} ${p.desc_tr || ""} ${p.title_en || ""} ${p.desc_en || ""}`);
  const docsTokens = docs.map(tokenize);
  const vectors = embed(docsTokens);

  const recommendations = {};
  products.forEach((p, i) => {
    const sims = products
      .map((other, j) => ({ id: other.id, score: i === j ? -1 : cosineSim(vectors[i], vectors[j]) }))
      .filter((s, j) => products[j].category === p.category && s.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, SIMILAR_CANDIDATE_POOL)
      .map((s) => s.id);

    const compCats = compMap[p.category] || [];
    const compCandidates = products
      .map((other, j) => ({ other, score: cosineSim(vectors[i], vectors[j]) }))
      .filter((c) => compCats.includes(c.other.category))
      .sort((a, b) => b.score - a.score)
      .slice(0, COMPLEMENTARY_CANDIDATE_POOL)
      .map((c) => c.other.id);

    recommendations[p.id] = {
      similar: sims,
      complementary: compCandidates,
      similarDisplay: SIMILAR_DISPLAY,
      complementaryDisplay: COMPLEMENTARY_DISPLAY,
    };
  });

  const vectorsOut = {};
  products.forEach((p, i) => {
    vectorsOut[p.id] = vectors[i].map((v) => Math.round(v * 1e5) / 1e5);
  });

  return { recommendations, vectors: vectorsOut };
}

module.exports = {
  DEFAULT_COMPLEMENTARY_MAP,
  tokenize,
  cosineSim,
  computeRecommendations,
};
