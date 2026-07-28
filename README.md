# TeknoMarket AI — Product Recommendation (Upsell) Widget

Live demo / landing page: **[fancy-queijadas-00050a.netlify.app](https://fancy-queijadas-00050a.netlify.app)**

A proof-of-concept demo of an AI-powered product recommendation widget that can be embedded into e-commerce stores. When a visitor views a product, it suggests "frequently bought together" items (complementary products / upsell) and "similar products". Goal: increase the average basket size.

> **Note:** The product data in this repository (`data/products.json`) is entirely fictional sample data — names like "Aurora", "NovaBook", and "TeknoMarket" were made up for demo purposes and have no connection to any real brand or store.

## What's inside

- `public/demo.html` — A single-file, server-free full marketing page + working interactive widget (TR/EN language support, English by default).
- `data/products.json` — Sample product catalog (30 products, electronics/accessories niche).
- `build/generate.js` — Reduces TF-IDF (bigram + light Turkish suffix stripping) text vectors to a low-dimensional "latent semantic" space via SVD (LSA), then computes "similar product" and "complementary product" recommendations using cosine similarity + a category rule in that space, producing `data/recommendations.json`.
- `build/build-demo.js` — Embeds the product + recommendation data into the HTML template to produce the final `public/demo.html` file.
- `build/test-jsdom.js`, `build/test-all-products.js` — Test the demo's logic (add-to-cart, language switching, all 30 products) without a browser (via jsdom).
- `server/index.js`, `server/admin.html` — An optional, self-contained analytics backend (see below).

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

**Honest note on scope:** this is a single-store/single-file (JSON) level prototype — no authentication, no multi-tenant support. A real production SaaS backend (CSV upload, script-tag integration, billing) is the actual roadmap item in `next-steps.md`; that only gets built once real customer demand is validated. This analytics dashboard answers the "how will we measure this widget's impact" question with a concrete, working example, ahead of that step.

## Why TF-IDF + LSA instead of a real AI API (OpenAI/Claude)

At this demo stage, recommendations are computed with a local/free method so that cost and dependencies stay at zero: TF-IDF vectors + dimensionality reduction via SVD (Latent Semantic Analysis). This is stronger than raw keyword matching — it can capture semantically close text even when products don't share the exact same words — but it is not a real neural embedding model (OpenAI/Claude), it's a classic, proven statistical technique. We tried switching to a neural embedding model; that requires downloading model weights from Hugging Face, and the current development environment's network policy blocks that. In a production version connected to a real store, this step can be swapped for an embedding-based method (OpenAI/Claude embeddings + a vector database) for better semantic quality — the interface and business logic (cosine similarity + category rule) stay the same, only the `embed()` function changes.

## Roadmap

1. **(Now)** Validate demand by showing this demo to real e-commerce store owners.
2. For interested stores, prepare a customized demo using their real product CSV.
3. Once the first paying customers are found: build the real backend with CSV upload + script-tag integration.
4. After running for a few months, expand to the global market via the Shopify App Store.

For detailed pricing and next steps, see `next-steps.md`.
