import sharp from "sharp";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

async function run() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const input = path.resolve(__dirname, "../public/pic/app-icon.png");
  const tempOutput = path.resolve(__dirname, "../public/pic/app-icon.tmp.png");

  const image = sharp(input);
  const metadata = await image.metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  if (!width || !height) {
    throw new Error("无法读取图标尺寸");
  }

  const radius = Math.max(1, Math.round(Math.min(width, height) * 0.07));

  const roundedMask = Buffer.from(
    `<svg width="${width}" height="${height}">
      <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="white"/>
    </svg>`
  );

  await image
    .ensureAlpha()
    .composite([{ input: roundedMask, blend: "dest-in" }])
    .png()
    .toFile(tempOutput);

  await fs.rename(tempOutput, input);

  console.log(`Icon processed: ${input}`);
  console.log(`Applied radius: ${radius}px (7%)`);
}

run().catch((err) => {
  console.error("Failed to process icon:", err);
  process.exit(1);
});
