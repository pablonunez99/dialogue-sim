import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import fs from 'node:fs';
import sharp from 'sharp';
import { getLocationImagePrompt, locationImageConfig } from '../server/data/image-prompt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const locationsFilePath = path.join(rootDir, 'server', 'data', 'locations.json');
const publicDir = path.join(rootDir, 'public', 'assets', 'locations');
const distDir = path.join(rootDir, 'dist', 'assets', 'locations');

const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const imageModel = process.env.GEMINI_IMAGE_MODEL || 'imagen-3.0-generate-002';

if (!geminiKey) {
  console.error('ERROR: GEMINI_API_KEY or VITE_GEMINI_API_KEY is not defined in the environment.');
  process.exit(1);
}

const client = new GoogleGenAI({ apiKey: geminiKey });

async function run() {
  await mkdir(publicDir, { recursive: true });
  await mkdir(distDir, { recursive: true });

  console.log(`Loading locations from: ${locationsFilePath}`);
  const data = await readFile(locationsFilePath, 'utf8');
  const locations = JSON.parse(data);

  for (const loc of locations) {
    const publicPath = path.join(publicDir, `${loc.id}.png`);
    const distPath = path.join(distDir, `${loc.id}.png`);

    if (fs.existsSync(publicPath)) {
      console.log(`[Skip] Location image already exists: ${loc.id} (${loc.name})`);
      continue;
    }

    console.log(`[Generate] Generating image for location: ${loc.id} (${loc.name})...`);
    console.log(`Prompt description: "${loc.prompt}"`);

    try {
      const finalPrompt = getLocationImagePrompt(loc.prompt);
      
      const response = await client.models.generateContent({
        model: imageModel,
        contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
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
        await writeFile(publicPath, imageBuffer);
        await sharp(publicPath).toFile(distPath);
        console.log(`[Success] Saved background for ${loc.id}`);
      } else {
        console.warn(`[Warning] No inlineData found in response candidates for ${loc.id}`);
      }
    } catch (error) {
      console.error(`[Error] Failed to generate background for ${loc.id}:`, error);
    }
  }

  console.log('All missing locations processed.');
}

run().catch(console.error);
