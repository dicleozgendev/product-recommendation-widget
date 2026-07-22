const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "demo.html"), "utf8");
const products = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "products.json"), "utf8"));

(async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable" });
  const { window } = dom;
  await new Promise((r) => setTimeout(r, 200));
  const doc = window.document;

  let errorCount = 0;
  const originalError = console.error;
  window.console.error = (...args) => { errorCount++; console.log("CONSOLE ERROR:", ...args); };

  const cards = doc.querySelectorAll(".product-card");
  const report = [];

  for (let i = 0; i < cards.length; i++) {
    try {
      cards[i].dispatchEvent(new window.Event("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 10));
      const panel = doc.getElementById("detail-panel");
      const title = panel.querySelector(".detail-info h2")?.textContent;
      const rows = panel.querySelectorAll(".reco-row");
      const compCount = rows[0]?.querySelectorAll(".reco-card").length ?? 0;
      const compEmpty = rows[0]?.querySelector(".empty-reco") ? true : false;
      const simCount = rows[1]?.querySelectorAll(".reco-card").length ?? 0;
      const simEmpty = rows[1]?.querySelector(".empty-reco") ? true : false;
      report.push({ id: products[i].id, title, compCount: compEmpty ? 0 : compCount, simCount: simEmpty ? 0 : simCount });
    } catch (e) {
      report.push({ id: products[i].id, ERROR: e.message });
    }
  }

  console.log(JSON.stringify(report, null, 2));
  const noCompNoSim = report.filter(r => (r.compCount === 0 && r.simCount === 0));
  console.log("\nProducts with NEITHER complementary NOR similar recs:", noCompNoSim.length, noCompNoSim.map(r=>r.id));
  console.log("Any runtime errors thrown:", report.some(r => r.ERROR));
})();
