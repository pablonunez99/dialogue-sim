import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import sharp from 'sharp';
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
  console.log(`[AI] Iniciando generación de retratos para NPCs existentes usando el modelo: ${model}`);

  const npcsPath = path.join(rootDir, 'server', 'data', 'npcs.json');
  let npcsData = [];
  try {
    npcsData = JSON.parse(await readFile(npcsPath, 'utf8'));
    console.log(`[AI] Loaded ${npcsData.length} NPCs from database.`);
  } catch (err) {
    console.error('Failed to read server/data/npcs.json:', err.message);
    process.exit(1);
  }

  const portraitsDir = path.join(rootDir, 'public', 'assets', 'portraits');
  const greenSourceDir = path.join(portraitsDir, 'green-source');

  await mkdir(greenSourceDir, { recursive: true });

  const expressionsMap = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'smirky'];

  for (const npc of npcsData) {
    console.log(`\n----------------------------------------`);
    console.log(`[AI] Generando retratos para NPC: ${npc.id}`);

    const promptMetadata = {
      id: npc.id,
      name: npc.name,
      role: npc.role,
      locationId: npc.locationId,
      personality: npc.personality,
      secret: npc.secret,
      hint: npc.hint,
      color: npc.color,
      skin: npc.skin || '#dfab8f',
      hair: npc.hair || '#2b1b17',
      outfit: npc.outfit || 'civic'
    };

    const jsonStr = JSON.stringify(promptMetadata, null, 2);
    const prompt = getNpcImagePrompt(jsonStr);

    try {
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

      if (base64Image) {
        const gridBuffer = Buffer.from(base64Image, 'base64');
        
        // 1. Save the original grid generation to green-source/[npcId].png
        const npcGridPath = path.join(greenSourceDir, `${npc.id}.png`);
        await writeFile(npcGridPath, gridBuffer);
        console.log(`[AI] Saved original grid to ${npc.id}.png`);

        // 2. Create directory for sliced green screen images
        const npcGreenDir = path.join(greenSourceDir, npc.id);
        await mkdir(npcGreenDir, { recursive: true });

        const { width, height } = await sharp(gridBuffer).metadata();
        const colWidth = Math.floor(width / 3);
        const rowHeight = Math.floor(height / 2);

        // 3. Slice grid and save each green-screen expression
        for (let i = 0; i < 6; i++) {
          const col = i % 3;
          const row = Math.floor(i / 3);
          const left = col * colWidth;
          const top = row * rowHeight;
          const expr = expressionsMap[i];

          const outPath = path.join(npcGreenDir, `${expr}.png`);
          console.log(`[AI] Slicing and saving green-screen expression: ${expr}`);
          
          await sharp(gridBuffer)
            .extract({ left, top, width: colWidth, height: rowHeight })
            .png()
            .toFile(outPath);
        }
        console.log(`[AI] ¡Éxito! Generación y recorte finalizado para ${npc.id}`);
      } else {
        throw new Error('No se recibió la imagen de Gemini.');
      }
    } catch (err) {
      console.error(`[AI] Error generando retratos para ${npc.id}:`, err);
    }
  }

  console.log(`\n========================================`);
  console.log(`[AI] Proceso de generación finalizado.`);
}

run().catch(console.error);
