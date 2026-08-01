// Onboarding-flow prototype: what step 1 + 2 of next-steps.md actually look
// like end-to-end. Run this against a live server (`npm run server` in
// another terminal) to:
//   1. Create a real store (POST /api/stores)
//   2. Upload a real CSV catalog for it (POST /api/stores/:id/products)
//   3. Print the ready-to-paste <script> embed AND a URL that shows it
//      running on a fake third-party page (server/merchant-example.template.html)
//
// This is the actual mechanism a real pilot merchant would go through
// (manually, for now — there's no signup UI yet, see README.md).
const fs = require("fs");
const path = require("path");

const BASE = process.env.API_BASE || "http://localhost:4000";
const CSV_PATH = process.argv[2] || path.join(__dirname, "..", "data", "products.csv");

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH}`);
    process.exit(1);
  }
  const csvText = fs.readFileSync(CSV_PATH, "utf8");

  console.log(`Creating store against ${BASE} ...`);
  const createRes = await fetch(`${BASE}/api/stores`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Demo Merchant" }),
  });
  if (!createRes.ok) {
    console.error("Failed to create store:", createRes.status, await createRes.text());
    process.exit(1);
  }
  const { storeId, apiKey } = await createRes.json();
  console.log(`Store created: ${storeId}`);

  console.log(`Uploading ${path.basename(CSV_PATH)} ...`);
  const uploadRes = await fetch(`${BASE}/api/stores/${storeId}/products`, {
    method: "POST",
    headers: { "Content-Type": "text/csv", "x-api-key": apiKey },
    body: csvText,
  });
  const uploadBody = await uploadRes.json();
  if (!uploadRes.ok) {
    console.error("Failed to upload catalog:", uploadRes.status, uploadBody);
    process.exit(1);
  }
  console.log(`Catalog uploaded: ${uploadBody.productCount} products.`);
  if (uploadBody.warnings && uploadBody.warnings.length) {
    console.log("Warnings while parsing CSV:", uploadBody.warnings);
  }

  const snippet = [
    `<div id="ai-reco"></div>`,
    `<script src="${BASE}/widget.js"`,
    `        data-store-id="${storeId}"`,
    `        data-product-id="p1"`,
    `        data-container="ai-reco"`,
    `        data-lang="tr"></script>`,
  ].join("\n");

  console.log("\n=== Ready ===");
  console.log(`storeId: ${storeId}`);
  console.log(`apiKey (save this, it's shown only once): ${apiKey}`);
  console.log("\nPaste this into any product page on a real store:\n");
  console.log(snippet);
  console.log(`\nOr see it running on a fake third-party page right now:\n${BASE}/merchant-example.html?store=${storeId}&product=p1`);
  console.log(
    "\nNote: this demo store is open to any origin (no allowedOrigin set). " +
      'For a real merchant, pass one when creating the store: POST /api/stores { "name": "...", "allowedOrigin": "https://theirdomain.com" } ' +
      "to lock the recommendations endpoint to just their site."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
