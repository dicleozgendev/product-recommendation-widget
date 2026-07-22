// Injects product + recommendation data into the HTML template and writes
// the final self-contained demo file (no server, no network calls needed).
const fs = require("fs");
const path = require("path");

const products = fs.readFileSync(path.join(__dirname, "..", "data", "products.json"), "utf8");
const recs = fs.readFileSync(path.join(__dirname, "..", "data", "recommendations.json"), "utf8");
const template = fs.readFileSync(path.join(__dirname, "demo.template.html"), "utf8");

const output = template
  .replace("__PRODUCTS_JSON__", products.trim())
  .replace("__RECS_JSON__", recs.trim());

const outPath = path.join(__dirname, "..", "public", "demo.html");
fs.writeFileSync(outPath, output);
console.log("Wrote", outPath, `(${(output.length / 1024).toFixed(1)} KB)`);
