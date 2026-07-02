import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { getLocationImagePrompt, locationImageConfig } from '../server/data/image-prompt.js';

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
  console.log(`[AI] Iniciando generación de fondos de ubicación usando el modelo: ${model}`);

  const locationsPath = path.join(rootDir, 'server', 'data', 'locations.json');
  let locationsData = [];
  try {
    locationsData = JSON.parse(await readFile(locationsPath, 'utf8'));
    console.log(`[AI] Loaded ${locationsData.length} locations from database.`);
  } catch (err) {
    console.error('Failed to read server/data/locations.json:', err.message);
    process.exit(1);
  }

  const publicDir = path.join(rootDir, 'public', 'assets', 'locations');
  const distDir = path.join(rootDir, 'dist', 'assets', 'locations');

  await mkdir(publicDir, { recursive: true });
  await mkdir(distDir, { recursive: true });

  for (const loc of locationsData) {
    console.log(`\n----------------------------------------`);
    console.log(`[AI] Generando fondo para Ubicación: ${loc.id} (${loc.name})`);
    console.log(`[AI] Prompt: "${loc.prompt}"`);

    try {
      const prompt = getLocationImagePrompt(loc.prompt);
      
      const response = await client.models.generateContent({
        model: model,
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
        const publicOutPath = path.join(publicDir, `${loc.id}.png`);
        const distOutPath = path.join(distDir, `${loc.id}.png`);

        // Save widescreen PNG
        await writeFile(publicOutPath, imageBuffer);
        
        // Copy to dist production folder
        await sharp(publicOutPath).toFile(distOutPath);

        console.log(`[AI] ¡Éxito! Fondo de ubicación guardado para ${loc.id}`);
      } else {
        throw new Error('No se recibió la imagen de Gemini.');
      }
    } catch (err) {
      console.error(`[AI] Error generando fondo para ubicación ${loc.id}:`, err);
    }
  }

  console.log(`\n========================================`);
  console.log(`[AI] Proceso finalizado.`);
}

run().catch(console.error);
