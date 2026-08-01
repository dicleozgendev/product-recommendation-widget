# TeknoMarket AI — Product Recommendation (Upsell) Widget

Live demo / landing page: **[fancy-queijadas-00050a.netlify.app](https://fancy-queijadas-00050a.netlify.app)**

A proof-of-concept demo of an AI-powered product recommendation widget that can be embedded into e-commerce stores. When a visitor views a product, it suggests "frequently bought together" items (complementary products / upsell) and "similar products". Goal: increase the average basket size.

> **Note:** The product data in this repository (`data/products.json`) is entirely fictional sample data — names like "Aurora", "NovaBook", and "TeknoMarket" were made up for demo purposes and have no connection to any real brand or store.

## What's inside

- `public/demo.html` — A single-file, server-free full marketing page + working interactive widget (TR/EN language support, English by default).
- `data/products.json` / `data/products.csv` — Sample product catalog (30 products, electronics/accessories niche). The CSV is the same catalog in the format a real store would upload (see "Script-tag widget" below).
- `server/reco-engine.js` — The actual recommendation computation (TF-IDF + LSA + cosine similarity + category rule). Shared by both the static build (`build/generate.js`, one fixed catalog baked in at build time) and the multi-tenant script-tag backend (`server/stores.js`, computed on demand for whatever catalog a real store uploads) — one implementation, two ways of using it.
- `build/generate.js` — Runs `reco-engine.js` over `data/products.json`, producing `data/recommendations.json` + `data/vectors.json` for the static demo.
- `build/build-demo.js` — Embeds the product + recommendation data into the HTML template to produce the final `public/demo.html` file.
- `build/test-jsdom.js`, `build/test-all-products.js`, `build/test-widget.js` — Test the demo's logic, all 30 products, and the full script-tag widget flow, without a browser (via jsdom).
- `server/index.js`, `server/admin.html` — An optional, self-contained analytics backend for the static demo (see below), plus the multi-tenant script-tag API.
- `server/stores.js`, `server/csv.js`, `server/create-demo-store.js` — Multi-tenant store management, CSV parsing, and an onboarding-flow script (see "Script-tag widget" below).
- `public/widget.js` — The actual embeddable script a real store pastes onto its site.
- `server/merchant-example.template.html` — A fake, deliberately differently-styled third-party store page, used to prove `widget.js` really works when embedded somewhere that isn't our own demo.

## How to run

```bash
npm install
npm run build   # produces data/recommendations.json, data/vectors.json and public/demo.html
npm test        # runs the logic tests
```

Once `public/demo.html` is generated, it can be opened directly in a browser by double-clicking — no server or API key required, the widget runs entirely static.

## Session-based personalization

When a visitor looks at several products in a row, the ranking of "Similar Products" and "Frequently Bought Together" is influenced not just by the current product but also by the products the visitor recently viewed (via a weighted average of LSA vectors). This runs entirely in the browser, in page memory — it resets on reload and requires no extra server call. While personalization is active, a small "Personalized" tag appears in the UI.

## Optional analytics dashboard (server/)

`public/demo.html` always continues to work server-free, as a single file. But you can optionally run a small Node/Express backend alongside it:

```bash
npm run server   # http://localhost:4000/demo.html and http://localhost:4000/admin
```

While this backend is running, real interactions in the demo (product views, recommendation clicks, add-to-cart — distinguishing main product vs. AI recommendation) are logged to `server/data/events.json`, and the `/admin` page computes live statistics from this real data (session count, AI-driven cart uplift percentage, most-clicked recommendations, etc.) — no number is hardcoded or fabricated; browsing the demo and adding products to cart a few times changes what you see on `/admin`.

**Honest note on scope:** this specific analytics dashboard is a single-store/single-file (JSON) level prototype — no authentication, no multi-tenant support. It answers the "how will we measure this widget's impact" question with a concrete, working example. The actual multi-tenant, script-tag version is described next.

## Script-tag widget (real multi-tenant backend)

This is the part that turns the widget from "a demo you show people" into something a real, independent store can actually embed on their own site — the `next-steps.md` roadmap item, now built.

```bash
npm run server              # start the backend (http://localhost:4000)
npm run create-demo-store   # in another terminal: creates a real store, uploads data/products.csv
```

`create-demo-store` prints a storeId, a one-time API key, the exact `<script>` snippet a merchant would paste onto a product page, and a URL that shows it actually running on a fake, differently-styled third-party page (`server/merchant-example.template.html`) — proof this isn't just "the API returns JSON", the widget really renders and works when embedded somewhere that isn't our own demo.

How a real store would use it:
1. `POST /api/stores` → get a `storeId` + one-time `apiKey`.
2. `POST /api/stores/:storeId/products` with their product catalog as CSV (`Content-Type: text/csv`, `x-api-key` header) → recommendations are computed immediately with the same `reco-engine.js` used everywhere else in this repo.
3. Paste `public/widget.js` onto their product pages via a `<script data-store-id="..." data-product-id="...">` tag. The widget fetches `GET /api/stores/:storeId/products/:productId/recommendations` (public, CORS-enabled — it has to be callable from the merchant's own domain) and renders "frequently bought together" / "similar products" cards.
4. Cart integration: the widget cannot add items to a store's real cart (every platform's cart API is different) — clicking a recommended product's "+" button dispatches a `airw:add-to-cart` browser CustomEvent with the product id; the merchant adds one `window.addEventListener('airw:add-to-cart', ...)` call to wire it into their own real cart logic. See `server/merchant-example.template.html` for a working example of exactly that.

**Security hardening that IS in place:** stores are persisted as JSON files on local disk (`server/stores/<id>/`), gated by a single API key per store (SHA-256 hashed, never stored or logged in plaintext). On top of that: [helmet](https://www.npmjs.com/package/helmet) sets standard security response headers; store creation and CSV upload are rate-limited per IP (10/hour and 30/hour respectively) so they can't be spammed; the public recommendations endpoint is rate-limited too (120/min); and a store can optionally register an `allowedOrigin` at creation time (`POST /api/stores` with `{ "allowedOrigin": "https://mystore.com" }`) to lock `Access-Control-Allow-Origin` to that exact domain instead of leaving it open to `*`. All four of these are covered by `build/test-widget.js` (it actually trips the rate limiter and checks the CORS header per-origin, not just "the code exists").

**Still not built (honest scope note):** no billing, no API key rotation/recovery, no admin UI for merchants to manage their own store, no real database (JSON files don't handle concurrent writes or backups the way a real DB does), and `allowedOrigin` is opt-in — a store that doesn't set one is still open to any origin. Those are the right next things to build once there's validated paying demand — see `next-steps.md`.

**A note for real merchants using this:** even though this widget doesn't collect names, emails, or any personally-identifying information — just anonymous session-scoped view/click/add-to-cart events — a store using it in production should add one sentence to their own privacy policy disclosing this. Suggested wording:

> TR: "Sitemizde, ürün önerilerini iyileştirmek amacıyla ziyaretçi davranışlarını (görüntülenen ve tıklanan ürünler) anonim/oturum bazlı olarak analiz eden bir öneri sistemi kullanılmaktadır. Bu sistem kimliğinizi belirleyen herhangi bir kişisel veri toplamaz."
>
> EN: "This site uses a product recommendation system that analyzes visitor behavior (viewed and clicked products) anonymously, on a per-session basis, to improve suggestions. This system does not collect any personally-identifying information."

## Why TF-IDF + LSA instead of a real AI API (OpenAI/Claude)

At this demo stage, recommendations are computed with a local/free method so that cost and dependencies stay at zero: TF-IDF vectors + dimensionality reduction via SVD (Latent Semantic Analysis). This is stronger than raw keyword matching — it can capture semantically close text even when products don't share the exact same words — but it is not a real neural embedding model (OpenAI/Claude), it's a classic, proven statistical technique. We tried switching to a neural embedding model; that requires downloading model weights from Hugging Face, and the current development environment's network policy blocks that. In a production version connected to a real store, this step can be swapped for an embedding-based method (OpenAI/Claude embeddings + a vector database) for better semantic quality — the interface and business logic (cosine similarity + category rule) stay the same, only the `embed()` function changes.

## Roadmap

1. **(Now)** Validate demand by showing this demo to real e-commerce store owners.
2. For interested stores, prepare a customized demo using their real product CSV.
3. Once the first paying customers are found: build the real backend with CSV upload + script-tag integration.
4. After running for a few months, expand to the global market via the Shopify App Store.

For detailed pricing and next steps, see `next-steps.md`.
