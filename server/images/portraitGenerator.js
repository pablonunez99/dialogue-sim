// Generacion y post-procesado de assets visuales (portraits de NPC, fondos de ubicacion)
import path from 'node:path';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import sharp from 'sharp';
import { removeBackground } from '@imgly/background-removal-node';
import { getNpcImagePrompt, npcImageConfig, getLocationImagePrompt, locationImageConfig } from '../data/image-prompt.js';
import { client, useGemini } from '../config/aiProviders.js';
import { rootDir } from '../config/paths.js';

export async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Background Generator for locations
export async function generateLocationBackground(locationId, promptDescription) {
  const publicDir = path.join(rootDir, 'public', 'assets', 'locations');
  const distDir = path.join(rootDir, 'dist', 'assets', 'locations');

  await mkdir(publicDir, { recursive: true });
  await mkdir(distDir, { recursive: true });

  if (useGemini && process.env.GEMINI_IMAGE_MODEL) {
    try {
      console.log(`[AI] Generating background for dynamic location: ${locationId}`);
      const prompt = getLocationImagePrompt(promptDescription);
      
      const response = await client.models.generateContent({
        model: process.env.GEMINI_IMAGE_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: locationImageConfig
      });

      let base64Image = null;
      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData) {
          base64Image = part.inlineData.data;
          break;
        }
      }

      if (base64Image) {
        const imageBuffer = Buffer.from(base64Image, 'base64');
        const publicOutPath = path.join(publicDir, `${locationId}.png`);
        const distOutPath = path.join(distDir, `${locationId}.png`);

        await writeFile(publicOutPath, imageBuffer);
        await sharp(publicOutPath).toFile(distOutPath);
        console.log(`[AI] Successfully generated background for location: ${locationId}`);
        return true;
      }
    } catch (err) {
      console.error(`[AI] Location background generation failed for ${locationId}`, err);
    }
  }
  return false;
}

// Portrait Generator & Slicer (Gemini Image + Chroma key using background-remove)
export async function generateNpcPortraits(npcId, npcColor, npcMetadata) {
  const publicDir = path.join(rootDir, 'public', 'assets', 'portraits');
  const distDir = path.join(rootDir, 'dist', 'assets', 'portraits');

  await mkdir(publicDir, { recursive: true });
  await mkdir(distDir, { recursive: true });

  const expressionsMap = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'smirky'];
  let success = false;

  if (useGemini && process.env.GEMINI_IMAGE_MODEL) {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries && !success) {
      attempt++;
      console.log(`[AI] Generating portraits for NPC: ${npcId} (Attempt ${attempt}/${maxRetries})`);

      try {
        const promptMetadata = npcMetadata

        const jsonStr = JSON.stringify(promptMetadata, null, 2);
        const prompt = getNpcImagePrompt(jsonStr);
        
        const response = await client.models.generateContent({
          model: process.env.GEMINI_IMAGE_MODEL,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: npcImageConfig
        });

        let base64Image = null;
        for (const part of response.candidates?.[0]?.content?.parts ?? []) {
          if (part.inlineData) {
            base64Image = part.inlineData.data;
            break;
          }
        }

        if (base64Image) {
          const gridBuffer = Buffer.from(base64Image, 'base64');
          
          // 1. Save the original grid generation to green-source/[npcId].png
          const greenSourceDir = path.join(publicDir, 'green-source');
          await mkdir(greenSourceDir, { recursive: true });
          
          const npcGridPath = path.join(greenSourceDir, `${npcId}.png`);
          await writeFile(npcGridPath, gridBuffer);
          console.log(`[Server] Saved original grid to green-source/${npcId}.png`);

          // 2. Create directory for sliced green screen images
          const npcGreenDir = path.join(greenSourceDir, npcId);
          await mkdir(npcGreenDir, { recursive: true });

          const { width, height } = await sharp(gridBuffer).metadata();
          const colWidth = Math.floor(width / 3);
          const rowHeight = Math.floor(height / 2);

          let allExpressionsValid = true;

          for (let i = 0; i < 6; i++) {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const left = col * colWidth;
            const top = row * rowHeight;
            const expr = expressionsMap[i];

            const greenInputPath = path.join(npcGreenDir, `${expr}.png`);
            const publicOutPath = path.join(publicDir, `${npcId}-${expr}.png`);
            const distOutPath = path.join(distDir, `${npcId}-${expr}.png`);

            // 3. Slice and save the green-screen expression
            await sharp(gridBuffer)
              .extract({ left, top, width: colWidth, height: rowHeight })
              .png()
              .toFile(greenInputPath);

            // 4. Apply background removal using @imgly/background-removal-node
            const tileBuffer = await readFile(greenInputPath);
            const inputBlob = new Blob([tileBuffer], { type: 'image/png' });
            const blob = await removeBackground(inputBlob);
            const bgRemovedBuffer = Buffer.from(await blob.arrayBuffer());
            await writeFile(publicOutPath, bgRemovedBuffer);

            // 5. Suppress green spill on edge pixels
            await applySpillSuppression(publicOutPath);

            // Edge Validation (Left, Top, Right must be fully transparent)
            const isValid = await validateImageEdges(publicOutPath);
            if (!isValid) {
              console.warn(`[Server] Edge validation failed for NPC ${npcId} expr: ${expr} on attempt ${attempt}`);
              allExpressionsValid = false;
              break;
            }

            // 6. Copy result to production dist directory
            await sharp(publicOutPath).toFile(distOutPath);
          }

          if (allExpressionsValid) {
            console.log(`[AI] Successfully synthesized and validated portraits for NPC: ${npcId}`);
            success = true;
          }
        }
      } catch (err) {
        console.error(`[AI] Portrait synthesis attempt ${attempt} failed for NPC ${npcId}:`, err);
      }
    }
  }

 
}

export async function applySpillSuppression(filePath) {
  const image = sharp(filePath);
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  
  const { width, height, channels } = info;
  const outputBuffer = Buffer.from(data);
  let changed = false;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // Clamping green spill on edge pixels (a < 255)
    if (a < 255 && a > 0) {
      if (g > r && g > b) {
        const maxRB = Math.max(r, b);
        outputBuffer[i + 1] = Math.min(g, maxRB);
        changed = true;
      }
    }
  }

  if (changed) {
    await sharp(outputBuffer, {
      raw: { width, height, channels: 4 }
    })
      .png()
      .toFile(filePath);
  }
}

export async function validateImageEdges(filePath) {
  try {
    const image = sharp(filePath);
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    
    const { width, height } = info;
    
    // Left edge (x = 0)
    let leftNonTrans = 0;
    for (let y = 0; y < height; y++) {
      const idx = (y * width + 0) * 4;
      if (data[idx + 3] > 0) {
        leftNonTrans++;
      }
    }

    // Right edge (x = width - 1)
    let rightNonTrans = 0;
    for (let y = 0; y < height; y++) {
      const idx = (y * width + (width - 1)) * 4;
      if (data[idx + 3] > 0) {
        rightNonTrans++;
      }
    }

    // Top edge (y = 0)
    let topNonTrans = 0;
    for (let x = 0; x < width; x++) {
      const idx = (0 * width + x) * 4;
      if (data[idx + 3] > 0) {
        topNonTrans++;
      }
    }

    const leftPct = leftNonTrans / height;
    const rightPct = rightNonTrans / height;
    const topPct = topNonTrans / width;

    if (leftPct > 0.3) {
      console.warn(`[Validation] Failed: LEFT edge has ${(leftPct * 100).toFixed(1)}% non-transparent pixels (limit 30%)`);
      return false;
    }
    if (rightPct > 0.3) {
      console.warn(`[Validation] Failed: RIGHT edge has ${(rightPct * 100).toFixed(1)}% non-transparent pixels (limit 30%)`);
      return false;
    }
    if (topPct > 0.3) {
      console.warn(`[Validation] Failed: TOP edge has ${(topPct * 100).toFixed(1)}% non-transparent pixels (limit 30%)`);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Validation] Error running edge check:', err.message);
    return false;
  }
}
