import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { removeBackground } from '@imgly/background-removal-node';
import { GoogleGenAI } from '@google/genai';
import { getNpcImagePrompt, npcImageConfig } from '../server/data/image-prompt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
if (!geminiKey) {
  console.error('ERROR: No se encontró la API Key de Gemini en el archivo .env (GEMINI_API_KEY o VITE_GEMINI_API_KEY)');
  process.exit(1);
}

const client = new GoogleGenAI({ apiKey: geminiKey });
const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-lite-image';

async function run() {
  console.log('[BG] Iniciando procesamiento de eliminación de fondo...');

  const npcsPath = path.join(rootDir, 'server', 'data', 'npcs.json');
  let npcsData = [];
  try {
    npcsData = JSON.parse(await readFile(npcsPath, 'utf8'));
    console.log(`[BG] Loaded ${npcsData.length} NPCs from database.`);
  } catch (err) {
    console.error('Failed to read server/data/npcs.json:', err.message);
    process.exit(1);
  }

  const portraitsDir = path.join(rootDir, 'public', 'assets', 'portraits');
  const distDir = path.join(rootDir, 'dist', 'assets', 'portraits');
  const greenSourceDir = path.join(portraitsDir, 'green-source');

  await mkdir(portraitsDir, { recursive: true });
  await mkdir(distDir, { recursive: true });

  const expressionsMap = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'smirky'];

  for (const npc of npcsData) {
    console.log(`\n----------------------------------------`);
    console.log(`[BG] Procesando NPC: ${npc.id}`);

    const maxRetries = 3;
    let attempt = 0;
    let npcSuccess = false;

    while (attempt < maxRetries && !npcSuccess) {
      attempt++;
      console.log(`[BG] Intento ${attempt}/${maxRetries} para ${npc.id}...`);

      const npcGreenDir = path.join(greenSourceDir, npc.id);
      let greenFilesExist = true;
      for (const expr of expressionsMap) {
        if (!existsSync(path.join(npcGreenDir, `${expr}.png`))) {
          greenFilesExist = false;
          break;
        }
      }

      if (!greenFilesExist) {
        console.log(`[BG] Archivos origen verde faltantes para ${npc.id}. Generando...`);
        try {
          await generateAndSliceNpc(npc, client, model, greenSourceDir);
        } catch (genErr) {
          console.error(`[BG] Error de generación:`, genErr.message);
          continue; // Intenta el siguiente loop
        }
      }

      let allExpressionsValid = true;
      
      for (const expr of expressionsMap) {
        const greenInputPath = path.join(npcGreenDir, `${expr}.png`);
        const publicOutPath = path.join(portraitsDir, `${npc.id}-${expr}.png`);
        const distOutPath = path.join(distDir, `${npc.id}-${expr}.png`);
        if (existsSync(distOutPath)){
          console.log("[BG] Expression already exist skipping")
          continue
        }
        if (!existsSync(greenInputPath)) {
          console.warn(`[BG] Warning: No existe archivo verde para ${npc.id} expr: ${expr}.`);
          allExpressionsValid = false;
          break;
        }

        console.log(`[BG] Removiendo fondo: ${npc.id} - ${expr}`);
        try {
          const tileBuffer = await readFile(greenInputPath);
          const inputBlob = new Blob([tileBuffer], { type: 'image/png' });
          const blob = await removeBackground(inputBlob);
          const bgRemovedBuffer = Buffer.from(await blob.arrayBuffer());
          await writeFile(publicOutPath, bgRemovedBuffer);

          // Apply green spill suppression
          await applySpillSuppression(publicOutPath);

          // Validate edges (Left, Top, Right must be fully transparent)
          const isValid = await validateImageEdges(publicOutPath);
          if (!isValid) {
            console.warn(`[BG] [VALIDACIÓN FALLIDA] Se detectaron píxeles no transparentes en el contorno de ${npc.id} (${expr}) en intento ${attempt}.`);
            allExpressionsValid = false;
            break;
          }

          // Save copy to production dist directory
          await sharp(publicOutPath).toFile(distOutPath);
        } catch (err) {
          console.error(`[BG] Error procesando ${npc.id} expr: ${expr}:`, err.message);
          allExpressionsValid = false;
          break;
        }
      }

      if (allExpressionsValid) {
        console.log(`[BG] ¡Éxito! NPC ${npc.id} procesado y validado correctamente.`);
        npcSuccess = true;
      } else {
        if (attempt < maxRetries) {
          console.log(`[BG] Regenerando y re-recoratando NPC ${npc.id} desde Gemini...`);
          try {
            await generateAndSliceNpc(npc, client, model, greenSourceDir);
          } catch (genErr) {
            console.error(`[BG] Error de regeneración:`, genErr.message);
          }
        } else {
          console.error(`[BG] ERROR: No se pudo obtener una generación válida para ${npc.id} después de ${maxRetries} intentos.`);
        }
      }
    }
  }

  console.log(`\n========================================`);
  console.log('[BG] Eliminación de fondo finalizada.');
}

async function generateAndSliceNpc(npc, client, model, greenSourceDir) {
  const promptMetadata = npc

  const jsonStr = JSON.stringify(promptMetadata, null, 2);
  const prompt = getNpcImagePrompt(jsonStr);

  const response = await client.models.generateContent({
    model: model,
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

  if (!base64Image) {
    throw new Error('No se recibió la imagen de Gemini.');
  }

  const gridBuffer = Buffer.from(base64Image, 'base64');
  
  // Save original grid to green-source/[npcId].png
  const npcGridPath = path.join(greenSourceDir, `${npc.id}.png`);
  await writeFile(npcGridPath, gridBuffer);

  const npcGreenDir = path.join(greenSourceDir, npc.id);
  await mkdir(npcGreenDir, { recursive: true });

  const { width, height } = await sharp(gridBuffer).metadata();
  const colWidth = Math.floor(width / 3);
  const rowHeight = Math.floor(height / 2);
  const expressionsMap = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'smirky'];

  for (let i = 0; i < 6; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const left = col * colWidth;
    const top = row * rowHeight;
    const expr = expressionsMap[i];
    const outPath = path.join(npcGreenDir, `${expr}.png`);
    if (existsSync(outPath)) {
      console.log(`[BG] Output already exists, skipping slice: ${npc.id} - ${expr}`);
      continue;
    }
    await sharp(gridBuffer)
      .extract({ left, top, width: colWidth, height: rowHeight })
      .png()
      .toFile(outPath);
  }
}

async function validateImageEdges(filePath) {
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

    if (leftPct > 0.4) {
      console.warn(`[Validation] Failed: LEFT edge has ${(leftPct * 100).toFixed(1)}% non-transparent pixels (limit 30%)`);
      return false;
    }
    if (rightPct > 0.4) {
      console.warn(`[Validation] Failed: RIGHT edge has ${(rightPct * 100).toFixed(1)}% non-transparent pixels (limit 30%)`);
      return false;
    }
    if (topPct > 0.4) {
      console.warn(`[Validation] Failed: TOP edge has ${(topPct * 100).toFixed(1)}% non-transparent pixels (limit 30%)`);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Validation] Error running edge check:', err.message);
    return false;
  }
}

async function applySpillSuppression(filePath) {
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

run().catch(console.error);
