# AI Product Recommendation Widget — Next Steps

## What this demo shows

The `demo.html` file is a standalone, server-free proof-of-concept demo. On a sample electronics/accessories store (30 products), it shows the following: when a product is clicked, the AI suggests "frequently bought together" items (complementary products — the real upsell value is here) and "similar products". As you add items to the cart, the panel on the right shows, live, the extra revenue that the AI recommendations add to the basket size. There is also TR/EN language switching (button in the top right) — the same demo can be shown to both Turkish and international merchants.

Recommendations are currently computed with TF-IDF (text similarity) + a category rule, with no external API call and zero cost. In a real store, this could be replaced with a stronger method such as OpenAI/Claude embeddings — the interface and business logic stay the same.

## Steps needed to connect to a real store

1. **Get the product data**: Most platforms (Ticimax, İkas, T-Soft, WooCommerce, Shopify) can export their product catalog as CSV. First version: the merchant uploads a CSV, we compute and store the embeddings. This is much faster than writing a separate API integration for each platform.
2. **Provide a script tag**: The merchant adds a single `<script>` line to their site (like Intercom/Hotjar). The widget detects its own product page and shows recommendations.
3. **A simple backend**: A small server for CSV upload + embedding computation + a recommendation API (Node/Express, free/cheap hosting: Railway, Render). Fits comfortably within budget.

## Pricing suggestion (initial)

- Small store (≤200 products): ~₺499-799/month
- Mid-size (200-2000 products): ~₺1,499-2,499/month
- Global (Shopify App Store, later): $19-49/month range, adjusted based on Shopify's competitive analysis

## Roadmap

1. Show this demo to 5-10 real Turkish e-commerce owners (İkas/Ticimax user communities, merchant groups, direct messages). Goal: get a real answer to the question "would you pay X TL/month for something like this".
2. If there is interest, prepare a customized demo using that store's real product CSV (this is the step that helps most with closing the sale).
3. Once the first 2-3 paying customers are found, build the real backend + script-tag integration (no investment in production infrastructure until this point — we don't build before demand is validated).
4. After running in Turkey for a few months and collecting feedback, move the same product to the Shopify App Store and open it to the global/US market.

## Realistic expectations

The first sale will likely take weeks, and the revenue level where you can say "this works" (a few thousand TL per month) will likely take a few months. The only thing that speeds this up: how many people you show the demo to, and how many of them you customize it for with their real data.
