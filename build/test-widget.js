// End-to-end test for the script-tag widget: starts the real server, creates
// a real store, uploads a real CSV catalog, then loads the fake third-party
// merchant page in jsdom (real DOM + script execution) and verifies the
// widget actually fetches recommendations over HTTP and renders real cards
// - not just that the API returns JSON. Also verifies the airw:add-to-cart
// CustomEvent round-trip (widget dispatches it, the fake merchant's own
// script listens and updates its own cart state), which is the actual
// integration contract a real store owner would rely on.
const { spawn } = require("child_process");
const path = require("path");
const { JSDOM } = require("jsdom");

const PORT = 4501; // dedicated port so this doesn't collide with a dev server on 4000
const BASE = `http://localhost:${PORT}`;

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(url, attempts = 20) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return true;
    } catch (e) {
      /* not up yet */
    }
    await wait(200);
  }
  throw new Error("server did not come up in time");
}

async function main() {
  const server = spawn("node", ["server/index.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverOutput = "";
  server.stdout.on("data", (d) => { serverOutput += d.toString(); });
  server.stderr.on("data", (d) => { serverOutput += d.toString(); });

  try {
    await waitForServer(`${BASE}/api/stores/nonexistent/products`);

    // 1. Create a store + upload the real CSV
    const createRes = await fetch(`${BASE}/api/stores`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "jsdom test store" }),
    });
    const { storeId, apiKey } = await createRes.json();
    if (!storeId || !apiKey) throw new Error("store creation failed: " + JSON.stringify({ storeId, apiKey }));

    const fs = require("fs");
    const csvText = fs.readFileSync(path.join(__dirname, "..", "data", "products.csv"), "utf8");
    const uploadRes = await fetch(`${BASE}/api/stores/${storeId}/products`, {
      method: "POST",
      headers: { "Content-Type": "text/csv", "x-api-key": apiKey },
      body: csvText,
    });
    const uploadBody = await uploadRes.json();
    if (!uploadRes.ok || uploadBody.productCount !== 30) {
      throw new Error("catalog upload failed: " + JSON.stringify(uploadBody));
    }

    // 1b. A store that registered an allowedOrigin should only reflect CORS
    // headers for that exact origin - verify both the allowed and a
    // different ("attacker") origin, so a future change can't silently
    // widen this back to "allow everyone" without a test failing.
    const lockedCreateRes = await fetch(`${BASE}/api/stores`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "locked store", allowedOrigin: "https://real-merchant.example" }),
    });
    const lockedStore = await lockedCreateRes.json();
    const allowedRes = await fetch(`${BASE}/api/stores/${lockedStore.storeId}/products/p1/recommendations`, {
      headers: { Origin: "https://real-merchant.example" },
    });
    const blockedRes = await fetch(`${BASE}/api/stores/${lockedStore.storeId}/products/p1/recommendations`, {
      headers: { Origin: "https://evil-scraper.example" },
    });
    const corsResults = {
      allowedOriginGetsHeader: allowedRes.headers.get("access-control-allow-origin") === "https://real-merchant.example",
      differentOriginGetsNoHeader: blockedRes.headers.get("access-control-allow-origin") === null,
    };

    // 1c. Rate limiting: store creation is capped - confirm it actually
    // trips after enough rapid requests instead of just existing in code.
    let rateLimitTripped = false;
    for (let i = 0; i < 12; i++) {
      const r = await fetch(`${BASE}/api/stores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "spam" + i }),
      });
      if (r.status === 429) {
        rateLimitTripped = true;
        break;
      }
    }

    // 1d. Helmet security headers present on a static response.
    const staticRes = await fetch(`${BASE}/demo.html`);
    const helmetOk =
      staticRes.headers.get("x-content-type-options") === "nosniff" &&
      !!staticRes.headers.get("x-frame-options");

    // 2. Load the fake merchant page for real in jsdom, with scripts running
    // and real network access (resources: "usable") so widget.js actually
    // executes and fetches from our real running server.
    const pageUrl = `${BASE}/merchant-example.html?store=${storeId}&product=p1`;
    const dom = await JSDOM.fromURL(pageUrl, {
      runScripts: "dangerously",
      resources: "usable",
      // This jsdom version has no built-in fetch; widget.js needs it as
      // soon as it executes, so it must be injected before any script on
      // the page runs (not after — by then widget.js has already thrown).
      beforeParse(window) {
        window.fetch = fetch;
      },
    });
    const { window } = dom;

    // Give widget.js time to fetch + render (it does one network round trip).
    await wait(1000);
    const doc = window.document;

    const results = {};
    results.pageTitle = doc.title;
    results.productTitleShown = doc.querySelector(".product h1")?.textContent;
    results.recoContainerExists = !!doc.getElementById("ai-reco");
    results.recoBlockCount = doc.querySelectorAll("#ai-reco .airw-block").length;
    const cards = doc.querySelectorAll("#ai-reco .airw-card-wrap");
    results.recoCardCount = cards.length;
    results.firstCardName = cards[0]?.querySelector(".airw-name")?.textContent;
    results.firstCardHasRealPrice = /₺/.test(cards[0]?.querySelector(".airw-price")?.textContent || "");

    // 3. Click the first recommendation's "Sepete Ekle" and confirm the fake
    // merchant's OWN cart script (which only knows about the CustomEvent
    // contract, not our internals) actually updates.
    const firstAddBtn = cards[0]?.querySelector('[data-role="add"]');
    firstAddBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
    await wait(200);
    results.cartStatusAfterAiAdd = doc.getElementById("cart-status").textContent;
    results.addBtnNowDisabled = firstAddBtn.textContent;

    // 4. Also click the page's own "main" add-to-cart button, to confirm the
    // widget didn't clobber the merchant's existing page behavior.
    doc.getElementById("main-add-btn").dispatchEvent(new window.Event("click", { bubbles: true }));
    await wait(100);
    results.cartStatusAfterMainAdd = doc.getElementById("cart-status").textContent;

    // 5. Confirm events actually landed in the per-store event log via the
    // real stats endpoint (requires the real API key - proves auth works).
    const statsRes = await fetch(`${BASE}/api/stores/${storeId}/stats`, {
      headers: { "x-api-key": apiKey },
    });
    results.stats = await statsRes.json();

    // 6. Confirm the recommendations endpoint is really reachable
    // cross-origin (CORS) the way a real merchant's browser would need
    // (this particular store has no allowedOrigin set, so it should stay
    // open to any origin - the locked-store case is checked separately above).
    const corsRes = await fetch(`${BASE}/api/stores/${storeId}/products/p1/recommendations`, {
      headers: { Origin: "https://totally-different-domain.example" },
    });
    results.corsAllowOrigin = corsRes.headers.get("access-control-allow-origin");
    results.lockedStoreCors = corsResults;
    results.rateLimitTripped = rateLimitTripped;
    results.helmetHeadersPresent = helmetOk;

    console.log(JSON.stringify(results, null, 2));
    window.close();

    const ok =
      results.recoCardCount > 0 &&
      results.firstCardHasRealPrice &&
      /AI önerisi/.test(results.cartStatusAfterAiAdd) &&
      /Sepette 2/.test(results.cartStatusAfterMainAdd) &&
      results.stats.views >= 1 &&
      results.stats.addToCartAi >= 1 &&
      results.corsAllowOrigin === "*" &&
      corsResults.allowedOriginGetsHeader &&
      corsResults.differentOriginGetsNoHeader &&
      rateLimitTripped &&
      helmetOk;

    if (!ok) {
      console.error("\nFAIL: one or more end-to-end assertions did not hold.");
      process.exitCode = 1;
    } else {
      console.log("\nPASS: script-tag widget works end-to-end on a simulated third-party page.");
    }
  } finally {
    server.kill();
    await wait(200);
    if (process.exitCode) {
      console.error("--- server output ---\n" + serverOutput);
    }
  }
}

main().catch((err) => {
  console.error("UNHANDLED", err);
  process.exit(1);
});
