import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function testSpill() {
  const input = path.join(rootDir, 'public', 'assets', 'portraits', 'alcaldesa-neutral.png');
  const output = path.join(rootDir, 'test-spill-fixed.png');
  
  try {
    const image = sharp(input);
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    
    const { width, height, channels } = info;
    const outputBuffer = Buffer.from(data);
    
    let suppressedCount = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      
      // Edge pixels with some transparency (a < 255) and dominant green
      if (a < 255 && a > 0) {
        // If green is dominant, clamp it to the max of red and blue to remove the green spill
        if (g > r && g > b) {
          const maxRB = Math.max(r, b);
          outputBuffer[i + 1] = Math.min(g, maxRB);
          suppressedCount++;
        }
      }
    }
    
    await sharp(outputBuffer, {
      raw: { width, height, channels: 4 }
    })
      .png()
      .toFile(output);
      
    console.log(`Suppressed green spill on ${suppressedCount} edge pixels.`);
  } catch (e) {
    console.error(e);
  }
}

testSpill();
