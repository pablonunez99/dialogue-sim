import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'background-remove';
import { rm } from 'node:fs/promises';
const { removeBackground } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function testDouble() {
  const originalInput = path.join(rootDir, 'public', 'assets', 'portraits', 'alcaldesa-neutral.png');
  const tempOut = path.join(rootDir, 'test-temp-keyed.png');
  const finalOut = path.join(rootDir, 'test-double-fixed.png');
  
  try {
    // 1. Run background removal with a higher tolerance
    await removeBackground(originalInput, tempOut, {
      method: 'inferred',
      tolerance: 88,
      feather: 2,
      smooth: true,
      antialias: true
    });
    
    // 2. Load the result and apply green spill suppression to all edge pixels (a < 255)
    const image = sharp(tempOut);
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    
    const { width, height, channels } = info;
    const outputBuffer = Buffer.from(data);
    
    let suppressedCount = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      
      if (a < 255 && a > 0) {
        // If green is dominant, clamp it to the max of red and blue to remove the green bleed
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
      .toFile(finalOut);
      
    await rm(tempOut, { force: true });
    console.log(`Tolerance 88 + Spill suppression applied! Suppressed ${suppressedCount} pixels.`);
  } catch (e) {
    console.error(e);
  }
}

testDouble();
