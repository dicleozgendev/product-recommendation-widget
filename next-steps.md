# AI Product Recommendation Widget — Next Steps

## What this demo shows

`demo.html` is a self-contained, server-free proof-of-concept demo. Using a sample electronics/accessories store (30 products), it shows: when a product is clicked, the AI suggests "frequently bought together" items (complementary products — where the real upsell value is) and "similar products". As items are added to the cart, the panel on the right shows live how much extra revenue the AI recommendations added to the basket. There's also a TR/EN language toggle (top-right button) — the same demo can be shown to both Turkish and international store owners.

Recommendations are currently computed with TF-IDF (text similarity) + a category rule — no external API call, zero cost. In a real store this can be swapped for a stronger method like OpenAI/Claude embeddings — the interface and business logic stay the same.

## Steps needed to connect to a real store

1. **Get the product data**: most platforms (Ticimax, İkas, T-Soft, WooCommerce, Shopify) can export the product catalog as CSV. First version: the store owner uploads a CSV, we compute and store the embeddings. This is much faster than writing a separate API integration for every platform.
2. **Ship a script tag**: the store owner adds a single `<script>` line to their site (like Intercom/Hotjar). The widget detects the product page and shows recommendations.
3. **A simple backend**: a small server (Node/Express, cheap/free hosting: Railway, Render) for CSV upload + embedding computation + a recommendations API. Easily fits a small budget.

## Suggested pricing (starting point)

- Small store (≤200 products): ~$16-27/mo
- Mid-size (200-2000 products): ~$50-83/mo
- Global (Shopify App Store, later): $19-49/mo range, adjusted based on Shopify's competitive landscape

## Roadmap

1. Show this demo to 5-10 real e-commerce store owners (İkas/Ticimax user communities, merchant groups, direct outreach). Goal: get a real answer to "would you pay $X/month for this".
2. If there's interest, prepare a customized demo using that store's real product CSV (the step that helps close a sale the most).
3. Once the first 2-3 paying customers are found, build the real backend + script-tag integration (no investment in production infrastructure before that — we don't build ahead of validated demand).
4. After running for a few months and collecting feedback, move the same product to the Shopify App Store to open up to the global market.

## Realistic expectations

The first sale will likely take weeks; reaching a revenue level you'd call "this is working" (a few thousand TL/month) will likely take a few months. The only thing that speeds this up: how many people you show the demo to, and how many you customize with their real data.
