import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { VectorManager } from '../vector-manager.js';

// Setup AI Provider clients
export const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
export const geminiClient = geminiKey ? new GoogleGenAI({ apiKey: geminiKey }) : null;
export const geminiModel = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';

export const openaiKey = process.env.OPENAI_API_KEY;
export const openaiClient = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;
export const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';

export let client = null;
export let modelName = '';
export let useGemini = false;
export let defaultProvider = 'none';

if (geminiClient) {
  client = geminiClient;
  modelName = geminiModel;
  useGemini = true;
  defaultProvider = 'gemini';
  console.log(`[AI] Default provider: Gemini with model: ${modelName}`);
} else if (openaiClient) {
  client = openaiClient;
  modelName = openaiModel;
  useGemini = false;
  defaultProvider = 'openai';
  console.log(`[AI] Default provider: OpenAI with model: ${modelName}`);
} else {
  console.warn('[AI] No AI provider API keys found. Server running in fallback simulation mode.');
}

export const vectorManager = new VectorManager(client);
