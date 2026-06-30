// Bake the "thothly" wordmark to a transparent silhouette PNG used by the EPUB
// cover (app/render/assets/wordmark.png). Source of truth is the frontend brand
// component, so the mark never drifts from the app logo: this reads the lettering
// paths out of frontend/components/brand.tsx and renders them flat (no texture
// filter — crisp at colophon size) via the frontend's `sharp`. Colour is applied
// later in cover.py through the alpha channel, so the asset is a plain silhouette.
//
// Run (no install needed; uses the frontend's pnpm-resolved sharp):
//   node backend/scripts/bake_wordmark.cjs
const fs = require("fs");
const path = require("path");

const FRONTEND = path.resolve(__dirname, "../../frontend");
const BRAND = path.join(FRONTEND, "components", "brand.tsx");
const OUT = path.resolve(__dirname, "../app/render/assets/wordmark.png");

// Resolve the frontend's sharp regardless of its pinned version (pnpm keeps it
// under node_modules/.pnpm/sharp@<version>/node_modules/sharp).
const pnpmDir = path.join(FRONTEND, "node_modules", ".pnpm");
const sharpPkg = fs.readdirSync(pnpmDir).find((d) => /^sharp@/.test(d));
if (!sharpPkg) throw new Error("sharp not found under frontend/node_modules/.pnpm");
const sharp = require(path.join(pnpmDir, sharpPkg, "node_modules", "sharp"));

// The wordmark paths are exactly those inside the Logotype's textured <g> group;
// the two paths before it are the symbol (already the cover's top emblem), so we
// drop them and keep only the lettering.
const brand = fs.readFileSync(BRAND, "utf8");
const group = brand.match(/<g filter=[^>]*>([\s\S]*?)<\/g>/);
if (!group) throw new Error("could not locate the <g> wordmark group in brand.tsx");
const dAttrs = [...group[1].matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]);
if (dAttrs.length < 5) throw new Error(`expected the wordmark glyphs, got ${dAttrs.length} paths`);

const paths = dAttrs.map((d) => `<path d="${d}" fill="#000000"/>`).join("");
// Same viewBox as the Logotype; only the lettering is drawn, so the left third
// (where the symbol sits) renders empty and gets trimmed off.
const W = 2400;
const H = Math.round((W * 188) / 713);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 713 188">${paths}</svg>`;

sharp(Buffer.from(svg))
  .trim()
  .toFile(OUT)
  .then((info) => console.log(`wordmark.png written: ${info.width}x${info.height}`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
