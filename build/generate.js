// Build-time script: computes product similarity + complementary category
// mappings, and bakes the results into a single recommendations.json that the
// static demo can load with zero server / zero external API calls.
//
// The actual similarity computation (TF-IDF + LSA + cosine similarity +
// category rule) now lives in ../server/reco-engine.js so the exact same,
// tested logic is shared between this static single-catalog build and the
// multi-tenant script-tag backend (server/stores.js), which runs it on
// whatever catalog a real store uploads.
const fs = require("fs");
const path = require("path");
const { computeRecommendations } = require("../server/reco-engine");

const products = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "products.json"), "utf8")
);

const { recommendations, vectors } = computeRecommendations(products);

fs.writeFileSync(
  path.join(__dirname, "..", "data", "recommendations.json"),
  JSON.stringify(recommendations, null, 2)
);

// Ship the latent vectors too (already rounded by computeRecommendations) so
// the browser can do session-based personalization client-side: re-ranking
// the candidate pool above by similarity to a blend of "current product" +
// "what this visitor recently viewed", with zero extra network calls.
fs.writeFileSync(
  path.join(__dirname, "..", "data", "vectors.json"),
  JSON.stringify(vectors)
);

const firstDim = Object.values(vectors)[0]?.length || 0;
console.log(`Generated recommendations for ${products.length} products (TF-IDF + LSA, ${firstDim}-dim latent space).`);
console.log("Sample (p1):", JSON.stringify(recommendations["p1"], null, 2));
