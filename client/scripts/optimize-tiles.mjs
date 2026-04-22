/**
 * Optimaliseert tile-illustraties in public/tiles/.
 *
 * Voor elke *.src.png (of *.png zonder .opt marker): produceert een
 * 512×512 PNG + WebP sibling in dezelfde map, beide <100KB.
 *
 * Draait handmatig: `npm run optimize:images`.
 */
import { readdirSync, statSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TILES_DIR = join(__dirname, "..", "public", "tiles");
const TARGET_SIZE = 512;
const PNG_QUALITY = 85;
const WEBP_QUALITY = 82;

const files = readdirSync(TILES_DIR)
  .filter((f) => f.endsWith(".png") && !f.endsWith(".src.png"));

if (files.length === 0) {
  console.log("Geen PNG-tiles gevonden in", TILES_DIR);
  process.exit(0);
}

for (const f of files) {
  const full = join(TILES_DIR, f);
  const stat = statSync(full);
  const mb = (stat.size / 1024 / 1024).toFixed(2);
  console.log(`\n→ ${f} (${mb}MB)`);

  // Backup original als .src.png (niet in dist), alleen eerste keer.
  const srcPath = join(TILES_DIR, f.replace(/\.png$/, ".src.png"));
  if (!existsSync(srcPath)) {
    const buf = await sharp(full).toBuffer();
    writeFileSync(srcPath, buf);
    console.log(`  backup → ${basename(srcPath)}`);
  }

  // Resize + optimize PNG.
  const pngBuf = await sharp(srcPath)
    .resize(TARGET_SIZE, TARGET_SIZE, { fit: "cover" })
    .png({ quality: PNG_QUALITY, compressionLevel: 9, palette: true })
    .toBuffer();
  writeFileSync(full, pngBuf);
  console.log(`  PNG  → ${(pngBuf.length / 1024).toFixed(1)}KB`);

  // Genereer WebP.
  const webpPath = full.replace(/\.png$/, ".webp");
  const webpBuf = await sharp(srcPath)
    .resize(TARGET_SIZE, TARGET_SIZE, { fit: "cover" })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  writeFileSync(webpPath, webpBuf);
  console.log(`  WEBP → ${(webpBuf.length / 1024).toFixed(1)}KB`);
}

console.log("\n✓ klaar");
