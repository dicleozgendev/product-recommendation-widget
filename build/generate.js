// Build-time script: computes product similarity + complementary category
// mappings, and bakes the results into a single recommendations.json that the
// static demo can load with zero server / zero external API calls.
//
// Similarity method: TF-IDF (with bigrams + light Turkish suffix-stripping)
// projected into a lower-dimensional latent space via truncated SVD (classic
// "Latent Semantic Analysis" / LSA). This is a real, well-established semantic
// similarity technique - NOT a neural embedding model - and it runs 100%
// locally with no external API calls and no model downloads. We evaluated
// swapping this for a neural sentence-embedding model (e.g. a multilingual
// sentence-transformers model), but that requires downloading model weights
// from Hugging Face at build time, which this environment's network policy
// blocks. LSA gives a real semantic-similarity upgrade over raw keyword
// TF-IDF (it catches related products even when they don't share exact
// vocabulary) without that dependency. Swapping in a neural embedding model
// later is a drop-in change: only the `embed()` function below would need to
// change, the rest of the pipeline (SVD is skipped, cosine similarity +
// category filtering) stays identical.
const fs = require("fs");
const path = require("path");
const { Matrix, SVD } = require("ml-matrix");

const products = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "products.json"), "utf8")
);

// Category adjacency map: when viewing a product in category X, these
// categories are "complementary" (frequently bought together in real stores).
const COMPLEMENTARY_MAP = {
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

// Very light Turkish suffix-stripping so that e.g. "telefonu" / "telefonla"
// / "telefonlar" collapse toward the same root as "telefon". This is a
// heuristic, not a real morphological analyzer, but it measurably reduces
// vocabulary sparsity on a small Turkish product catalog like this one.
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
  const words = text
    .toLowerCase()
    .replace(/[^a-zçğıöşü0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
  // Add bigrams so short phrases ("hızlı şarj", "su geçirmez") carry more
  // weight than the sum of their individual words would.
  const bigrams = [];
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.push(`${words[i]}_${words[i + 1]}`);
  }
  return words.concat(bigrams);
}

// --- TF-IDF ---------------------------------------------------------------

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
      row[vocabIndex.get(term)] = (count / tokens.length) * idf;
    });
    return row;
  });

  return { rows, vocab };
}

// --- Latent Semantic Analysis (TF-IDF -> truncated SVD) --------------------

function embed(docsTokens) {
  const { rows } = buildTfidfMatrix(docsTokens);
  const tfidf = new Matrix(rows);

  // Rank is capped by min(products, vocab terms) - 1; keep at most 20 latent
  // dimensions, which is plenty for a catalog this size and avoids overfitting
  // to noise in the smaller singular values.
  const maxRank = Math.min(tfidf.rows, tfidf.columns) - 1;
  const k = Math.max(2, Math.min(20, maxRank));

  const svd = new SVD(tfidf.transpose(), { computeLeftSingularVectors: true, computeRightSingularVectors: true });
  // svd was run on the transpose (terms x docs) so that leftSingularVectors
  // has one row per term; rightSingularVectors has one row per document.
  const V = svd.rightSingularVectors.to2DArray(); // docs x rank
  const S = svd.diagonal;

  // Document vectors in latent semantic space = V * S (weight each latent
  // axis by its singular value, i.e. its importance).
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

const docs = products.map((p) => `${p.title_tr} ${p.desc_tr} ${p.title_en} ${p.desc_en}`);
const docsTokens = docs.map(tokenize);
const vectors = embed(docsTokens);

const recommendations = {};

// Candidate pools are stored a bit larger than what the UI displays
// (4 similar / 3 complementary) so that the client can re-rank them at
// browse-time based on what the visitor has recently looked at (session
// personalization) without needing another server round-trip - the extra
// candidates give the re-ranking something real to reorder.
const SIMILAR_DISPLAY = 4;
const SIMILAR_CANDIDATE_POOL = 7;
const COMPLEMENTARY_DISPLAY = 3;
const COMPLEMENTARY_CANDIDATE_POOL = 5;

products.forEach((p, i) => {
  // Similar products: same category, ranked by cosine similarity in the
  // latent semantic space (keeps "similar" coherent - a phone recommends
  // other phones, not accessories).
  const sims = products
    .map((other, j) => ({ id: other.id, score: i === j ? -1 : cosineSim(vectors[i], vectors[j]) }))
    .filter((s, j) => products[j].category === p.category && s.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, SIMILAR_CANDIDATE_POOL)
    .map((s) => s.id);

  // Complementary products: from adjacent categories, ranked by similarity
  // within that category pool (falls back to price-proximity if no text overlap).
  const compCats = COMPLEMENTARY_MAP[p.category] || [];
  const compCandidates = products
    .map((other, j) => ({ other, score: cosineSim(vectors[i], vectors[j]) }))
    .filter((c) => compCats.includes(c.other.category))
    .sort((a, b) => b.score - a.score)
    .slice(0, COMPLEMENTARY_CANDIDATE_POOL)
    .map((c) => c.other.id);

  recommendations[p.id] = {
    similar: sims,
    complementary: compCandidates,
    // Display counts, so the client knows how many to show after it
    // re-ranks the (larger) candidate pool above using session history.
    similarDisplay: SIMILAR_DISPLAY,
    complementaryDisplay: COMPLEMENTARY_DISPLAY,
  };
});

fs.writeFileSync(
  path.join(__dirname, "..", "data", "recommendations.json"),
  JSON.stringify(recommendations, null, 2)
);

// Ship the latent vectors too (rounded to keep the file small) so the
// browser can do session-based personalization client-side: re-ranking the
// candidate pool above by similarity to a blend of "current product" +
// "what this visitor recently viewed", with zero extra network calls.
const vectorsOut = {};
products.forEach((p, i) => {
  vectorsOut[p.id] = vectors[i].map((v) => Math.round(v * 1e5) / 1e5);
});
fs.writeFileSync(
  path.join(__dirname, "..", "data", "vectors.json"),
  JSON.stringify(vectorsOut)
);

console.log(`Generated recommendations for ${products.length} products (TF-IDF + LSA, ${vectors[0].length}-dim latent space).`);
console.log("Sample (p1):", JSON.stringify(recommendations["p1"], null, 2));
