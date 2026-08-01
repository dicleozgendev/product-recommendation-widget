// Small dependency-free CSV parser (RFC4180-ish: handles quoted fields,
// commas/newlines inside quotes, and "" as an escaped quote). Good enough for
// merchant product exports from Shopify/WooCommerce/Ticimax/İkas/T-Soft,
// which all use plain comma-separated exports. Not a full CSV spec
// implementation (e.g. no configurable delimiter), but that's a deliberate
// scope choice for a prototype, not an oversight.

/**
 * Parses CSV text into an array of row arrays (strings). First row is
 * assumed to be the header by parseProductsCsv() below, not by this function.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  // Flush the last field/row if the file doesn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully-empty trailing rows (common with trailing newlines).
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

const REQUIRED_COLUMNS = ["id", "category", "price", "title_tr", "title_en"];

/**
 * Parses a merchant product CSV export into the product object shape the
 * recommendation engine expects. Required columns: id, category, price,
 * title_tr, title_en. Optional: desc_tr, desc_en, img, url — missing optional
 * columns are filled with sensible defaults rather than rejected, since a
 * real merchant export is unlikely to match our exact schema on the first try.
 *
 * @param {string} csvText
 * @returns {{ products: Array<Object>, errors: string[] }}
 */
function parseProductsCsv(csvText) {
  const rows = parseCsv(csvText);
  const errors = [];

  if (rows.length < 2) {
    return { products: [], errors: ["CSV en az bir başlık satırı ve bir ürün satırı içermelidir. / CSV must have a header row plus at least one product row."] };
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    return { products: [], errors: [`Eksik zorunlu sütun(lar): ${missing.join(", ")}. / Missing required column(s): ${missing.join(", ")}.`] };
  }

  const colIndex = {};
  header.forEach((h, i) => { colIndex[h] = i; });

  const products = [];
  const seenIds = new Set();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every((c) => c.trim() === "")) continue; // skip blank rows

    const get = (col, fallback = "") => {
      const idx = colIndex[col];
      return idx === undefined ? fallback : (row[idx] ?? fallback).trim();
    };

    const id = get("id");
    if (!id) {
      errors.push(`Satır ${r + 1}: "id" boş, atlandı. / Row ${r + 1}: empty "id", skipped.`);
      continue;
    }
    if (seenIds.has(id)) {
      errors.push(`Satır ${r + 1}: "${id}" id'si tekrar ediyor, atlandı. / Row ${r + 1}: duplicate id "${id}", skipped.`);
      continue;
    }
    seenIds.add(id);

    const priceRaw = get("price", "0").replace(/[^\d.,-]/g, "").replace(",", ".");
    const price = Number(priceRaw) || 0;

    products.push({
      id,
      category: get("category", "genel"),
      price,
      title_tr: get("title_tr"),
      title_en: get("title_en") || get("title_tr"),
      desc_tr: get("desc_tr"),
      desc_en: get("desc_en") || get("desc_tr"),
      img: get("img") || "🛍️",
      url: get("url") || null,
    });
  }

  if (products.length === 0 && errors.length === 0) {
    errors.push("CSV içinde geçerli ürün satırı bulunamadı. / No valid product rows found in CSV.");
  }

  return { products, errors };
}

module.exports = { parseCsv, parseProductsCsv, REQUIRED_COLUMNS };
