/**
 * AI Ürün Önerisi — embeddable script-tag widget.
 *
 * A real merchant embeds this like Intercom/Hotjar:
 *
 *   <div id="ai-reco"></div>
 *   <script src="https://YOUR-BACKEND/widget.js"
 *           data-store-id="store_xxx"
 *           data-product-id="p1"
 *           data-container="ai-reco"
 *           data-lang="tr"
 *           async></script>
 *
 * data-store-id and data-product-id are required. Everything else has a
 * sensible default. If data-container is omitted, the widget inserts itself
 * right after its own <script> tag.
 *
 * Honest scope note: the merchant must currently set data-product-id
 * themselves (e.g. server-render it into the page, or set it with a small
 * inline script before this one loads) — this widget does not try to guess
 * the current product from the URL, because that's store-platform-specific
 * (Shopify/WooCommerce/Ticimax/İkas all structure product URLs differently)
 * and guessing wrong silently would be worse than requiring one explicit
 * attribute.
 *
 * Cart integration: this widget cannot add items to a store's real cart —
 * every platform's cart API is different, and third-party JS trying to grab
 * around a checkout system is exactly the kind of thing that breaks in
 * subtle ways. Instead, clicking a recommended product's "+" button
 * dispatches a `airw:add-to-cart` CustomEvent on `window` with the product's
 * data — the merchant listens for it and calls their own real add-to-cart
 * logic. See public/merchant-example.html for a working example listener.
 */
(function () {
  "use strict";

  var CURRENT_SCRIPT = document.currentScript;
  if (!CURRENT_SCRIPT) {
    console.warn("[AIReco] document.currentScript not available — widget cannot read its own config, aborting.");
    return;
  }

  var storeId = CURRENT_SCRIPT.getAttribute("data-store-id");
  var productId = CURRENT_SCRIPT.getAttribute("data-product-id");
  var lang = (CURRENT_SCRIPT.getAttribute("data-lang") || "tr").toLowerCase();
  var currency = CURRENT_SCRIPT.getAttribute("data-currency") || "₺";
  var containerId = CURRENT_SCRIPT.getAttribute("data-container");

  var apiBase = CURRENT_SCRIPT.getAttribute("data-api-base");
  if (!apiBase) {
    try {
      apiBase = new URL(CURRENT_SCRIPT.src).origin;
    } catch (e) {
      console.warn("[AIReco] could not infer API base from script src; set data-api-base explicitly.");
      return;
    }
  }

  if (!storeId) {
    console.warn("[AIReco] data-store-id is missing — widget will not run.");
    return;
  }
  if (!productId) {
    console.warn("[AIReco] data-product-id is missing — widget will not run. See widget.js header comment for why this can't be auto-detected.");
    return;
  }

  var T = {
    tr: {
      complementaryTitle: "Sıkça Birlikte Alınanlar",
      similarTitle: "Benzer Ürünler",
      addBtn: "Sepete Ekle",
      added: "Eklendi ✓",
      poweredBy: "AI destekli öneri",
      noData: "Bu ürün için henüz yeterli veri yok.",
    },
    en: {
      complementaryTitle: "Frequently Bought Together",
      similarTitle: "Similar Products",
      addBtn: "Add to Cart",
      added: "Added ✓",
      poweredBy: "AI-powered suggestion",
      noData: "Not enough data for this product yet.",
    },
  };
  var t = T[lang] || T.tr;

  // --- Scoped styles, injected once even if the widget somehow loads twice ---
  var STYLE_ID = "airw-styles";
  if (!document.getElementById(STYLE_ID)) {
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      ".airw-root{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;margin:20px 0;}" +
      ".airw-block{margin-bottom:18px;}" +
      ".airw-header{display:flex;align-items:center;gap:8px;margin-bottom:2px;}" +
      ".airw-tag{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;background:#eef1ff;color:#4a5fd6;padding:2px 7px;border-radius:5px;}" +
      ".airw-title{font-size:14px;font-weight:700;}" +
      ".airw-sub{font-size:11.5px;color:#8a8a8a;margin:0 0 10px;}" +
      ".airw-row{display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;}" +
      ".airw-card{flex:0 0 auto;width:140px;border:1px solid #e4e4e7;border-radius:10px;padding:10px;text-decoration:none;color:inherit;background:#fff;transition:box-shadow .15s,border-color .15s;}" +
      ".airw-card:hover{border-color:#a9b6ff;box-shadow:0 4px 14px rgba(0,0,0,0.06);}" +
      ".airw-card img,.airw-card .airw-emoji{width:100%;height:70px;object-fit:cover;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:30px;background:#f5f5f7;margin-bottom:6px;}" +
      ".airw-card .airw-name{font-size:12px;font-weight:600;line-height:1.3;min-height:31px;display:block;margin-bottom:4px;}" +
      ".airw-card .airw-price{font-size:12.5px;font-weight:700;color:#16a34a;display:block;margin-bottom:6px;}" +
      ".airw-addbtn{width:100%;border:1px solid #4a5fd6;background:transparent;color:#4a5fd6;border-radius:7px;padding:5px 0;font-size:11px;font-weight:700;cursor:pointer;}" +
      ".airw-addbtn:hover{background:#4a5fd6;color:#fff;}" +
      ".airw-addbtn.airw-added{border-color:#16a34a;color:#16a34a;cursor:default;}" +
      ".airw-empty{font-size:12px;color:#999;font-style:italic;}" +
      ".airw-footer{font-size:10px;color:#bbb;text-align:right;margin-top:2px;}";
    document.head.appendChild(style);
  }

  function fmtPrice(n) {
    var num = Number(n) || 0;
    return currency + " " + num.toLocaleString("tr-TR");
  }

  var sessionId = (function () {
    try {
      var key = "airw_session_" + storeId;
      var existing = window.sessionStorage.getItem(key);
      if (existing) return existing;
      var id = Math.random().toString(36).slice(2);
      window.sessionStorage.setItem(key, id);
      return id;
    } catch (e) {
      // sessionStorage can throw in locked-down iframes/privacy modes — a
      // per-page-load random id is a fine fallback, it just won't persist
      // across page navigations on the merchant's site.
      return Math.random().toString(36).slice(2);
    }
  })();

  function trackEvent(type, pid, source) {
    try {
      fetch(apiBase + "/api/stores/" + encodeURIComponent(storeId) + "/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: type, productId: pid, source: source || null, sessionId: sessionId }),
      }).catch(function () {
        /* best-effort only — the widget must keep rendering even if tracking fails */
      });
    } catch (e) {
      /* ignore */
    }
  }

  function cardHtml(p) {
    var media = p.img && p.img.length <= 4
      ? '<div class="airw-emoji">' + p.img + "</div>"
      : p.img
      ? '<img src="' + p.img + '" alt="" />'
      : '<div class="airw-emoji">🛍️</div>';
    var title = lang === "en" ? p.title_en || p.title_tr : p.title_tr || p.title_en;
    return (
      '<div class="airw-card-wrap" data-id="' + p.id + '">' +
      '<a class="airw-card" href="' + (p.url || "#") + '" data-role="link">' +
      media +
      '<span class="airw-name">' + title + "</span>" +
      '<span class="airw-price">' + fmtPrice(p.price) + "</span>" +
      "</a>" +
      '<button class="airw-addbtn" data-role="add" type="button">' + t.addBtn + "</button>" +
      "</div>"
    );
  }

  function sectionHtml(title, products) {
    var body = products.length
      ? '<div class="airw-row">' + products.map(cardHtml).join("") + "</div>"
      : '<div class="airw-empty">' + t.noData + "</div>";
    return (
      '<div class="airw-block">' +
      '<div class="airw-header"><span class="airw-tag">AI</span><span class="airw-title">' + title + "</span></div>" +
      body +
      "</div>"
    );
  }

  function wireCardEvents(root) {
    var wraps = root.querySelectorAll(".airw-card-wrap");
    for (var i = 0; i < wraps.length; i++) {
      (function (wrap) {
        var id = wrap.getAttribute("data-id");
        var link = wrap.querySelector('[data-role="link"]');
        var addBtn = wrap.querySelector('[data-role="add"]');

        link.addEventListener("click", function () {
          trackEvent("recommendation_click", id, "ai");
        });

        addBtn.addEventListener("click", function () {
          if (addBtn.classList.contains("airw-added")) return;
          trackEvent("add_to_cart", id, "ai");
          trackEvent("recommendation_click", id, "ai");
          addBtn.textContent = t.added;
          addBtn.classList.add("airw-added");
          // The merchant's own page listens for this to actually add the
          // item to their real cart — this widget has no way to know how
          // any given store platform's cart API works.
          window.dispatchEvent(
            new CustomEvent("airw:add-to-cart", { detail: { productId: id, storeId: storeId } })
          );
        });
      })(wraps[i]);
    }
  }

  function render(data) {
    var container = containerId ? document.getElementById(containerId) : null;
    if (!container) {
      container = document.createElement("div");
      CURRENT_SCRIPT.parentNode.insertBefore(container, CURRENT_SCRIPT.nextSibling);
    }
    container.classList.add("airw-root");
    container.innerHTML =
      sectionHtml(t.complementaryTitle, data.complementary || []) +
      sectionHtml(t.similarTitle, data.similar || []) +
      '<div class="airw-footer">' + t.poweredBy + "</div>";
    wireCardEvents(container);
  }

  trackEvent("view", productId, null);

  fetch(
    apiBase +
      "/api/stores/" +
      encodeURIComponent(storeId) +
      "/products/" +
      encodeURIComponent(productId) +
      "/recommendations?lang=" +
      encodeURIComponent(lang)
  )
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(render)
    .catch(function (err) {
      console.warn("[AIReco] failed to load recommendations:", err);
    });

  // Small public API in case a merchant wants to trigger tracking from their
  // own code too (e.g. logging an add-to-cart that happened outside our
  // rendered cards, or if they've hooked our CustomEvent to their own UI).
  window.AIReco = window.AIReco || {};
  window.AIReco.trackAddToCart = function (pid, source) {
    trackEvent("add_to_cart", pid, source || "ai");
  };
})();
