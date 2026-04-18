/**
 * Generate desktop app icons from the project's SVG icon.
 * Requires: sharp (npm install sharp)
 *
 * Usage: node scripts/generate-icons.js
 */

const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const SVG_PATH = path.resolve(__dirname, "../../public/icons/icon-512.svg");
const OUTPUT_DIR = path.resolve(__dirname, "../icons");

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function generate() {
  console.log("Generating icons from:", SVG_PATH);

  if (!fs.existsSync(SVG_PATH)) {
    console.error("SVG not found at", SVG_PATH);
    console.log("Creating fallback icon...");
    // Create a simple red square with GB text as fallback
    const fallbackSvg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" rx="102" fill="#e30613"/>
      <path d="M128 384h256M160 256h192M192 256v96M256 256v96M320 256v96M256 128l-128 64v64h256v-64Z" stroke="white" stroke-width="24" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>`;
    fs.writeFileSync(path.join(OUTPUT_DIR, "fallback.svg"), fallbackSvg);

    await sharp(Buffer.from(fallbackSvg))
      .resize(512, 512)
      .png()
      .toFile(path.join(OUTPUT_DIR, "icon.png"));

    console.log("✓ icon.png (512x512) generated from fallback");
    await generateIcoFromPng(path.join(OUTPUT_DIR, "icon.png"));
    return;
  }

  // Generate PNG at multiple sizes
  const sizes = [16, 32, 48, 64, 128, 256, 512, 1024];
  for (const size of sizes) {
    await sharp(SVG_PATH)
      .resize(size, size)
      .png()
      .toFile(path.join(OUTPUT_DIR, `icon-${size}.png`));
  }

  // Copy 512 as the main icon.png
  fs.copyFileSync(
    path.join(OUTPUT_DIR, "icon-512.png"),
    path.join(OUTPUT_DIR, "icon.png")
  );

  console.log("✓ PNG icons generated (16-1024px)");

  // Generate ICO (Windows) from multiple sizes
  await generateIcoFromPng(path.join(OUTPUT_DIR, "icon.png"));

  console.log("Done! Icons are in:", OUTPUT_DIR);
}

/**
 * Simple ICO generator — creates a multi-image ICO from a PNG.
 * Uses raw BITMAPINFOHEADER format.
 */
async function generateIcoFromPng(pngPath) {
  const sizes = [16, 32, 48, 256];
  const images = [];

  for (const size of sizes) {
    const buf = await sharp(pngPath)
      .resize(size, size)
      .png()
      .toBuffer();
    images.push({ size, data: buf });
  }

  // ICO header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);          // Reserved
  header.writeUInt16LE(1, 2);          // Type: ICO
  header.writeUInt16LE(images.length, 4); // Image count

  // Directory entries: 16 bytes each
  let offset = 6 + images.length * 16;
  const entries = [];
  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.size >= 256 ? 0 : img.size, 0);   // Width
    entry.writeUInt8(img.size >= 256 ? 0 : img.size, 1);   // Height
    entry.writeUInt8(0, 2);             // Color palette
    entry.writeUInt8(0, 3);             // Reserved
    entry.writeUInt16LE(1, 4);          // Color planes
    entry.writeUInt16LE(32, 6);         // Bits per pixel
    entry.writeUInt32LE(img.data.length, 8);  // Data size
    entry.writeUInt32LE(offset, 12);    // Data offset
    entries.push(entry);
    offset += img.data.length;
  }

  const ico = Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
  fs.writeFileSync(path.join(OUTPUT_DIR, "icon.ico"), ico);
  console.log("✓ icon.ico generated");
}

generate().catch(console.error);
