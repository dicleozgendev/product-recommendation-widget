# TeknoMarket AI — Product Recommendation (Upsell) Widget

Live demo / landing page: **[fancy-queijadas-00050a.netlify.app](https://fancy-queijadas-00050a.netlify.app)**

A proof-of-concept demo of an AI-powered product recommendation widget that can be embedded into e-commerce stores. When a visitor views a product, it suggests "frequently bought together" items (complementary products / upsell) and "similar products". Goal: increase the average basket size.

> **Note:** The product data in this repository (`data/products.json`) is entirely fictional sample data — names like "Aurora", "NovaBook", and "TeknoMarket" were made up for demo purposes and have no connection to any real brand or store.

## What's inside

- `public/demo.html` — A single-file, server-free full marketing page + working interactive widget (TR/EN language support, English by default).
- `data/products.json` — Sample product catalog (30 products, electronics/accessories niche).
- `build/generate.js` — Computes "similar product" and "complementary product" recommendations using TF-IDF text similarity + a category rule, and produces `data/recommendations.json`.
- `build/build-demo.js` — Embeds the product + recommendation data into the HTML template to produce the final `public/demo.html` file.
- `build/test-jsdom.js`, `build/test-all-products.js` — Test the demo's logic (add-to-cart, language switching, all 30 products) without a browser (via jsdom).

## How to run

```bash
npm install
npm run build   # produces data/recommendations.json and public/demo.html
npm test        # runs the logic tests
```

Once `public/demo.html` is generated, it can be opened directly in a browser by double-clicking — no server or API key required.

## Why TF-IDF instead of a real AI API (OpenAI/Claude)

At this demo stage, recommendations are computed with a local/free text-similarity method (TF-IDF + category rule) so that cost and dependencies are zero. In a production version connected to a real store, this step would be swapped for an embedding-based method (OpenAI/Claude embeddings + a vector database) for better semantic quality — the interface and business logic stay the same.

## Roadmap

1. **(Now)** Validate demand by showing this demo to real Turkish e-commerce owners.
2. For interested stores, prepare a customized demo using their real product CSV.
3. Once the first paying customers are found: build the real backend with CSV upload + script-tag integration.
4. After running in Turkey for a few months, expand to the global market via the Shopify App Store.

For detailed pricing and next steps, see the `next-steps.md` file.
