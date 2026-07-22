const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const os = require("os");
  const execPath = path.join(os.homedir(), ".cache/ms-playwright/chromium-1228/chrome-linux/chrome");
  const browser = await chromium.launch({ executablePath: execPath, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

  const filePath = "file://" + path.join(__dirname, "..", "public", "demo.html");
  await page.goto(filePath);

  // 1. Initial state
  const initialCount = await page.textContent("#cart-count");
  console.log("Initial cart count:", initialCount);

  // 2. Click first product (Aurora X12 phone)
  await page.click(".product-card >> nth=0");
  const detailVisible = await page.isVisible("#detail-panel.active");
  console.log("Detail panel visible after click:", detailVisible);

  const complementaryCount = await page.locator(".reco-row").nth(0).locator(".reco-card").count();
  const similarCount = await page.locator(".reco-row").nth(1).locator(".reco-card").count();
  console.log("Complementary cards shown:", complementaryCount);
  console.log("Similar cards shown:", similarCount);

  // 3. Add main product to cart
  await page.click(".detail-panel.active .add-btn");
  console.log("Cart count after adding main product:", await page.textContent("#cart-count"));

  // 4. Add a complementary (AI) suggestion to cart
  await page.click(".reco-row >> nth=0 >> .mini-add >> nth=0");
  console.log("Cart count after adding AI suggestion:", await page.textContent("#cart-count"));

  const totalMain = await page.textContent("#total-main");
  const totalAi = await page.textContent("#total-ai");
  const totalGrand = await page.textContent("#total-grand");
  console.log("Totals -> main:", totalMain, "| ai:", totalAi, "| grand:", totalGrand);

  const upliftVisible = await page.isVisible("#uplift-box");
  const upliftText = upliftVisible ? await page.textContent("#uplift-box") : null;
  console.log("Uplift box visible:", upliftVisible, "| text:", upliftText?.trim());

  // 5. Toggle language to EN and verify text changes
  await page.click("#lang-btn");
  const heroEn = await page.textContent("#hero-title");
  console.log("Hero title after EN toggle:", heroEn);
  const cartCountAfterToggle = await page.textContent("#cart-count");
  console.log("Cart count persists after language toggle:", cartCountAfterToggle);

  await browser.close();

  console.log("\nJS ERRORS DURING TEST:", errors.length ? errors : "none");
  process.exit(errors.length ? 1 : 0);
})();
