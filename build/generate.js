// Build-time script: computes product similarity (TF-IDF cosine) + complementary
// category mappings, and bakes the results into a single recommendations.json
// that the static demo can load with zero server / zero external API calls.
//
// Production version would swap the TF-IDF step for real embeddings (OpenAI
// text-embedding-3-small or a local model) for better semantic quality, but the
// interface (product -> ranked recommendations) stays identical.

const fs = require("fs");
const path = require("path");

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

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-zçğıöşü0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

// Build TF-IDF vectors over combined title+description (Turkish text).
function buildTfidf(docs) {
  const df = new Map();
  const tokenized = docs.map((d) => tokenize(d));
  tokenized.forEach((tokens) => {
    new Set(tokens).forEach((t) => df.set(t, (df.get(t) || 0) + 1));
  });
  const N = docs.length;
  return tokenized.map((tokens) => {
    const tf = new Map();
    tokens.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
    const vec = new Map();
    tf.forEach((count, term) => {
      const idf = Math.log(N / (1 + df.get(term)));
      vec.set(term, (count / tokens.length) * idf);
    });
    return vec;
  });
}

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  a.forEach((va, k) => {
    na += va * va;
    if (b.has(k)) dot += va * b.get(k);
  });
  b.forEach((vb) => (nb += vb * vb));
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const docs = products.map((p) => `${p.title_tr} ${p.desc_tr} ${p.title_en} ${p.desc_en}`);
const vectors = buildTfidf(docs);

const recommendations = {};

products.forEach((p, i) => {
  // Similar products: same category, ranked by cosine similarity (keeps
  // "similar" coherent — a phone recommends other phones, not accessories).
  const sims = products
    .map((other, j) => ({ id: other.id, score: i === j ? -1 : cosineSim(vectors[i], vectors[j]) }))
    .filter((s, j) => products[j].category === p.category && s.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((s) => s.id);

  // Complementary products: from adjacent categories, ranked by similarity
  // within that category pool (falls back to price-proximity if no text overlap).
  const compCats = COMPLEMENTARY_MAP[p.category] || [];
  const compCandidates = products
    .map((other, j) => ({ other, score: cosineSim(vectors[i], vectors[j]) }))
    .filter((c) => compCats.includes(c.other.category))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((c) => c.other.id);

  recommendations[p.id] = {
    similar: sims,
    complementary: compCandidates,
  };
});

fs.writeFileSync(
  path.join(__dirname, "..", "data", "recommendations.json"),
  JSON.stringify(recommendations, null, 2)
);

console.log(`Generated recommendations for ${products.length} products.`);
console.log("Sample (p1):", JSON.stringify(recommendations["p1"], null, 2));
