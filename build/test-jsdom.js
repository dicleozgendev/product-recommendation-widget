// Headless Chromium crashes in this sandbox (missing system libs, no --with-deps
// available without root). jsdom gives a real DOM + script execution without
// needing a browser binary, which is enough to verify the app LOGIC (data flow,
// cart math, language toggle) even though it can't verify visual layout/CSS.
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "demo.html"), "utf8");

(async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable" });
  const { window } = dom;

  // wait a tick for inline script to run
  await new Promise((r) => setTimeout(r, 200));
  const doc = window.document;

  const results = {};
  results.initialCartCount = doc.getElementById("cart-count").textContent;
  results.productCardCount = doc.querySelectorAll(".product-card").length;

  // Click first product card (Aurora X12 phone, id p1)
  doc.querySelectorAll(".product-card")[0].dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));

  const panel = doc.getElementById("detail-panel");
  results.detailPanelActive = panel.classList.contains("active");
  results.detailTitle = panel.querySelector(".detail-info h2")?.textContent;
  const recoRows = panel.querySelectorAll(".reco-row");
  results.complementaryCount = recoRows[0]?.querySelectorAll(".reco-card").length;
  results.similarCount = recoRows[1]?.querySelectorAll(".reco-card").length;
  results.complementaryTitles = Array.from(recoRows[0]?.querySelectorAll(".reco-card .title") || []).map(e => e.textContent);

  // Add main product
  panel.querySelector(".add-btn").dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  results.cartCountAfterMain = doc.getElementById("cart-count").textContent;
  results.totalMainAfterMain = doc.getElementById("total-main").textContent;

  // Add first AI complementary suggestion
  const firstMiniAdd = panel.querySelectorAll(".reco-row")[0].querySelector(".mini-add");
  firstMiniAdd.dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  results.cartCountAfterAi = doc.getElementById("cart-count").textContent;
  results.totalAiAfterAi = doc.getElementById("total-ai").textContent;
  results.totalGrand = doc.getElementById("total-grand").textContent;
  results.upliftVisible = doc.getElementById("uplift-box").style.display !== "none";
  results.upliftPct = doc.getElementById("uplift-pct").textContent;

  // Toggle language, verify persistence + translation
  doc.getElementById("lang-btn").dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  results.heroTitleEn = doc.getElementById("hero-title").textContent;
  results.cartCountAfterToggle = doc.getElementById("cart-count").textContent;
  results.langBtnLabel = doc.getElementById("lang-btn").textContent;

  console.log(JSON.stringify(results, null, 2));

  const jsErrors = window.__jsErrors || [];
  window.close();
})();

process.on("unhandledRejection", (e) => { console.error("UNHANDLED", e); process.exit(1); });
