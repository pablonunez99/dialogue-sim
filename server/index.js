import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import sharp from 'sharp';
import { removeBackground } from '@imgly/background-removal-node';
import { getNpcImagePrompt, npcImageConfig, getLocationImagePrompt, locationImageConfig } from './data/image-prompt.js';
import { VectorManager } from './vector-manager.js';
import { buildAssetSyncPlan } from './asset-sync.js';

import { EXPRESSIONS, LOCATIONS, NPCS, getNpcLocation, CONNECTIONS as STATIC_CONNECTIONS, getPathDistance } from '../src/data/world.js';

export let CONNECTIONS = {};

export function findPath(startId, endId) {
  if (startId === endId) return [startId];
  
  const queue = [[startId]];
  const visited = new Set([startId]);
  
  while (queue.length > 0) {
    const path = queue.shift();
    const node = path[path.length - 1];
    
    if (node === endId) {
      return path;
    }
    
    const adj = CONNECTIONS[node] || [];
    for (const edge of adj) {
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push([...path, edge.to]);
      }
    }
  }
  
  return null;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const npcsFilePath = path.join(rootDir, 'server', 'data', 'npcs.json');

const app = express();
const port = Number(process.env.PORT || 5174);

// Setup AI Provider clients
const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const geminiClient = geminiKey ? new GoogleGenAI({ apiKey: geminiKey }) : null;
const geminiModel = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';

const openaiKey = process.env.OPENAI_API_KEY;
const openaiClient = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;
const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';

let client = null;
let modelName = '';
let useGemini = false;
let defaultProvider = 'none';
let vectorManager = null;

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

vectorManager = new VectorManager(client);

// DB Helpers for dynamic NPCs
let cachedNpcs = [];

async function loadNpcs() {
  try {
    let data;
    try {
      data = await readFile(npcsFilePath, 'utf8');
      cachedNpcs = JSON.parse(data);
    } catch (e) {
      console.log('[Database] npcs.json not found or invalid, initializing from world.js static NPCS');
      cachedNpcs = JSON.parse(JSON.stringify(NPCS));
    }

    const DEFAULT_ROUTINES = {
      alcaldesa: { mañana: 'plaza', tarde: 'plaza', noche: 'casa' },
      herrero: { mañana: 'forja', tarde: 'forja', noche: 'taberna' },
      curandera: { mañana: 'bosque', tarde: 'plaza', noche: 'bosque' },
      posadera: { mañana: 'taberna', tarde: 'taberna', noche: 'taberna' },
      clerigo: { mañana: 'capilla', tarde: 'capilla', noche: 'capilla' },
      molinero: { mañana: 'molinoviejo', tarde: 'molinoviejo', noche: 'molinoviejo' },
      mercader: { mañana: 'mercado', tarde: 'mercado', noche: 'taberna' },
      sepulturero: { mañana: 'cementerio', tarde: 'cementerio', noche: 'taberna' },
      capitan_guardia: { mañana: 'muralla', tarde: 'muralla', noche: 'taberna' },
      anciano: { mañana: 'plaza', tarde: 'plaza', noche: 'casa' },
      granjero: { mañana: 'granja', tarde: 'granja', noche: 'taberna' },
      pescador: { mañana: 'rio', tarde: 'rio', noche: 'casa' },
      inspector_real: { mañana: 'plaza', tarde: 'granja', noche: 'taberna' },
      bardo: { mañana: 'taberna', tarde: 'plaza', noche: 'taberna' },
      carpintero: { mañana: 'taller', tarde: 'taller', noche: 'casa' },
      costurera: { mañana: 'casa', tarde: 'casa', noche: 'casa' },
      cazador: { mañana: 'bosque', tarde: 'mercado', noche: 'casa' },
      emisario: { mañana: 'castillo', tarde: 'castillo', noche: 'castillo' },
      ermitano: { mañana: 'ruinas', tarde: 'ruinas', noche: 'ruinas' },
      huerfano: { mañana: 'plaza', tarde: 'calle', noche: 'taberna' }
    };

    let migrated = false;
    for (const npc of cachedNpcs) {
      if (!npc.routine) {
        // Find default or construct a routine based on their locationId
        npc.routine = DEFAULT_ROUTINES[npc.id] || {
          mañana: npc.locationId || 'plaza',
          tarde: npc.locationId || 'plaza',
          noche: npc.locationId || 'plaza'
        };
        migrated = true;
      }
    }

    if (migrated) {
      console.log('[Database] Migrated npcs.json to include routine field.');
      await saveNpcs(cachedNpcs);
    }

    return cachedNpcs;
  } catch (error) {
    console.error('[Database] Failed to read npcs.json, using static NPCS from world.js');
    cachedNpcs = NPCS;
    return cachedNpcs;
  }
}

async function saveNpcs(npcs) {
  try {
    const previousNpcs = [...cachedNpcs];
    await mkdir(path.dirname(npcsFilePath), { recursive: true });
    await writeFile(npcsFilePath, JSON.stringify(npcs, null, 2), 'utf8');
    cachedNpcs = npcs;

    const plan = buildAssetSyncPlan(previousNpcs, npcs, cachedLocations, cachedLocations);
    for (const npcId of plan.addedNpcIds) {
      const npc = npcs.find((item) => item.id === npcId);
      if (!npc) continue;
      console.log(`[Assets] New NPC detected in data file, generating portrait assets: ${npcId}`);
      await generateNpcPortraits(npc.id, npc.color, npc);
    }
  } catch (error) {
    console.error('[Database] Failed to write npcs.json', error);
  }
}

const locationsFilePath = path.join(rootDir, 'server', 'data', 'locations.json');
let cachedLocations = [];

async function loadLocations() {
  try {
    let data;
    try {
      data = await readFile(locationsFilePath, 'utf8');
      cachedLocations = JSON.parse(data);
    } catch (e) {
      console.log('[Database] locations.json not found or invalid, initializing from world.js static LOCATIONS');
      cachedLocations = JSON.parse(JSON.stringify(LOCATIONS));
    }

    // Migration check: verify if locations have connections field, otherwise populate from STATIC_CONNECTIONS
    let migrated = false;
    for (const loc of cachedLocations) {
      if (!loc.connections) {
        loc.connections = STATIC_CONNECTIONS[loc.id] || [];
        migrated = true;
      }
    }
    if (migrated) {
      console.log('[Database] Migrated locations.json to include connections field.');
      await saveLocations(cachedLocations);
    }

    // Rebuild the in-memory CONNECTIONS map
    CONNECTIONS = {};
    for (const loc of cachedLocations) {
      CONNECTIONS[loc.id] = loc.connections || [];
    }

    return cachedLocations;
  } catch (error) {
    console.error('[Database] Failed to read locations.json, using static LOCATIONS from world.js');
    cachedLocations = LOCATIONS;
    // Rebuild static backup connections
    CONNECTIONS = {};
    for (const loc of cachedLocations) {
      CONNECTIONS[loc.id] = STATIC_CONNECTIONS[loc.id] || [];
    }
    return cachedLocations;
  }
}

async function saveLocations(locations) {
  try {
    const previousLocations = [...cachedLocations];
    await mkdir(path.dirname(locationsFilePath), { recursive: true });
    await writeFile(locationsFilePath, JSON.stringify(locations, null, 2), 'utf8');
    cachedLocations = locations;

    // Keep CONNECTIONS in sync with saved database
    CONNECTIONS = {};
    for (const loc of locations) {
      CONNECTIONS[loc.id] = loc.connections || [];
    }

    const plan = buildAssetSyncPlan(cachedNpcs, cachedNpcs, previousLocations, locations);
    for (const locationId of plan.addedLocationIds) {
      const location = locations.find((item) => item.id === locationId);
      if (!location) continue;
      console.log(`[Assets] New location detected in data file, generating background asset: ${locationId}`);
      await generateLocationBackground(location.id, location.prompt);
    }
  } catch (error) {
    console.error('[Database] Failed to write locations.json', error);
  }
}

const sceneResponseSchema = {
  type: 'object',
  properties: {
    locationId: { type: 'string' },
    participantIds: { type: 'array', items: { type: 'string' } },
    narration: { type: 'string' },
    messages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          speakerId: { type: 'string' },
          line: { type: 'string' },
          expression: { type: 'string' }
        },
        required: ['speakerId', 'line', 'expression'],
        additionalProperties: false
      }
    },
    relationshipDeltas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          npcId: { type: 'string' },
          delta: { type: 'integer' }
        },
        required: ['npcId', 'delta'],
        additionalProperties: false
      }
    },
    trustDeltas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          npcId: { type: 'string' },
          delta: { type: 'integer' }
        },
        required: ['npcId', 'delta'],
        additionalProperties: false
      }
    },
    newNpc: {
      type: 'object',
      description: 'use it when you wish to introduce a new npc or the player talks to someone who is not pre-generated or an npc mention some new character.',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        role: { type: 'string' },
        personality: { type: 'string' },
        secret: { type: 'string' },
        hint: { type: 'string' },
        color: { type: 'string' },
        skin: { type: 'string' },
        hair: { type: 'string' },
        outfit: { type: 'string' },
        suggestions: { type: 'array', items: { type: 'string' } },
        appearancePrompt: { type: 'string' }
      },
      required: ['id', 'name', 'role', 'personality', 'secret', 'hint', 'color', 'skin', 'hair', 'outfit', 'suggestions', 'appearancePrompt'],
      additionalProperties: false
    },
    newLocation: {
      type: 'object',
      description: 'Use it to create new locations required by the story.',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        prompt: { type: 'string' },
        ambient: { type: 'string' },
        connectedTo: { type: 'string' },
        distance: { type: 'integer' }
      },
      required: ['id', 'name', 'prompt', 'ambient', 'connectedTo', 'distance'],
      additionalProperties: false
    },
    minutesPassed: { type: 'integer' },
    exitTheConversation: { type: 'array', items: { type: 'string' } },
    enterTheConversation: { type: 'array', items: { type: 'string' } },
    updateLocationImage: {
      type: 'object',
      description:'Use it to change tha image of a location only when the location looks change significantly.',
      properties: {
        locationId: { type: 'string' },
        prompt: { type: 'string' }
      },
      required: ['locationId', 'prompt'],
      additionalProperties: false
    },
    inventoryDeltas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          action: { type: 'string' }
        },
        required: ['id', 'name', 'description', 'action'],
        additionalProperties: false
      }
    },
    goldDelta: { type: 'integer' },
    questUpdates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string' }
        },
        required: ['id', 'status'],
        additionalProperties: false
      }
    },
    generateQuest: {
      type: 'object',
      properties: {
        npcId: { type: 'string' },
        urgency: { type: 'string' },
        theme: { type: 'string' }
      },
      required: ['npcId', 'urgency', 'theme'],
      additionalProperties: false
    }
  },
  required: [
    'locationId',
    'participantIds',
    'narration',
    'messages',
    'relationshipDeltas',
    'trustDeltas',
    'newNpc',
    'newLocation',
    'minutesPassed',
    'exitTheConversation',
    'enterTheConversation',
    'updateLocationImage',
    'inventoryDeltas',
    'goldDelta',
    'questUpdates',
    'generateQuest'
  ],
  additionalProperties: false
};

const worldUpdateResponseSchema = {
  type: 'object',
  properties: {
    npcActions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          npcId: { type: 'string' },
          action: { type: 'string' }
        },
        required: ['npcId', 'action'],
        additionalProperties: false
      }
    },
    deprecatedEventIds: {
      type: 'array',
      items: { type: 'string' }
    },
    newEvents: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          consequence: { type: 'string' },
          day: { type: 'integer' },
          timeOfDay: { type: 'string' },
          locationId: { type: 'string' },
          involvedNpcs: { type: 'array', items: { type: 'string' } },
          requiresFlags: { type: 'array', items: { type: 'string' } },
          excludesIfFlags: { type: 'array', items: { type: 'string' } },
          repeatable: { type: 'boolean' },
          repeatInterval: { type: 'integer' }
        },
        required: [
          'id', 'name', 'description', 'consequence', 'day', 'timeOfDay',
          'locationId', 'involvedNpcs', 'requiresFlags', 'excludesIfFlags',
          'repeatable', 'repeatInterval'
        ],
        additionalProperties: false
      }
    },
    quests: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          npcId: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          objective: { type: 'string' },
          urgency: { type: 'string' },
          triggerDirectMeet: { type: 'boolean' },
          reward: {
            type: 'object',
            properties: {
              gold: { type: 'integer' },
              relationDelta: { type: 'integer' },
              item: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' }
                },
                required: ['id', 'name', 'description'],
                additionalProperties: false
              }
            },
            required: ['gold', 'relationDelta', 'item'],
            additionalProperties: false
          }
        },
        required: ['id', 'npcId', 'title', 'description', 'objective', 'urgency', 'triggerDirectMeet', 'reward'],
        additionalProperties: false
      }
    },
    npcGoalUpdates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          npcId: { type: 'string' },
          shortTermGoal: { type: 'string' },
          longTermGoal: { type: 'string' },
          goalProgress: { type: 'string' },
          routine: {
            type: 'object',
            properties: {
              mañana: { type: 'string' },
              tarde: { type: 'string' },
              noche: { type: 'string' }
            },
            required: ['mañana', 'tarde', 'noche'],
            additionalProperties: false
          }
        },
        required: ['npcId', 'shortTermGoal', 'longTermGoal', 'goalProgress', 'routine'],
        additionalProperties: false
      }
    }
  },
  required: ['npcActions', 'deprecatedEventIds', 'newEvents', 'quests', 'npcGoalUpdates'],
  additionalProperties: false
};

const pendingUpdatesFilePath = path.join(rootDir, 'server', 'data', 'pending_updates.json');

async function loadPendingUpdates() {
  try {
    const data = await readFile(pendingUpdatesFilePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return { quests: [], npcActions: [], npcUpdates: [] };
  }
}

async function savePendingUpdates(updates) {
  try {
    await mkdir(path.dirname(pendingUpdatesFilePath), { recursive: true });
    await writeFile(pendingUpdatesFilePath, JSON.stringify(updates, null, 2), 'utf8');
  } catch (error) {
    console.error('[Database] Failed to write pending_updates.json', error);
  }
}

function getWeatherForDay(day) {
  const weathers = [
    'soleado y cálido con una brisa ligera',
    'nublado y fresco con neblina matutina en las zonas bajas',
    'lluvioso con ráfagas de viento frío y nubes densas',
    'tormentoso con truenos distantes y lluvias torrenciales',
    'fresco y despejado con un sol brillante pero viento del norte',
    'húmedo y templado con llovizna intermitente',
    'despejado y caluroso, ideal para trabajar al aire libre'
  ];
  return weathers[(day - 1) % weathers.length];
}

async function generateSingleQuestOnTheFly(manager, npcId, urgency, theme, state) {
  try {
    const npcsList = await loadNpcs();
    const locationsList = await loadLocations();
    const npc = npcsList.find(n => n.id === npcId) || { name: npcId, role: 'aldeano', personality: 'neutral' };

    const prompt = `Eres el Diseñador de Misiones (Quest Designer) de la aldea medieval de Robledal.
Debes generar exactamente UNA misión (quest) medieval lógica y contextualizada para el siguiente personaje:
- Nombre: ${npc.name} (id: ${npc.id})
- Rol: ${npc.role}
- Personalidad: ${npc.personality}

=== CONTEXTO / TEMA SOLICITADO ===
${theme}

Urgencia solicitada: ${urgency}

Ubicaciones disponibles en la aldea:
${locationsList.map(l => `- ${l.name} (id: ${l.id})`).join('\n')}

Genera la misión con el siguiente formato JSON que cumpla con el esquema:
{
  "id": "mision_${npc.id}_${Date.now()}",
  "npcId": "${npc.id}",
  "title": "Título breve e interesante en español medieval",
  "description": "Justificación narrativa detallada de la misión, alineada con el tema/contexto solicitado",
  "objective": "Objetivo directo (ej: 'Llevar la carta al molinero')",
  "urgency": "${urgency}",
  "triggerDirectMeet": false,
  "reward": {
    "gold": integer (entre 5 y 25),
    "relationDelta": integer (1 o 2),
    "item": {
      "id": "string (vacío si no hay objeto)",
      "name": "string",
      "description": "string"
    }
  }
}`;

    const singleQuestSchema = {
      type: 'object',
      properties: {
        id: { type: 'string' },
        npcId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        objective: { type: 'string' },
        urgency: { type: 'string' },
        triggerDirectMeet: { type: 'boolean' },
        reward: {
          type: 'object',
          properties: {
            gold: { type: 'integer' },
            relationDelta: { type: 'integer' },
            item: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string' }
              },
              required: ['id', 'name', 'description'],
              additionalProperties: false
            }
          },
          required: ['gold', 'relationDelta', 'item'],
          additionalProperties: false
        }
      },
      required: ['id', 'npcId', 'title', 'description', 'objective', 'urgency', 'triggerDirectMeet', 'reward'],
      additionalProperties: false
    };

    let questResult = null;
    if (manager.client) {
      if (manager.isGemini) {
        const response = await manager.client.models.generateContent({
          model: manager.model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            responseMimeType: 'application/json',
            responseSchema: singleQuestSchema
          }
        });
        questResult = parseModelJson(response.text);
      } else {
        const response = await manager.client.chat.completions.create({
          model: manager.model,
          messages: [{ role: 'user', content: prompt }],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'single_quest_response',
              strict: true,
              schema: singleQuestSchema
            }
          }
        });
        const content = response.choices[0].message.content;
        questResult = parseModelJson(content);
      }
    }

    if (questResult && questResult.id) {
      questResult.dayGenerated = state.day || 1;
      questResult.status = 'active';
      return questResult;
    }
    throw new Error('Invalid quest response from AI');
  } catch (err) {
    console.error('[QuestEngine] On-the-fly quest generation failed, using fallback:', err.message);
    return {
      id: `mision_${npcId}_otf_${Date.now()}`,
      npcId: npcId,
      title: `El encargo de ${npcId}`,
      description: `Se ha solicitado una tarea especial respecto a: ${theme}`,
      objective: `Hablar con el personaje para resolver el asunto.`,
      urgency: urgency,
      triggerDirectMeet: false,
      reward: { gold: 12, relationDelta: 1, item: { id: "", name: "", description: "" } },
      dayGenerated: state.day || 1,
      status: 'active'
    };
  }
}

async function runMorningWorldUpdate(manager, day, history, state) {
  try {
    const npcsList = await loadNpcs();
    const locationsList = await loadLocations();
    const currentEvents = await loadEvents();

    const yesterdayHistory = Array.isArray(history)
      ? history.filter(entry => entry.day === day - 1 || (entry.type !== 'player' && !entry.day))
      : [];
    
    let historyText = '';
    if (yesterdayHistory.length === 0) {
      const recent = Array.isArray(history) ? history.slice(-40) : [];
      historyText = recent.map(h => `${h.speaker || 'Viajero'}: "${h.line}"`).join('\n');
    } else {
      historyText = yesterdayHistory.map(h => `${h.speaker || 'Viajero'}: "${h.line}"`).join('\n');
    }

    const npcActivityLog = Array.isArray(state?.npcActivityLog) ? state.npcActivityLog : [];
    let npcActivityContext = '';
    if (npcActivityLog.length > 0) {
      npcActivityContext = 'Registro acumulado de acciones previas de NPCs:\n' +
        npcActivityLog.slice(-25).map(log => `- Día ${log.day}: [${log.npcId}] ${log.action}`).join('\n') + '\n';
    }

    const activeFlags = Array.isArray(state?.flags) ? state.flags : [];

    const prompt = `Eres el Agente de Simulación del Mundo de la aldea medieval de Robledal.
Hoy comienza el Amanecer del Día ${day}. Tu tarea es procesar los eventos y la bitácora del día anterior (Día ${day - 1}) para actualizar el estado del mundo y la vida de los aldeanos.

=== CONVERSACIONES DEL DÍA ANTERIOR ===
${historyText}

=== ESTADO ACTUAL DEL MUNDO ===
Ubicaciones de la aldea: ${locationsList.map(l => `${l.name} (id: ${l.id})`).join(', ')}
${npcActivityContext}
Banderas de estado activas: [${activeFlags.join(', ')}]

NPCs de la aldea (con sus objetivos y rutinas actuales):
${npcsList.map(n => `- ${n.name} (id: ${n.id}, rol: ${n.role})
  * Objetivo a Corto Plazo: "${n.shortTermGoal || 'Establecer contacto inicial con el Viajero'}"
  * Objetivo a Largo Plazo: "${n.longTermGoal || 'Cumplir con sus deberes diarios en Robledal'}"
  * Progreso del Objetivo: "${n.goalProgress || 'Aún no iniciado'}"
  * Rutina de ayer: Mañana: ${n.routine?.mañana || 'plaza'}, Tarde: ${n.routine?.tarde || 'plaza'}, Noche: ${n.routine?.noche || 'plaza'}`).join('\n')}

=== EVENTOS PROGRAMADOS ACTUALMENTE ===
${JSON.stringify(currentEvents, null, 2)}

TAREAS A REALIZAR (DEVOLVER EN UN ÚNICO JSON):
1. EXTRAER ACCIONES DE NPCs ("npcActions"): Analiza la conversación de ayer y extrae un resumen conciso (máx 15 palabras) de las acciones, movimientos, secretos revelados o promesas que CADA NPC presente realizó.
2. DEPRECAR EVENTOS ("deprecatedEventIds"): Si el jugador tomó acciones que impiden que un evento programado ocurra (ej: si el jugador descubrió y detuvo un robo, el evento de robo futuro debe cancelarse), indica sus IDs de evento aquí para eliminarlos.
3. CREAR NUEVOS EVENTOS ("newEvents"): Si las acciones del jugador o los NPCs ayer generaron consecuencias para el futuro, crea nuevos eventos programados para los próximos días.
4. GENERAR NUEVAS MISIONES ("quests"): Elige a 1 o 2 NPCs aleatorios en base a sus acciones recientes y genera una nueva misión medieval lógica para cada uno de ellos para este nuevo Día ${day}.
5. SIMULAR METAS Y RUTINAS ("npcGoalUpdates"): Para CADA NPC de la aldea, debes:
   - Evaluar si su objetivo a corto plazo o largo plazo se ha completado basándose en las acciones de ayer. Si se ha completado, define un NUEVO objetivo medieval lógico para reemplazarlo y actualiza el progreso indicando que el anterior se completó y ahora inicia este.
   - Si no se ha completado, mantén el objetivo pero actualiza la descripción del progreso ("goalProgress") reflejando los avances o lo que planea hacer hoy para avanzar.
   - Determinar su rutina para el Día ${day} ("routine" con mañana, tarde y noche). Esta rutina DEBE ser coherente con sus objetivos activos (ej: si busca suministros irá al "mercado", si busca descansar irá a la "taberna" o su "casa", etc. Solo usa ubicaciones conocidas del mapa).

Devuelve únicamente el objeto JSON que cumpla con worldUpdateResponseSchema.`;

    let updateResult = null;
    if (manager.client) {
      if (manager.isGemini) {
        const response = await manager.client.models.generateContent({
          model: manager.model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            responseMimeType: 'application/json',
            responseSchema: worldUpdateResponseSchema
          }
        });
        updateResult = parseModelJson(response.text);
      } else {
        const response = await manager.client.chat.completions.create({
          model: manager.model,
          messages: [{ role: 'user', content: prompt }],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'world_update_response',
              strict: true,
              schema: worldUpdateResponseSchema
            }
          }
        });
        const content = response.choices[0].message.content;
        updateResult = parseModelJson(content);
      }
    }

    if (!updateResult || typeof updateResult !== 'object') {
      throw new Error('Invalid output format from AI for world update');
    }

    const npcActions = Array.isArray(updateResult.npcActions) ? updateResult.npcActions : [];
    const formattedActions = npcActions
      .filter(a => a.npcId && a.action && a.action.trim() !== '')
      .map(a => ({
        day: day - 1,
        time: '23:59',
        npcId: a.npcId,
        action: a.action
      }));

    const deprecatedEventIds = Array.isArray(updateResult.deprecatedEventIds) ? updateResult.deprecatedEventIds : [];
    if (deprecatedEventIds.length > 0) {
      console.log(`[QuestEngine] Deprecating events via background agent: ${deprecatedEventIds.join(', ')}`);
      const filteredEvents = currentEvents.filter(ev => !deprecatedEventIds.includes(ev.id));
      await saveEvents(filteredEvents);
    }

    const newEvents = Array.isArray(updateResult.newEvents) ? updateResult.newEvents : [];
    const validNewEvents = newEvents.filter(ev => ev.id && ev.id !== '');
    if (validNewEvents.length > 0) {
      console.log(`[QuestEngine] Registering ${validNewEvents.length} new events from background agent...`);
      const updatedEvents = [...currentEvents.filter(ev => !validNewEvents.some(ne => ne.id === ev.id)), ...validNewEvents];
      await saveEvents(updatedEvents);
    }

    const quests = Array.isArray(updateResult.quests) ? updateResult.quests : [];
    quests.forEach(q => {
      q.dayGenerated = day;
      q.status = 'active';
    });

    const npcGoalUpdates = Array.isArray(updateResult.npcGoalUpdates) ? updateResult.npcGoalUpdates : [];
    if (npcGoalUpdates.length > 0) {
      console.log(`[QuestEngine] Processing ${npcGoalUpdates.length} NPC goal and routine updates...`);
      const updatedNpcs = npcsList.map(npc => {
        const update = npcGoalUpdates.find(u => u.npcId === npc.id);
        if (update) {
          return {
            ...npc,
            shortTermGoal: update.shortTermGoal,
            longTermGoal: update.longTermGoal,
            goalProgress: update.goalProgress,
            routine: update.routine
          };
        }
        return npc;
      });
      await saveNpcs(updatedNpcs);
    }

    console.log(`[QuestEngine] Morning world update finished. Generated ${quests.length} quests, extracted ${formattedActions.length} NPC actions, and updated ${npcGoalUpdates.length} NPC goals.`);

    await savePendingUpdates({
      quests,
      npcActions: formattedActions,
      npcUpdates: npcGoalUpdates.map(u => ({
        id: u.npcId,
        shortTermGoal: u.shortTermGoal,
        longTermGoal: u.longTermGoal,
        goalProgress: u.goalProgress,
        routine: u.routine
      }))
    });

  } catch (err) {
    console.error('[QuestEngine] Background morning world update failed, using fallbacks:', err.message);
    const npcsList = await loadNpcs();
    const shuffled = npcsList.filter(n => n.id !== 'narrator').sort(() => 0.5 - Math.random());
    const npc1 = shuffled[0];
    const npc2 = shuffled[1];

    const fallbackQuests = [
      {
        id: `fb_quest_${npc1.id}_${day}`,
        npcId: npc1.id,
        title: `El favor de ${npc1.name}`,
        description: `${npc1.name} necesita que le hagas un favor rápido en la aldea.`,
        objective: `Hablar con el primer aldeano que encuentres en la plaza.`,
        urgency: Math.random() > 0.5 ? 'alta' : 'media',
        triggerDirectMeet: Math.random() > 0.6,
        reward: { gold: 10, relationDelta: 1, item: { id: "", name: "", description: "" } },
        dayGenerated: day,
        status: 'active'
      },
      {
        id: `fb_quest_${npc2.id}_${day}`,
        npcId: npc2.id,
        title: `Entrega medieval`,
        description: `Se requiere llevar un cargamento ligero al otro extremo de la aldea.`,
        objective: `Llevar suministros a la taberna.`,
        urgency: 'baja',
        triggerDirectMeet: false,
        reward: { gold: 8, relationDelta: 1, item: { id: "", name: "", description: "" } },
        dayGenerated: day,
        status: 'active'
      }
    ];

    await savePendingUpdates({
      quests: fallbackQuests,
      npcActions: [],
      npcUpdates: []
    });
  }
}

const eventsFilePath = path.join(rootDir, 'server', 'data', 'events.json');
let cachedEvents = [];

async function loadEvents() {
  try {
    const data = await readFile(eventsFilePath, 'utf8');
    cachedEvents = JSON.parse(data);
    return cachedEvents;
  } catch (error) {
    console.error('[Database] Failed to read events.json');
    cachedEvents = [];
    return cachedEvents;
  }
}

async function saveEvents(events) {
  try {
    await mkdir(path.dirname(eventsFilePath), { recursive: true });
    await writeFile(eventsFilePath, JSON.stringify(events, null, 2), 'utf8');
    cachedEvents = events;
  } catch (error) {
    console.error('[Database] Failed to write events.json', error);
  }
}

function getTimeOfDay(timeStr) {
  const [hourStr] = timeStr.split(':');
  const hour = parseInt(hourStr, 10);
  if (hour >= 6 && hour <= 12) {
    return 'mañana';
  } else if (hour >= 13 && hour <= 18) {
    return 'tarde';
  } else {
    return 'noche';
  }
}

function addMinutesToTime(day, timeStr, minutesToAdd) {
  const [hourStr, minStr] = timeStr.split(':');
  let hour = parseInt(hourStr, 10);
  let min = parseInt(minStr, 10);

  min += minutesToAdd;
  const extraHours = Math.floor(min / 60);
  min = min % 60;

  hour += extraHours;
  const extraDays = Math.floor(hour / 24);
  hour = hour % 24;

  const newDay = day + extraDays;
  const newTimeStr = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;

  return { day: newDay, time: newTimeStr };
}

function getEligibleEvent(locationId, state, events) {
  const { day = 1, time = '08:00', flags = [], completedEvents = [] } = state;
  const timeOfDay = getTimeOfDay(time);

  const eligible = events.filter((event) => {
    if (event.day !== 0 && event.day !== day) {
      return false;
    }

    if (event.day === 0) {
      if (!event.repeatable || !event.repeatInterval) return false;
      if (day % event.repeatInterval !== 0) return false;
    }

    if (event.timeOfDay && event.timeOfDay !== timeOfDay) {
      return false;
    }

    if (event.locationId && event.locationId !== locationId) {
      return false;
    }

    if (event.requiresFlags && event.requiresFlags.length > 0) {
      const hasAll = event.requiresFlags.every((flag) => flags.includes(flag));
      if (!hasAll) return false;
    }

    if (event.excludesIfFlags && event.excludesIfFlags.length > 0) {
      const hasAny = event.excludesIfFlags.some((flag) => flags.includes(flag));
      if (hasAny) return false;
    }

    if (!event.repeatable && completedEvents.includes(event.id)) {
      return false;
    }

    return true;
  });

  if (eligible.length === 0) return null;

  const priorityMap = { principal: 3, secundario: 2, ambiental: 1 };
  eligible.sort((a, b) => {
    const prioA = priorityMap[a.type] || 0;
    const prioB = priorityMap[b.type] || 0;
    return prioB - prioA;
  });

  return eligible[0];
}

async function triggerBackgroundEvents(state, events, currentLocations) {
  const notifications = [];
  let updated = false;

  const currentTOD = state.timeOfDay || getTimeOfDay(state.time);
  
  const getWeight = (tod) => {
    if (tod === 'mañana') return 1;
    if (tod === 'tarde') return 2;
    return 3; // noche
  };

  const currentWeight = getWeight(currentTOD);

  for (const ev of events) {
    // Only run story events (non-repeatable, specific day)
    if (ev.day === 0 || ev.repeatable) continue;
    
    // Skip if already completed
    if (state.completedEvents.includes(ev.id)) continue;

    // Check if the trigger condition is met (day and timeOfDay reached or passed)
    const isDayPassed = state.day > ev.day;
    const evWeight = ev.timeOfDay ? getWeight(ev.timeOfDay) : 1;
    const isSameDayPassed = state.day === ev.day && currentWeight >= evWeight;

    if (isDayPassed || isSameDayPassed) {
      console.log(`[EventEngine] Event "${ev.name}" (${ev.id}) triggered in the background at Day ${state.day} - ${state.time}`);
      state.completedEvents.push(ev.id);

      // Apply consequences (flags)
      if (ev.setsFlags && ev.setsFlags.length > 0) {
        ev.setsFlags.forEach(f => {
          if (!state.flags.includes(f)) {
            state.flags.push(f);
          }
        });
      }

      // Add narrator notification so player sees what happened
      const locName = currentLocations.find(l => l.id === ev.locationId)?.name || ev.locationId || 'la aldea';
      notifications.push({
        speakerId: 'narrator',
        line: `[Sucesos de la Aldea] Mientras tanto, en ${locName}: ${ev.description} (Consecuencia: ${ev.consequence || 'Se han producido cambios en la aldea.'})`,
        expression: 'neutral'
      });
      updated = true;
    }
  }

  return { updated, notifications };
}

// Background Generator for locations
async function generateLocationBackground(locationId, promptDescription) {
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

async function syncNpcToVectorDb(npc) {
  if (!vectorManager) return;
  const text = [
    `NPC: ${npc.name} (id: ${npc.id}), ${npc.role} de la aldea.`,
    `Personalidad: ${npc.personality}`,
    npc.background ? `Historia: ${npc.background}` : '',
    npc.fears ? `Miedos: ${npc.fears}` : '',
    npc.desires ? `Deseos: ${npc.desires}` : '',
    npc.quirks ? `Manías: ${npc.quirks}` : '',
    npc.speech_style ? `Forma de hablar: ${npc.speech_style}` : '',
    npc.relationships ? `Relaciones: ${npc.relationships}` : '',
    `Secreto: ${npc.secret}`,
    `Pista: ${npc.hint}`,
    `Ubicación: ${npc.locationId}.`
  ].filter(Boolean).join('\n');
  await vectorManager.upsertItem(`npc_${npc.id}`, text, { type: 'npc', id: npc.id });
}

async function syncLocationToVectorDb(loc) {
  if (!vectorManager) return;
  const text = `Ubicación: ${loc.name} (id: ${loc.id}).
Ambiente visual: ${loc.prompt}.
Sonidos y atmósfera: ${loc.ambient}.`;
  await vectorManager.upsertItem(`location_${loc.id}`, text, { type: 'location', id: loc.id });
}

async function syncAllToVectorDb() {
  if (!vectorManager) return;
  console.log('[VectorManager] Sincronizando base de datos con el índice vectorial...');
  const npcs = await loadNpcs();
  for (const npc of npcs) {
    await syncNpcToVectorDb(npc);
  }
  const locations = await loadLocations();
  for (const loc of locations) {
    await syncLocationToVectorDb(loc);
  }
  console.log('[VectorManager] Sincronización completada.');
}

// Portrait Generator & Slicer (Gemini Image + Chroma key using background-remove)
async function generateNpcPortraits(npcId, npcColor, npcMetadata) {
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

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(rootDir, 'dist')));

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

app.get('/assets/portraits/:portraitName', async (req, res, next) => {
  const portraitName = req.params.portraitName;
  const portraitPath = path.join(rootDir, 'public', 'assets', 'portraits', portraitName);
  const distPath = path.join(rootDir, 'dist', 'assets', 'portraits', portraitName);

  if (await fileExists(portraitPath)) {
    return res.sendFile(portraitPath);
  }

  // Try generating missing portrait dynamically if it matches NPC expression pattern
  const match = portraitName.match(/^([a-z0-9_-]+)-(neutral|happy|angry|sad|surprised|smirky)\.png$/i);
  if (!match) {
    return next();
  }

  const npcId = match[1];
  const expression = match[2];
  const currentNpcs = await loadNpcs();
  const npc = currentNpcs.find((item) => item.id === npcId);

  if (!npc) {
    return next();
  }

  console.log(`[Assets] Portrait missing for ${portraitName}; generating on demand.`);
  await generateNpcPortraits(npc.id, npc.color, npc);

  if (await fileExists(portraitPath)) {
    return res.sendFile(portraitPath);
  }

  if (await fileExists(distPath)) {
    return res.sendFile(distPath);
  }

  next();
});

// Serve dynamic world metadata (locations, dynamic NPCs, expressions)
app.get('/api/world', async (_req, res) => {
  const currentNpcs = await loadNpcs();
  const currentLocations = await loadLocations();
  const currentEvents = await loadEvents();
  res.json({
    locations: currentLocations,
    npcs: currentNpcs,
    expressions: EXPRESSIONS,
    events: currentEvents
  });
});

app.get('/api/config', (_req, res) => {
  res.json({
    providers: {
      gemini: {
        available: Boolean(geminiClient),
        model: geminiModel
      },
      openai: {
        available: Boolean(openaiClient),
        model: openaiModel
      }
    }
  });
});

app.post('/api/conversation', async (req, res) => {
  let { locationId, participantIds, playerText, history = [], state = {}, provider } = req.body ?? {};
  console.log(`\n[Server] POST /api/conversation - locationId: "${locationId}", participantIds: [${(participantIds || []).join(', ')}], playerText: "${playerText}", history length: ${history.length}, provider: "${provider}"`);
  
  const currentLocations = await loadLocations();
  
  const inputState = {
    locationId: state.locationId || locationId,
    relationships: state.relationships || {},
    trust: state.trust || {},
    day: typeof state.day === 'number' ? state.day : 1,
    time: typeof state.time === 'string' ? state.time : '08:00',
    flags: Array.isArray(state.flags) ? state.flags : [],
    completedEvents: Array.isArray(state.completedEvents) ? state.completedEvents : [],
    inventory: Array.isArray(state.inventory) ? state.inventory : [],
    gold: typeof state.gold === 'number' ? state.gold : 0,
    quests: Array.isArray(state.quests) ? state.quests : [],
    npcActivityLog: Array.isArray(state.npcActivityLog) ? state.npcActivityLog : []
  };

  // Intercept if travelQueue is active (meaning a step-by-step automatic trip is ongoing)
  let travelQueue = Array.isArray(state.travelQueue) ? [...state.travelQueue] : [];
  const isManualTravel = locationId !== state.locationId && (travelQueue.length === 0 || travelQueue[0] !== locationId);
  if (isManualTravel) {
    // Resolve the path from oldLocId to locationId
    const path = findPath(state.locationId || 'plaza', locationId);
    if (path && path.length > 2) {
      const nextStep = path[1];
      travelQueue = path.slice(2);
      console.log(`[JourneyEngine] Player initiated multi-node journey from "${state.locationId}" to "${locationId}". Path: [${path.join(' -> ')}]. Next step: "${nextStep}", Remaining queue: [${travelQueue.join(', ')}].`);
      locationId = nextStep; // Override requested locationId to the next step
    } else {
      travelQueue = [];
    }
  }

  const oldLocId = state.locationId || locationId;
  let travelMinutes = 0;
  let hasTraveled = false;

  if (travelQueue.length > 0) {
    const nextStep = travelQueue.shift();
    const conn = (CONNECTIONS[oldLocId] || []).find(c => c.to === nextStep);
    travelMinutes = conn ? conn.distance : 5;
    
    const { day: advancedDay, time: advancedTime } = addMinutesToTime(inputState.day, inputState.time, travelMinutes);
    inputState.day = advancedDay;
    inputState.time = advancedTime;
    inputState.locationId = nextStep;
    locationId = nextStep; // Override locationId parameter for this turn!
    hasTraveled = true;
    
    console.log(`[JourneyEngine] Processing step in active journey: "${oldLocId}" -> "${nextStep}". Remaining queue: [${travelQueue.join(', ')}].`);
  } else if (oldLocId !== locationId) {
    // Normal single-step travel
    const conn = (CONNECTIONS[oldLocId] || []).find(c => c.to === locationId);
    travelMinutes = conn ? conn.distance : 5;
    
    const { day: advancedDay, time: advancedTime } = addMinutesToTime(inputState.day, inputState.time, travelMinutes);
    inputState.day = advancedDay;
    inputState.time = advancedTime;
    inputState.locationId = locationId;
    hasTraveled = true;
    console.log(`[TravelEngine] Player manually traveled from "${oldLocId}" to "${locationId}" (${travelMinutes} min). Time advanced to Day ${inputState.day} - ${inputState.time}`);
  }

  inputState.travelQueue = travelQueue;

  const location = currentLocations.find((item) => item.id === locationId);
  if (!location || !String(playerText ?? '').trim()) {
    return res.status(400).json({ error: 'Faltan datos de conversacion o ubicacion invalida.' });
  }

  const events = await loadEvents();
  const bgStartResult = await triggerBackgroundEvents(inputState, events, currentLocations);
  const activeEvent = getEligibleEvent(locationId, inputState, events);
  let finalParticipantIds = participantIds;
  if (hasTraveled) {
    // Clear participants list so that the server resolves the NPCs who are actually at the new location
    finalParticipantIds = [];
  }

  if (activeEvent) {
    console.log(`[EventEngine] Active Event Triggered: "${activeEvent.name}" (${activeEvent.id})`);
    if (activeEvent.setsFlags && activeEvent.setsFlags.length > 0) {
      activeEvent.setsFlags.forEach(f => {
        if (!inputState.flags.includes(f)) {
          inputState.flags.push(f);
        }
      });
    }
    if (!activeEvent.repeatable) {
      if (!inputState.completedEvents.includes(activeEvent.id)) {
        inputState.completedEvents.push(activeEvent.id);
      }
    }
    if (activeEvent.involvedNpcs && activeEvent.involvedNpcs.length > 0) {
      finalParticipantIds = activeEvent.involvedNpcs;
    }
  }

  let unexpectedEventNote = '';
  const rollTwist = Math.random() < 0.15;
  let twistTriggered = false;

  if (rollTwist) {
    twistTriggered = true;
    const twists = [
      `INTRUSIÓN INESPERADA: Un NPC aleatorio de la aldea (que no estaba participando) irrumpe de golpe en la escena o interrumpe la conversación con una noticia urgente, una acusación dramática o una exigencia extraña. El DM debe forzar a este NPC a ingresar en el campo 'enterTheConversation' y hacerlo hablar.`,
      `ACCIDENTE O DESASTRE INESPERADO: Algo sale repentina y cómicamente mal en el entorno físico o la acción. Por ejemplo: se rompe un barril y derrama todo, colapsa una repisa, se suelta un animal, cae una gotera tremenda, o un NPC comete un error torpe que revela algo vergonzoso. Narra este incidente y haz que los personajes reaccionen con molestia o asombro.`,
      `GOLPE DE SUERTE INESPERADO: Algo sale extraordinariamente bien de forma imprevista. Por ejemplo: descubren una moneda de oro perdida bajo una tabla, un NPC gruñón tiene un arranque inusual de generosidad y regala algo o confiesa una pista valiosa, o un problema menor se resuelve de forma milagrosa. Refleja esto en el diálogo.`,
      `DISTURBIO EXTERNO DE IMPREVISTO: Se escucha de repente un grito lejano, un golpe sordo o un estruendo misterioso que proviene de una ubicación adyacente. El diálogo se detiene abruptamente y los personajes presentes reaccionan con pánico, sospecha o curiosidad, alentando al jugador a investigar.`
    ];
    const chosenTwist = twists[Math.floor(Math.random() * twists.length)];
    unexpectedEventNote = `\n\n=== EVENTO INESPERADO (15% DE CHANCE ACTIVADO) ===\n` +
      `ATENCIÓN: Para este turno, debes forzar e integrar el siguiente giro inesperado en la narrativa y los diálogos:\n${chosenTwist}\n`;
    console.log(`[TwistEngine] 15% Chance Twist Triggered: "${chosenTwist.split(':')[0]}"`);
  }

  // If an event or a twist triggered at this intermediate stop, we halt the travel queue
  if ((activeEvent || twistTriggered) && travelQueue.length > 0) {
    console.log(`[JourneyEngine] Incident triggered at intermediate stop "${locationId}" (Event: ${activeEvent?.id || 'none'}, Twist: ${twistTriggered}). Halting travel queue.`);
    travelQueue = [];
    inputState.travelQueue = [];
  }

  // If this is an intermediate stop and nothing happened, return a fast transition scene
  if (travelQueue.length > 0 && !activeEvent && !twistTriggered) {
    const stopName = currentLocations.find(l => l.id === locationId)?.name || locationId;
    const destName = currentLocations.find(l => l.id === travelQueue[travelQueue.length - 1])?.name || travelQueue[travelQueue.length - 1];

    console.log(`[JourneyEngine] Simple transition stop at "${locationId}" during journey to "${destName}". Returning fast transition.`);

    const transitionScene = {
      locationId: locationId,
      participantIds: [],
      narration: `En viaje hacia ${destName}.`,
      messages: [
        {
          speakerId: 'narrator',
          line: `[Especial] Pasas por ${stopName} en dirección a tu destino final. Todo parece tranquilo aquí por el momento.`,
          expression: 'neutral'
        }
      ],
      relationshipDeltas: [],
      trustDeltas: [],
      newNpc: null,
      newLocation: null,
      minutesPassed: travelMinutes,
      exitTheConversation: [],
      enterTheConversation: [],
      updateLocationImage: null,
      inventoryDeltas: [],
      goldDelta: 0,
      questUpdates: [],
      state: {
        ...inputState,
        travelQueue: travelQueue
      }
    };

    // Run morning update if day advanced
    const isNewDay = inputState.day > (state.day || 1);
    if (isNewDay) {
      console.log(`[QuestEngine] Day advanced to ${inputState.day} during transition. Triggering morning world update...`);
      const activeProvider = provider || state.provider || defaultProvider;
      let currentClient = client;
      let currentModel = modelName;
      let currentIsGemini = useGemini;

      if (activeProvider === 'gemini' && geminiClient) {
        currentClient = geminiClient;
        currentModel = geminiModel;
        currentIsGemini = true;
      } else if (activeProvider === 'openai' && openaiClient) {
        currentClient = openaiClient;
        currentModel = openaiModel;
        currentIsGemini = false;
      }

      const activeConversationManager = new ConversationManager({
        client: currentClient,
        model: currentModel,
        isGemini: currentIsGemini
      });
      runMorningWorldUpdate(activeConversationManager, inputState.day, history, inputState);
    }

    return res.json(transitionScene);
  }

  const activeProvider = provider || state.provider || defaultProvider;
  let currentClient = client;
  let currentModel = modelName;
  let currentIsGemini = useGemini;

  if (activeProvider === 'gemini' && geminiClient) {
    currentClient = geminiClient;
    currentModel = geminiModel;
    currentIsGemini = true;
  } else if (activeProvider === 'openai' && openaiClient) {
    currentClient = openaiClient;
    currentModel = openaiModel;
    currentIsGemini = false;
  }

  const activeConversationManager = new ConversationManager({
    client: currentClient,
    model: currentModel,
    isGemini: currentIsGemini
  });

  try {
    const scene = await activeConversationManager.createScene({
      locationId,
      participantIds: finalParticipantIds,
      playerText,
      history,
      state: inputState,
      activeEvent,
      travelMinutes,
      unexpectedEventNote
    });

    // Check if the DM requested to generate a quest on-the-fly
    if (scene.generateQuest && scene.generateQuest.npcId && scene.generateQuest.npcId !== '') {
      console.log(`[QuestEngine] Dungeon Master requested on-the-fly quest generation for NPC: "${scene.generateQuest.npcId}" with theme: "${scene.generateQuest.theme}"`);
      const newQuest = await generateSingleQuestOnTheFly(
        activeConversationManager, 
        scene.generateQuest.npcId, 
        scene.generateQuest.urgency || 'media', 
        scene.generateQuest.theme || 'favor general', 
        inputState
      );
      inputState.quests.push(newQuest);
      console.log(`[QuestEngine] Successfully registered on-the-fly quest: "${newQuest.title}" (${newQuest.id})`);
    }

    // Handle dynamic NPC creation
    if (scene.newNpc && scene.newNpc.id) {
      const currentNpcs = await loadNpcs();
      const cleanId = scene.newNpc.id.toLowerCase().replace(/[^a-z0-9]/g, '');
      const matchedNpc = currentNpcs.find(npc => npc.id === cleanId || npc.name.toLowerCase().trim() === scene.newNpc.name.toLowerCase().trim());
      
      if (matchedNpc) {
        console.log(`[Database] Collision detected for new NPC request: "${scene.newNpc.name}" (ID in request: "${scene.newNpc.id}"). Remapping all references to existing NPC ID "${matchedNpc.id}".`);
        // Remap in participantIds
        scene.participantIds = scene.participantIds.map(id => id === scene.newNpc.id ? matchedNpc.id : id);
        // Remap in messages speakerId
        scene.messages = scene.messages.map(m => m.speakerId === scene.newNpc.id ? { ...m, speakerId: matchedNpc.id } : m);
        // Nullify newNpc
        scene.newNpc = null;
      } else {
        console.log(`[Database] Registering new NPC generated by Dungeon Master: ${scene.newNpc.name}`);
        
        const cleanNpc = {
          id: cleanId,
          name: scene.newNpc.name,
          role: scene.newNpc.role,
          locationId: scene.newNpc.locationId || locationId,
          personality: scene.newNpc.personality,
          secret: scene.newNpc.secret,
          hint: scene.newNpc.hint,
          color: scene.newNpc.color || '#7c7c7c',
          skin: scene.newNpc.skin || '#dfab8f',
          hair: scene.newNpc.hair || '#2b1b17',
          outfit: scene.newNpc.outfit || 'civic',
          suggestions: Array.isArray(scene.newNpc.suggestions) ? scene.newNpc.suggestions : ["Hablar", "Preguntar"]
        };

        const updatedNpcs = [...currentNpcs, cleanNpc];
        await saveNpcs(updatedNpcs);

        // Generate portraits synchronously so they exist when client receives the response
        await generateNpcPortraits(
          cleanNpc.id,
          cleanNpc.color,
          cleanNpc
        );

        // Sync new NPC to Vector DB
        await syncNpcToVectorDb(cleanNpc);
      }
    }

    // Handle dynamic Location creation
    if (scene.newLocation && scene.newLocation.id) {
      const currentLocations = await loadLocations();
      const cleanLocId = scene.newLocation.id.toLowerCase().replace(/[^a-z0-9]/g, '');
      const exists = currentLocations.some(loc => loc.id === cleanLocId);

      if (!exists) {
        console.log(`[Database] Registering new Location generated by Dungeon Master: ${scene.newLocation.name}`);
        
        // Resolve parent connection node and distance
        const parentLocId = String(scene.newLocation.connectedTo || oldLocId).trim().toLowerCase();
        const distance = Number(scene.newLocation.distance || 5);
        
        const cleanLocation = {
          id: cleanLocId,
          name: scene.newLocation.name,
          asset: `assets/locations/${cleanLocId}.png`,
          prompt: scene.newLocation.prompt,
          ambient: scene.newLocation.ambient || 'Silencio medieval y misterio en el ambiente.',
          connections: [
            { to: parentLocId, distance: distance }
          ]
        };

        // Mutate parent in current list to establish the bidirectional connection
        const parentLoc = currentLocations.find(l => l.id === parentLocId);
        if (parentLoc) {
          if (!parentLoc.connections) parentLoc.connections = [];
          const connExists = parentLoc.connections.some(c => c.to === cleanLocId);
          if (!connExists) {
            parentLoc.connections.push({ to: cleanLocId, distance: distance });
          }
        }

        const updatedLocations = [...currentLocations, cleanLocation];
        await saveLocations(updatedLocations);

        // Generate location background synchronously — image is ready before response is sent
        const generated = await generateLocationBackground(cleanLocation.id, cleanLocation.prompt);

        // Attach a cache-busted assetUrl to the scene so the client gets the final URL
        const ts = Date.now();
        scene.newLocation.id = cleanLocId;
        scene.newLocation.assetUrl = generated
          ? `assets/locations/${cleanLocId}.png?t=${ts}`
          : null;

        // Sync new Location to Vector DB
        await syncLocationToVectorDb(cleanLocation);
      }
    }

    // Handle AI request to update/overwrite an existing location image
    if (scene.updateLocationImage && scene.updateLocationImage.locationId && scene.updateLocationImage.locationId.trim() !== '') {
      const locIdToUpdate = String(scene.updateLocationImage.locationId).trim().toLowerCase();
      const newPrompt = String(scene.updateLocationImage.prompt || '').trim();
      
      const currentLocations = await loadLocations();
      const existingLoc = currentLocations.find((loc) => loc.id === locIdToUpdate);
      if (existingLoc && newPrompt) {
        console.log(`[Server] Overwriting background image for location: ${locIdToUpdate} with prompt: "${newPrompt}"`);
        existingLoc.prompt = newPrompt;
        await saveLocations(currentLocations);

        // Generate the new background image synchronously to overwrite the file
        await generateLocationBackground(locIdToUpdate, newPrompt);
        
        // Attach updated location info to the payload response so the client knows it changed
        const ts = Date.now();
        scene.locationUpdate = {
          id: locIdToUpdate,
          prompt: newPrompt,
          assetUrl: `assets/locations/${locIdToUpdate}.png?t=${ts}`
        };

        // Re-sync to Vector DB
        await syncLocationToVectorDb(existingLoc);
      }
    }

    // Resolve narrative travel if the AI shifted the location ID
    const postLocId = scene.locationId || locationId;
    let aiTravelMinutes = 0;
    if (locationId !== postLocId) {
      const path = findPath(locationId, postLocId);
      if (path && path.length > 2) {
        // AI attempted a multi-node jump. We step to the next adjacent node and queue the rest!
        const nextStepLocId = path[1];
        const remainingQueue = path.slice(2);
        
        const conn = (CONNECTIONS[locationId] || []).find(c => c.to === nextStepLocId);
        aiTravelMinutes = conn ? conn.distance : 5;
        
        scene.locationId = nextStepLocId;
        inputState.travelQueue = remainingQueue;
        
        console.log(`[JourneyEngine] Intercepted AI jump from "${locationId}" to "${postLocId}". Forcing step to "${nextStepLocId}". Remaining queue: [${remainingQueue.join(', ')}].`);
        
        const destName = currentLocations.find(l => l.id === postLocId)?.name || postLocId;
        const nextStepName = currentLocations.find(l => l.id === nextStepLocId)?.name || nextStepLocId;
        
        // Discard the AI's generated messages for the final destination to avoid spatial contradictions.
        // Replace it with a clean narrator transition for the intermediate step.
        scene.messages = [
          {
            speakerId: 'narrator',
            line: `[Especial] Te trasladas hacia ${nextStepName} (parada intermedia en tu viaje hacia ${destName}).`,
            expression: 'neutral'
          }
        ];
        scene.participantIds = []; // clear participants for the transition stop
        scene.narration = `En viaje hacia ${destName}.`;
      } else if (path && path.length === 2) {
        // Direct adjacent travel
        aiTravelMinutes = getPathDistance(path);
        console.log(`[TravelEngine] AI narratively moved player from "${locationId}" to "${postLocId}" (${aiTravelMinutes} min).`);
        
        const destName = currentLocations.find(l => l.id === postLocId)?.name || postLocId;
        scene.messages.push({
          speakerId: 'narrator',
          line: `[Especial] Te trasladas a ${destName} (${aiTravelMinutes} min de viaje).`,
          expression: 'neutral'
        });
      }
    }

    // Ingestion of older dialogue turns is now handled during createScene before generation,
    // which prevents indexing the active sliding window turns and avoids prompt clutter.

    console.log(`[Server] Success scene generation - locationId: "${scene.locationId}", participantIds: [${scene.participantIds.join(', ')}], messages: ${scene.messages.length}`);
    scene.messages.forEach((m, idx) => {
      console.log(`  [Msg ${idx + 1}] (${m.speakerId}): "${m.line}"`);
    });

    const minutes = (scene.minutesPassed || 2) + aiTravelMinutes;
    const { day: nextDay, time: nextTime } = addMinutesToTime(inputState.day, inputState.time, minutes);
    
    const isNewDay = nextDay > (state.day || 1);
    
    inputState.day = nextDay;
    inputState.time = nextTime;
    inputState.timeOfDay = getTimeOfDay(nextTime);

    if (isNewDay) {
      console.log(`[QuestEngine] Day advanced to ${nextDay}. Triggering morning world update in the background...`);
      runMorningWorldUpdate(activeConversationManager, nextDay, history, inputState);
    }

    const bgEndResult = await triggerBackgroundEvents(inputState, events, currentLocations);

    const allBgNotifications = [...(bgStartResult?.notifications || []), ...(bgEndResult?.notifications || [])];
    if (allBgNotifications.length > 0) {
      scene.messages.unshift(...allBgNotifications);
    }

    // Accumulate relationships and trust deltas (add instead of replace)
    const updatedRelationships = { ...inputState.relationships };
    if (scene.relationshipDeltas) {
      Object.entries(scene.relationshipDeltas).forEach(([npcId, delta]) => {
        updatedRelationships[npcId] = (updatedRelationships[npcId] || 0) + delta;
      });
    }

    const updatedTrust = { ...inputState.trust };
    if (scene.trustDeltas) {
      Object.entries(scene.trustDeltas).forEach(([npcId, delta]) => {
        updatedTrust[npcId] = (updatedTrust[npcId] || 0) + delta;
      });
    }

    // Apply inventory deltas
    if (Array.isArray(scene.inventoryDeltas)) {
      scene.inventoryDeltas.forEach(delta => {
        if (delta.action === 'add') {
          inputState.inventory.push({
            id: delta.id,
            name: delta.name,
            description: delta.description || ''
          });
        } else if (delta.action === 'remove') {
          inputState.inventory = inputState.inventory.filter(item => item.id !== delta.id);
        }
      });
    }

    // Apply gold delta
    if (typeof scene.goldDelta === 'number') {
      inputState.gold = (inputState.gold || 0) + scene.goldDelta;
    }

    // Apply quest updates
    const updatedQuests = inputState.quests.map(q => {
      let triggerDirectMeet = q.triggerDirectMeet;
      if (q.status === 'active' && q.urgency === 'alta' && q.triggerDirectMeet === true) {
        triggerDirectMeet = false;
      }
      const update = Array.isArray(scene.questUpdates) ? scene.questUpdates.find(u => u.id === q.id) : null;
      const status = update ? update.status : q.status;
      return { ...q, status, triggerDirectMeet };
    });

    scene.state = {
      relationships: updatedRelationships,
      trust: updatedTrust,
      day: inputState.day,
      time: inputState.time,
      timeOfDay: inputState.timeOfDay,
      flags: inputState.flags,
      completedEvents: inputState.completedEvents,
      travelQueue: inputState.travelQueue,
      inventory: inputState.inventory,
      gold: inputState.gold,
      quests: updatedQuests,
      npcActivityLog: inputState.npcActivityLog || []
    };

    return res.json(scene);
  } catch (error) {
    console.error('[Server] Conversation manager error:', error);
    const fallback = activeConversationManager.makeFallbackScene({ locationId, participantIds: finalParticipantIds, playerText, state: inputState });
    
    const { day: nextDay, time: nextTime } = addMinutesToTime(inputState.day, inputState.time, 2);
    inputState.day = nextDay;
    inputState.time = nextTime;

    fallback.generateQuest = null;

    const fallbackRelationships = { ...inputState.relationships };
    if (fallback.relationshipDeltas) {
      Object.entries(fallback.relationshipDeltas).forEach(([npcId, delta]) => {
        fallbackRelationships[npcId] = (fallbackRelationships[npcId] || 0) + delta;
      });
    }

    const fallbackTrust = { ...inputState.trust };
    if (fallback.trustDeltas) {
      Object.entries(fallback.trustDeltas).forEach(([npcId, delta]) => {
        fallbackTrust[npcId] = (fallbackTrust[npcId] || 0) + delta;
      });
    }

    fallback.state = {
      relationships: fallbackRelationships,
      trust: fallbackTrust,
      day: inputState.day,
      time: inputState.time,
      timeOfDay: getTimeOfDay(inputState.time),
      flags: inputState.flags,
      completedEvents: inputState.completedEvents,
      travelQueue: inputState.travelQueue || [],
      inventory: inputState.inventory || [],
      gold: inputState.gold || 0,
      quests: inputState.quests || [],
      npcActivityLog: inputState.npcActivityLog || []
    };

    console.log(`[Server] Responding with Fallback Scene - messages: ${fallback.messages.length}`);
    fallback.messages.forEach((m, idx) => {
      console.log(`  [Fallback Msg ${idx + 1}] (${m.speakerId}): "${m.line}"`);
    });
    return res.json(fallback);
  }
});

app.get('/api/world/pending-updates', async (_req, res) => {
  try {
    const pending = await loadPendingUpdates();
    const hasQuests = Array.isArray(pending.quests) && pending.quests.length > 0;
    const hasActions = Array.isArray(pending.npcActions) && pending.npcActions.length > 0;
    const hasUpdates = Array.isArray(pending.npcUpdates) && pending.npcUpdates.length > 0;

    if (hasQuests || hasActions || hasUpdates) {
      await savePendingUpdates({ quests: [], npcActions: [], npcUpdates: [] }); // Clear pending
      console.log(`[QuestEngine] Client requested pending updates. Cleared ${pending.quests?.length || 0} quests, ${pending.npcActions?.length || 0} NPC actions, and ${pending.npcUpdates?.length || 0} NPC updates.`);
      res.json(pending);
    } else {
      res.json({ quests: [], npcActions: [], npcUpdates: [] });
    }
  } catch (err) {
    res.json({ quests: [], npcActions: [], npcUpdates: [] });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    ai: Boolean(client),
    provider: useGemini ? 'gemini' : client ? 'openai' : 'none',
    model: modelName
  });
});

function getRelationshipLabel(npcId, points, isRomanceActive) {
  if (points === undefined) {
    return 'DESCONOCIDO (Stranger - You have NEVER met or spoken to this traveler before. Act distant, formal, ask who they are, show caution, and do not act familiar or friendly)';
  }
  if (isRomanceActive) return 'PAREJA / ROMANCE (Romantic Partner - Treat them with deep affection, intimacy, warmth, and care)';
  if (points >= 8) return 'AMIGO ÍNTIMO (Very Close Friend - Extreme trust and warmth)';
  if (points >= 5) return 'CONFIDENTE (Confidant - High trust, willing to share deep secrets)';
  if (points >= 2) return 'AMIGO (Friend - Warm, friendly, cooperative)';
  if (points <= -6) return 'ENEMIGO (Enemy - Active hostility, anger, and opposition)';
  if (points <= -2) return 'HOSTIL (Hostile - Coolness, suspicion, and anger)';
  return 'CONOCIDO (Acquaintance - You know of them, speak with basic politeness)';
}

export class ConversationManager {
  constructor({ client, model: modelName, isGemini }) {
    this.client = client;
    this.model = modelName;
    this.isGemini = isGemini;
  }

  async createScene({ locationId, participantIds, playerText, history, state, activeEvent = null, travelMinutes = 0, unexpectedEventNote = '' }) {
    const location = getLocation(locationId);
    const currentNpcs = await loadNpcs();
    const timeOfDay = state?.timeOfDay || 'mañana';
    const participants = this.resolveParticipants(participantIds, location, currentNpcs, timeOfDay);

    if (!this.client) {
      return this.makeFallbackScene({ locationId: location.id, participantIds: participants.map((npc) => npc.id), playerText, state });
    }

    // 1. Process history: ingest older turns into RAG, keep recent K turns in direct context window
    const fullHistory = Array.isArray(history) ? history : [];
    const K = 15; // Sliding window size in turns
    
    // Group full history into turns, keeping track of locations and participants
    const turns = [];
    let currentTurn = null;
    for (const entry of fullHistory) {
      if (entry.type === 'player') {
        if (currentTurn) turns.push(currentTurn);
        currentTurn = { 
          player: entry.line, 
          npcs: [], 
          npcIds: [], 
          locationId: entry.locationId || location.id 
        };
      } else if (entry.type === 'npc') {
        const speakerName = entry.speaker || currentNpcs.find(n => n.id === entry.speakerId)?.name || 'Narrador';
        const msgStr = `[${speakerName}]: ${entry.line}`;
        const speakerId = entry.speakerId;
        if (currentTurn) {
          currentTurn.npcs.push(msgStr);
          if (speakerId && speakerId !== 'narrator' && !currentTurn.npcIds.includes(speakerId)) {
            currentTurn.npcIds.push(speakerId);
          }
        } else {
          currentTurn = {
            player: '(Inicio)',
            npcs: [msgStr],
            npcIds: speakerId && speakerId !== 'narrator' ? [speakerId] : [],
            locationId: entry.locationId || location.id
          };
          turns.push(currentTurn);
          currentTurn = null;
        }
      }
    }
    if (currentTurn) turns.push(currentTurn);

    // Ingest turns that fell out of the sliding window
    if (vectorManager && turns.length > K) {
      const oldTurns = turns.slice(0, -K);
      for (const turn of oldTurns) {
        const turnText = `[Viajero]: ${turn.player}\n${turn.npcs.join('\n')}`;
        let hash = 0;
        for (let i = 0; i < turnText.length; i++) {
          hash = (hash << 5) - hash + turnText.charCodeAt(i);
          hash |= 0;
        }
        const turnId = `dialogue_turn_${Math.abs(hash)}`;
        
        const exists = await vectorManager.index.getItem(turnId);
        if (!exists) {
          await vectorManager.upsertItem(turnId, turnText, { 
            type: 'dialogue',
            locationId: turn.locationId || location.id,
            participantIds: turn.npcIds || []
          });
        }
      }
    }

    // Keep the last K turns as the exact recent history (Short-term direct context)
    let sliceIndex = 0;
    let playerCount = 0;
    for (let i = fullHistory.length - 1; i >= 0; i--) {
      if (fullHistory[i].type === 'player') {
        playerCount++;
        if (playerCount === K) {
          sliceIndex = i;
          break;
        }
      }
    }
    const recentHistory = fullHistory.slice(sliceIndex).map((entry) => ({
      speakerId: entry.speakerId,
      speaker: entry.speaker,
      line: entry.line,
      type: entry.type
    }));

    // 2. Retrieve semantically relevant context using RAG
    let ragContext = '';
    if (vectorManager) {
      console.log(`[RAG] Querying vector index for context related to: "${playerText}"`);
      const results = await vectorManager.query(playerText, '', 15);
      if (results.length > 0) {
        // Filter RAG results to avoid private conversation leaks
        const activeNpcIds = participants.map(p => p.id);
        const filteredResults = results.filter(res => {
          if (res.metadata?.type !== 'dialogue') {
            return true;
          }
          const dialogueLocation = res.metadata?.locationId;
          const dialogueParticipants = Array.isArray(res.metadata?.participantIds) ? res.metadata.participantIds : [];
          
          const isSameLocation = dialogueLocation === location.id;
          const isParticipantInvolved = dialogueParticipants.some(id => activeNpcIds.includes(id));
          return isSameLocation || isParticipantInvolved;
        }).slice(0, 5);

        if (filteredResults.length > 0) {
          ragContext = '\n\n--- MEMORIAS Y CONTEXTO DEL MUNDO RECUPERADO (RAG) ---\n';
          filteredResults.forEach((res, i) => {
            const typeStr = res.metadata.type === 'dialogue' ? 'Diálogo Pasado' : res.metadata.type === 'npc' ? 'NPC info' : 'Lugar info';
            ragContext += `[${i + 1}] (${typeStr}): ${res.text}\n`;
          });
          console.log(`[RAG] Injected ${filteredResults.length} filtered contextual memories (out of ${results.length} queried).`);
        }
      }
    }

    let parsed = null;
    const npcDetails = participants.map((npc) => this.getNpcDetails(npc));

    if (this.isGemini) {
      const contentText = JSON.stringify({
        task: 'continue_medieval_visual_novel_conversation',
        location,
        npcs: npcDetails,
        villageState: state,
        recentHistory,
        playerMessage: playerText
      });

      console.log(`[AI] Calling Gemini model: "${this.model}"`);
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: [{ role: 'user', parts: [{ text: contentText }] }],
        config: {
          systemInstruction: await this.buildInstructions(location, participants, currentNpcs, ragContext, activeEvent, state, travelMinutes, unexpectedEventNote),
          responseMimeType: 'application/json',
          responseSchema: sceneResponseSchema
        }
      });

      console.log(`[AI] Raw Gemini response:\n${response.text}`);
      parsed = parseModelJson(response.text);
    } else {
      // OpenAI completion calls
      console.log(`[AI] Calling OpenAI model: "${this.model}"`);
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: await this.buildInstructions(location, participants, currentNpcs, ragContext, activeEvent, state, travelMinutes, unexpectedEventNote) },
          ...this.buildMessageArray({ location, participants, playerText, history, state })
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'scene_response',
            strict: true,
            schema: sceneResponseSchema
          }
        }
      });

      console.log(`[AI] Raw OpenAI response:\n${response.choices[0].message.content}`);
      parsed = parseModelJson(response.choices[0].message.content);
    }

    return this.normalizeScene(parsed, location, participants, activeEvent);
  }

  resolveParticipants(participantIds, location, currentNpcs, timeOfDay = 'mañana') {
    const requested = Array.isArray(participantIds) ? participantIds : [];
    const validRequested = requested.map((id) => currentNpcs.find((npc) => npc.id === id)).filter(Boolean);
    if (validRequested.length > 0) return validRequested.slice(0, 4);

    const nearby = currentNpcs.filter((npc) => {
      const currentLoc = getNpcLocation(npc.id, timeOfDay, npc.locationId, npc);
      return currentLoc === location.id;
    });
    return nearby.slice(0, 4);
  }

  async buildInstructions(location, participants, currentNpcs, ragContext = '', activeEvent = null, state = {}, travelMinutes = 0, unexpectedEventNote = '') {
    const currentLocations = await loadLocations();
    const inventory = Array.isArray(state?.inventory) ? state.inventory : [];
    const gold = typeof state?.gold === 'number' ? state.gold : 0;
    const quests = Array.isArray(state?.quests) ? state.quests : [];

    const dayNum = typeof state?.day === 'number' ? state.day : 1;
    const timeStr = typeof state?.time === 'string' ? state.time : '08:00';
    const timeOfDayStr = typeof state?.timeOfDay === 'string' ? state.timeOfDay : 'mañana';
    const weatherStr = getWeatherForDay(dayNum);

    let timeAndWeatherContext = `\n\n=== CONTEXTO TEMPORAL Y CLIMÁTICO (CRÍTICO) ===\n` +
      `- Día de la simulación: ${dayNum}\n` +
      `- Hora actual del día: ${timeStr} (${timeOfDayStr})\n` +
      `- Clima en la aldea: ${weatherStr}\n` +
      `INSTRUCCIÓN: El DM y los personajes deben ser plenamente conscientes de la hora del día (ej: si es de noche, las calles estarán oscuras, frías o vacías, los personajes tendrán sueño o buscarán abrigo, etc.) y del clima actual en sus descripciones narrativas y diálogos.\n`;

    let questAndInventoryContext = '\n\n=== INVENTARIO Y MISIONES DEL JUGADOR (CRÍTICO) ===\n' +
      `Oro actual del jugador: ${gold} monedas de oro.\n` +
      'Objetos en el Inventario:\n';
    
    if (inventory.length === 0) {
      questAndInventoryContext += '- (El inventario está vacío)\n';
    } else {
      inventory.forEach(item => {
        questAndInventoryContext += `- [${item.id}]: "${item.name}" - ${item.description}\n`;
      });
    }
    
    questAndInventoryContext += '\nMisiones Activas en la aldea y su Estado:\n';
    const activeQuests = quests.filter(q => q.status === 'active');
    if (activeQuests.length === 0) {
      questAndInventoryContext += '- (No hay misiones activas en este momento)\n';
    } else {
      activeQuests.forEach(q => {
        questAndInventoryContext += `- Misión ID [${q.id}]: "${q.title}" de [${q.npcId}]. Objetivo: "${q.objective}". Urgencia: "${q.urgency}".\n`;
      });
    }

    // Check for urgent direct-meet quests that should be initiated by the DM
    const urgentDirectQuests = activeQuests.filter(q => q.urgency === 'alta' && q.triggerDirectMeet === true);
    if (urgentDirectQuests.length > 0) {
      questAndInventoryContext += '\n=== ENCUENTROS URGENTES DE MISIÓN (OBLIGATORIO) ===\n' +
        'Los siguientes personajes tienen misiones sumamente urgentes y deben abordar al jugador en esta ubicación inmediatamente para presentárselas:\n';
      urgentDirectQuests.forEach(q => {
        const npcName = currentNpcs.find(n => n.id === q.npcId)?.name || q.npcId;
        questAndInventoryContext += `- NPC: ${npcName} (id: ${q.npcId}). Misión: "${q.title}". Objetivo: "${q.objective}". Descripción: "${q.description}".\n` +
          `INSTRUCCIÓN: Como esta misión es sumamente urgente, el personaje ${npcName} (${q.npcId}) DEBE aparecer en escena en esta ubicación para hablarle al jugador sobre esta tarea de forma apresurada en este turno. Si no está en 'participantIds', DEBES incluirlo en tu respuesta en 'participantIds' para que aparezca en pantalla, y hacer que hable directamente en 'messages'. Menciónalo en la narración y haz que inicie su diálogo sobre este asunto inmediatamente.\n`;
      });
    }
    
    questAndInventoryContext += '\nREGLAS DE INVENTARIO Y MISIONES:\n' +
      '- Si las acciones o las palabras del jugador completan lógicamente los requisitos de una misión activa (por ejemplo, te da el objeto requerido o habla de haber resuelto la tarea), DEBES marcar la misión como completada en tu respuesta JSON en "questUpdates" (ej: { "id": "fb_quest_herrero_1", "status": "completed" }).\n' +
      '- Si decides que un NPC le entrega un objeto físico al jugador o se lo quita, DEBES registrarlo en "inventoryDeltas" (ej: para añadir: { "id": "carta_secreta", "name": "Carta Secreta", "description": "Una carta sellada.", "action": "add" }; para quitar: { "id": "carta_secreta", "action": "remove" }).\n' +
      '- Si el jugador realiza un servicio por oro o compra algo, DEBES reflejar la ganancia o pérdida en "goldDelta" (ej: 15 o -10).\n';
    let eventContext = '';
    if (activeEvent) {
      eventContext = `\n\n=== EVENTO NARRATIVO ACTIVO ===\n` +
        `El siguiente suceso especial ha ocurrido en esta ubicación: "${activeEvent.name}".\n` +
        `Descripción: ${activeEvent.description}\n` +
        `Consecuencia: ${activeEvent.consequence}\n` +
        `NPCs Involucrados: ${activeEvent.involvedNpcs.join(', ')}\n` +
        `DEBES estructurar tu respuesta para reflejar e integrar este evento en los diálogos y la narración de forma coherente. El tono y reacciones de los NPCs involucrados deben reflejar la consecuencia indicada.`;
    }

    let travelNote = '';
    if (travelMinutes > 0) {
      travelNote = `\n\n=== RECIENTE VIAJE DEL JUGADOR ===\n` +
        `El jugador acaba de viajar hasta aquí desde su ubicación anterior. Este trayecto le ha tomado exactamente ${travelMinutes} minutos. El reloj de la aldea ha avanzado de acuerdo a este tiempo de viaje. Narra la llegada de forma natural habiendo transcurrido este trayecto (por ejemplo, comentando la caminata, el cansancio del viaje, o el cambio en la luz del día si corresponde).\n`;
    }

    let journeyNote = '';
    const travelQueue = Array.isArray(state?.travelQueue) ? state.travelQueue : [];
    if (travelQueue.length > 0) {
      const finalDestId = travelQueue[travelQueue.length - 1];
      const finalDestName = currentLocations.find(l => l.id === finalDestId)?.name || finalDestId;
      journeyNote = `\n\n=== PARADA INTERMEDIA DE VIAJE ===\n` +
        `ATENCIÓN: El grupo se encuentra actualmente en tránsito hacia su destino final: "${finalDestName}". Esta es una PARADA INTERMEDIA en la que acabas de detenerte temporalmente ("${location.name}"). La conversación o narración debe enfocarse únicamente en el trayecto, el descanso temporal o los diálogos durante la caminata, sin actuar como si ya hubieran llegado a la meta final. Al final del turno, el viaje continuará hacia el siguiente paso de la ruta.\n`;
    }

    let relationshipContext = '\n\n=== RELACIÓN Y CONFIANZA CON TODOS LOS HABITANTES DE LA ALDEA ===\n' +
      'Usa esta información para determinar cómo trata cada personaje al Viajero. Si es "DESCONOCIDO", deben actuar como si nunca lo hubieran visto antes (preguntar nombre, mantener distancia, mostrar cautela y formalidad). Si es "PAREJA/ROMANCE", deben mostrar afecto romántico íntimo e incondicional:\n';
    const rels = state?.relationships || {};
    const trust = state?.trust || {};
    const flags = state?.flags || [];

    currentNpcs.forEach(npc => {
      const points = rels[npc.id];
      const trustPoints = trust[npc.id] || 0;
      const isRomanceActive = flags.includes(`romance_${npc.id}`);
      const label = getRelationshipLabel(npc.id, points, isRomanceActive);
      relationshipContext += `- ${npc.name} (${npc.id}): Nivel de Relación: ${points !== undefined ? points : 'n/a'} (Etiqueta: ${label}). Nivel de Confianza: ${trustPoints}.\n`;
    });

    // Build notable relationships gossip context
    let notableOthersContext = '\n\n=== NOTICIAS Y RUMORES DE OTRAS RELACIONES ===\n';
    let hasNotableOthers = false;
    for (const [npcId, points] of Object.entries(rels)) {
      if (participants.some(p => p.id === npcId)) continue;
      const targetNpc = currentNpcs.find(n => n.id === npcId);
      if (!targetNpc) continue;
      
      const isRomanceActive = flags.includes(`romance_${npcId}`);
      if (isRomanceActive) {
        notableOthersContext += `- El Viajero tiene una relación sentimental activa de PAREJA/ROMANCE con ${targetNpc.name} (${targetNpc.id}). Toda la aldea lo sabe.\n`;
        hasNotableOthers = true;
      } else if (points >= 6) {
        notableOthersContext += `- El Viajero es muy cercano con ${targetNpc.name} (${targetNpc.id}) (Relación: ${points}, Etiqueta: Amigo Íntimo).\n`;
        hasNotableOthers = true;
      } else if (points <= -5) {
        notableOthersContext += `- El Viajero tiene una fuerte rivalidad u hostilidad con ${targetNpc.name} (${targetNpc.id}) (Relación: ${points}, Etiqueta: Enemigo).\n`;
        hasNotableOthers = true;
      }
    }
    if (!hasNotableOthers) {
      notableOthersContext += 'No hay rumores notables sobre relaciones del Viajero con otros personajes en este momento.\n';
    }

    // Build live connections map context to give the AI perfect spatial graph awareness
    let mapGraphContext = '\n\n=== MAPA DE CONEXIONES Y DISTANCIAS DE LA ALDEA ===\n' +
      'Los personajes y el jugador solo pueden viajar entre ubicaciones que estén conectadas directamente. Aquí tienes el mapa actual de caminos (las ubicaciones adyacentes a las que se puede caminar directamente y el tiempo requerido):\n';
    for (const loc of currentLocations) {
      const conns = loc.connections || [];
      if (conns.length > 0) {
        const connStrings = conns.map(c => {
          const targetLoc = currentLocations.find(l => l.id === c.to);
          const targetName = targetLoc ? targetLoc.name : c.to;
          return `${targetName} (${c.to} - ${c.distance} min)`;
        });
        mapGraphContext += `- ${loc.name} (${loc.id}) conecta directamente con: ${connStrings.join(', ')}.\n`;
      } else {
        mapGraphContext += `- ${loc.name} (${loc.id}) no tiene caminos de salida.\n`;
      }
    }

    return `Eres el Dungeon Master de una novela visual de intriga medieval en la aldea de Robledal.
Tu tarea es narrar la escena actual, describir las acciones del entorno y dar voz a los personajes.
Debes responder ÚNICAMENTE con un objeto JSON válido y estructurado.
Formato exacto de respuesta:
{
  "locationId": "${location.id}",
  "participantIds": ["id_npc"],
  "narration": "Texto descriptivo general que resume las acciones o cambios de entorno para esta respuesta...",
  "messages": [
    { "speakerId": "id_npc_o_narrator", "line": "diálogo medieval o descripción", "expression": "neutral|happy|angry|sad|surprised|smirky" }
  ],
  "relationshipDeltas": [
    { "npcId": "id_npc", "delta": 1 }
  ],
  "trustDeltas": [
    { "npcId": "id_npc", "delta": 2 }
  ],
  "newNpc": {
    "id": "nuevo_id_unico_alfanumerico_o_cadena_vacia_si_no_hay",
    "name": "Nombre o cadena vacía si no hay",
    "role": "Rol o cadena vacía si no hay",
    "personality": "Personalidad o cadena vacía si no hay",
    "secret": "Secreto o cadena vacía si no hay",
    "hint": "Pista o cadena vacía si no hay",
    "color": "#color o cadena vacía si no hay",
    "skin": "#color o cadena vacía si no hay",
    "hair": "#color o cadena vacía si no hay",
    "outfit": "civic o cadena vacía si no hay",
    "suggestions": [],
    "appearancePrompt": "Prompt o cadena vacía si no hay"
  },
  "newLocation": {
    "id": "nuevo_id_unico_ubicacion_o_cadena_vacia_si_no_hay",
    "name": "Nombre o cadena vacía si no hay",
    "prompt": "Prompt o cadena vacía si no hay",
    "ambient": "Ambient o cadena vacía si no hay",
    "connectedTo": "plaza o cadena vacía si no hay",
    "distance": 0
  },
  "minutesPassed": 5,
  "exitTheConversation": ["id_npc"],
  "enterTheConversation": ["id_npc"],
  "updateLocationImage": {
    "locationId": "id_ubicacion_a_actualizar_o_cadena_vacia_si_no_hay",
    "prompt": "Prompt de imagen o cadena vacía si no hay"
  },
  "generateQuest": {
    "npcId": "id_npc_a_quien_se_le_creara_la_mision_o_cadena_vacia_si_no_hay",
    "urgency": "alta|media|baja_o_cadena_vacia_si_no_hay",
    "theme": "Breve descripción del tema, contexto o favor solicitado en el diálogo, o cadena vacía si no hay"
  },
  "inventoryDeltas": [
    { "id": "id_objeto", "name": "Nombre Objeto", "description": "Descripción", "action": "add|remove" }
  ],
  "goldDelta": 0,
  "questUpdates": [
    { "id": "id_mision", "status": "completed|failed" }
  ]
}

REGLAS DE FORMATO ESTRICTAS:
1. Para todos los campos opcionales del esquema (como 'newNpc', 'newLocation', 'updateLocationImage', 'generateQuest'), no los omitas del JSON. DEBES proveer el objeto completo con todas sus propiedades rellenando sus valores con cadenas vacías "" (o 0 para 'distance') si decides no generar dicho objeto en este turno.
2. 'relationshipDeltas' y 'trustDeltas' DEBEN ser arrays de objetos en formato: [ { "npcId": "nombre_npc", "delta": delta_num } ].
3. Si en inventoryDeltas o questUpdates no hay cambios, pon un array vacío []. Todo debe cumplir estrictamente con el esquema JSON.
}

Reglas:
- Si hablas tú directamente para narrar el entorno, usa "narrator" como speakerId en el mensaje y la expresión "neutral".
- REALISMO Y DETALLE VISCERAL (CRÍTICO): Cuando ocurra una escena física, de acción, combate, violencia, intimidad, pasión, romance o contacto físico, el DM DEBE describirla con lujo de detalle físico, de manera explícita, directa y concreta en la sección de 'narration' o mensajes del narrador. Está prohibido usar descripciones vagas, metafóricas o poéticas que evadan la acción (ej: evita frases como "se entregaron a la pasión", "el lienzo quedó olvidado" o "el calor fue intenso y compartido"). En su lugar, describe las acciones físicas reales de forma vívida y concreta (roces, respiraciones, movimientos, expresiones, sensaciones físicas, golpes, sudor, etc.). Las descripciones deben ser realistas, crudas, directas y detalladas, sin rodeos metafóricos, dejando claro exactamente qué está sucediendo físicamente paso a paso. Queda prohibido dejar cosas a la imaginación en estas escenas.
- ENTRADAS Y SALIDAS DE PERSONAJES: Si en este turno un NPC se retira físicamente de la escena o se despide para irse a otro lugar, DEBES incluir su ID en el array "exitTheConversation" (ej: ["posadera"]). Si un NPC conocido de la aldea aparece físicamente en la escena y se une a la conversación, DEBES incluir su ID en el array "enterTheConversation" (ej: ["herrero"]).
- ACTUALIZACIÓN DE IMAGEN DE UBICACIÓN: Si una acción o evento cambia significativamente el estado visual de una ubicación existente (por ejemplo, si el jugador limpia, restaura o redecora la panadería vieja, repara el yunque de la forja, o coloca un nuevo cartel), DEBES incluir el objeto "updateLocationImage" con el "locationId" correspondiente y un nuevo "prompt" en inglés detallando el nuevo aspecto visual (ej: una panadería limpia y restaurada con pan fresco y sol entrando por la ventana). Esto regenerará la imagen de fondo de forma permanente.
- GENERACIÓN DE MISIONES (QUESTS) AL VUELO: Si en el diálogo un NPC le encomienda una tarea, encargo o favor al jugador (por ejemplo, si Inés le pide buscar suministros o vigilar la taberna), DEBES rellenar el objeto "generateQuest" indicando el "npcId" del personaje que ofrece la misión, la "urgency" ("alta", "media" o "baja"), y el "theme" (una breve explicación en tus palabras del favor medieval solicitado). El motor procesará esta petición y registrará la misión en el diario del jugador de forma automática.
- Revisa el historial de la conversación ('recentHistory') en el mensaje recibido para comprender el contexto previo. Continúa el flujo de la historia y del diálogo de forma coherente basándote en el último mensaje del jugador en 'playerMessage'. NO repitas saludos, NO reinicies la escena en cada turno, y NO repitas preguntas o demandas de compromiso si el jugador ya las ha respondido o ha tomado acciones correspondientes (por ejemplo, si el jugador ya cocinó un buen pan al principio, los personas NO deben ignorarlo ni exigirle que "cocine para demostrar su valía" una y otra vez). Haz avanzar la trama.
- EVOLUCIÓN DE RELACIONES Y ROMANCE: Si la relación con un NPC es muy alta (>= 8) y el jugador intenta flirtear o declarar su amor de forma genuina, el NPC puede corresponderle. Si se establece un romance mutuo, DEBES añadir la bandera "romance_[npcId]" (ej: "romance_posadera") en la lista de flags del estado. Si la bandera "romance_[npcId]" está presente, el personaje hablará y actuará con cariño romántico íntimo e incondicional hacia el Viajero.
- RUMORES Y COTILLEOS: Los NPCs chismorrean sobre el Viajero. Si el jugador flirtea, se pelea, o realiza una acción notable en presencia de otros NPCs, añade una bandera de rumor en los flags de estado con el prefijo 'rumor_' (ej: 'rumor_flirteo_posadera', 'rumor_pelea_herrero'). Si un flag con 'rumor_' está activo o si ves relaciones notables de otros personajes en el bloque "NOTICIAS Y RUMORES DE OTRAS RELACIONES" (ej: que el jugador sea pareja de otro NPC o enemigo de otro NPC), los personajes presentes reaccionarán de forma coherente chismorreando, mostrando celos, despecho, advertencias, curiosidad o burla según corresponda a sus personalidades y sus propias relaciones con el Viajero.
- Cada mensaje en 'messages' debe tener como 'speakerId' exactamente uno de los IDs autorizados de NPCs presentes en escena o 'narrator'. NUNCA uses nombres propios (como 'Elvira' o 'Borin') ni descripciones en 'speakerId'. Usa SOLO los IDs de la lista de NPCs conocidos.
- CONTROL DE ESCENA: El campo 'participantIds' de tu respuesta define quién está presente en pantalla. Puedes y debes modificarlo libremente: añade el ID de un NPC conocido si aparece en la escena, quítalo si se va o sale. Solo pueden hablar los NPCs que estén en 'participantIds'. Esta es tu principal herramienta narrativa para gestionar las entradas y salidas de personajes.
- CAMBIO DE UBICACIÓN NARRATIVO: Si decides cambiar de ubicación narrativamente, SOLO puedes establecer 'locationId' a una ubicación que esté DIRECTAMENTE CONECTADA (adyacente) a la ubicación actual en el mapa. Está TERMINANTEMENTE PROHIBIDO saltar a ubicaciones no adyacentes de un solo golpe. Si deseas ir a un destino lejano, debes cambiar al primer nodo adyacente este turno, narrar/dialogar la caminata o llegada a ese nodo intermedio, y dejar que el viaje continúe en los siguientes turnos. Además, 'participantIds' DEBE reflejar ÚNICAMENTE los NPCs que físicamente viajaron o están en la nueva ubicación. Si el jugador va a solas a un lugar o solo le acompaña un personaje concreto, elimina el resto de 'participantIds'. Nunca dejes en la lista a NPCs que quedaron atrás.
- Mantén la narración y los diálogos realistas, directos e inmersivos. Escribe entre 3 y 6 mensajes en total.
- PRIVACIDAD DE SECRETOS Y LÍMITES DE CONOCIMIENTO (CRÍTICO): Cada NPC oculta celosamente su secreto del resto de los aldeanos. Está estrictamente prohibido que un NPC mencione, sugiera o actúe basándose en el secreto de otro NPC (por ejemplo, Beatriz no debe saber ni insinuar el secreto de Borin, ni viceversa), a menos que el historial de la conversación muestre explícitamente que dicho secreto ya fue descubierto y revelado entre ellos. Mantén una estricta separación de conocimientos entre los personajes en escena (Teoría de la Mente).
- REALISMO Y DIÁLOGOS NATURALES (CRÍTICO): Queda terminantemente prohibido que los personajes o el narrador hablen en un tono pretencioso, abstracto, poético, místico o cargado de analogías constantes de su profesión (por ejemplo, la costurera Beatriz NO debe usar metáforas de hilos, costuras, hebras, puntadas o remiendos al hablar de secretos, romance o situaciones del día a día; el herrero Borin no debe hablar todo el tiempo de yunques, fuego o forja). Los diálogos deben ser creíbles, terrenales, naturales y directos, sonando como personas medievales reales en lugar de poemas abstractos. Evita frases crípticas artificiales que resten realismo y rompan la inmersión.
- EXPLORACIÓN SIN NPCs: Si el jugador está en un lugar sin personajes (ej: molino abandonado, ruinas), el narrador puede describir el entorno en 2-3 mensajes, pero el ÚLTIMO mensaje SIEMPRE debe ser una pregunta directa o una propuesta de acción concreta al jugador (ej: '¿Qué decides hacer?', 'Hay un baúl cerrado en la esquina, ¿lo abres?', 'Escuchas un ruido al fondo, ¿te acercas?'). Nunca termines un turno con pura descripción sin dar al jugador una decisión clara.
- Debes incluir el campo "minutesPassed" con un valor numérico entero estimado de cuántos minutos requiere la acción que realiza el jugador o la escena (por ejemplo, 2 para diálogo corto, 15-30 para viajar de un lugar a otro, o 30-60 para investigar a fondo o realizar una actividad larga).
- NPCs actualmente presentes en escena: ${participants.map((npc) => npc.id).join(', ') || '(ninguno - exploración solitaria)'}.
- CREACIÓN OBLIGATORIA DE NPCs NUEVOS (CRÍTICO): Si en tu narración aparece CUALQUIER personaje nuevo que no esté en la lista de NPCs conocidos (ya sea porque el jugador lo busca, porque la trama lo introduce, porque alguien llega, ataca, es descubierto, interceptado, rescatado o aparece de cualquier forma en la escena), DEBES registrarlo en 'newNpc' con un ID único, nombre, rol, personalidad, secreto, pista, colores visuales y sugerencias de diálogo. Esto incluye intrusos, viajeros, atacantes, prisioneros, mensajeros, espías o cualquier figura narrativa nueva que tenga presencia física en la escena, aunque esté inconsciente, herida o muerta. Solo deja 'newNpc' vacío si no introduces ningún personaje nuevo en absoluto.
- Lista completa de NPCs conocidos del mundo: ${currentNpcs.map((npc) => `${npc.name} (${npc.id})`).join(', ')}.
- Lista completa de ubicaciones conocidas de la aldea: ${currentLocations.map((loc) => `${loc.name} (${loc.id})`).join(', ')}.
- Si el jugador decide viajar, moverse o la historia avanza a una ubicación lógica que no existe en el mapa actual, crea una nueva ubicación en el campo 'newLocation' y cambia el 'locationId' de la respuesta al ID de esa nueva ubicación.
- CONEXIONES DE NUEVA UBICACIÓN: Cuando crees una nueva ubicación en 'newLocation', DEBES especificar 'connectedTo' con el ID de una ubicación ya conocida en la aldea desde la cual se accede (ej: 'plaza', 'bosque', 'taberna') y 'distance' con un número entero indicando los minutos de viaje necesarios para caminar entre ambas. Esto conectará bidireccionalmente el nuevo nodo al mapa para evitar que quede aislado.
- Las nuevas ubicaciones siempre deben ser destinos lógicos y NO encajar o confundirse con la ubicación actual en la que te encuentras.
- Si no hay ubicación nueva que crear, pon 'newLocation' como null.
- Ubicación actual: ${location.name}. Ambiente: ${location.prompt}.${ragContext}${eventContext}${relationshipContext}${notableOthersContext}${mapGraphContext}${travelNote}${journeyNote}${timeAndWeatherContext}${questAndInventoryContext}`;
  }

  buildMessageArray({ location, participants, playerText, history, state }) {
    const npcDetails = participants.map((npc) => this.getNpcDetails(npc));
    const recentHistory = Array.isArray(history)
      ? history.slice(-60).map((entry) => ({
          speakerId: entry.speakerId,
          speaker: entry.speaker,
          line: entry.line,
          type: entry.type
        }))
      : [];

    return [
      {
        role: 'user',
        content: JSON.stringify({
          task: 'continue_medieval_visual_novel_conversation',
          location,
          npcs: npcDetails,
          villageState: state,
          recentHistory,
          playerMessage: playerText
        })
      }
    ];
  }

  getNpcDetails(npc) {
    return {
      id: npc.id,
      name: npc.name,
      role: npc.role,
      personality: npc.personality,
      background: npc.background || '',
      fears: npc.fears || '',
      desires: npc.desires || '',
      quirks: npc.quirks || '',
      speech_style: npc.speech_style || '',
      relationships: npc.relationships || '',
      secret: npc.secret,
      hint: npc.hint,
      knownSuggestions: npc.suggestions
    };
  }

  normalizeScene(scene, location, participants, activeEvent = null) {
    // Prefer the participant list the AI decided on — it controls scene entries/exits.
    // An explicit [] from the AI means "no one present" and must be respected.
    // Only fall back to the server-resolved list when the AI omitted the field entirely.
    const resolvedIds = participants.map((npc) => npc.id);
    const aiSentField = Array.isArray(scene.participantIds);
    const aiIds = aiSentField ? scene.participantIds : null;
    let participantIds;
    if (aiSentField) {
      // AI explicitly provided the list (may be empty) — filter to known NPCs and trust it
      participantIds = aiIds
        .filter((id) => resolvedIds.includes(id) || cachedNpcs.some((n) => n.id === id))
        .slice(0, 4);
    } else {
      // AI omitted the field — use server-resolved defaults
      participantIds = resolvedIds;
    }

    const exits = Array.isArray(scene.exitTheConversation) ? scene.exitTheConversation : [];
    const entrances = Array.isArray(scene.enterTheConversation) ? scene.enterTheConversation : [];

    // Filter messages by any valid cached NPC or narrator
    const expressionSet = new Set(EXPRESSIONS);
    const messages = Array.isArray(scene.messages)
      ? scene.messages
          .map((message) => ({
            speakerId: String(message.speakerId || ''),
            line: String(message.line || '').trim().slice(0, 1200),
            expression: expressionSet.has(message.expression) ? message.expression : 'neutral'
          }))
          .filter((message) => (cachedNpcs.some((n) => n.id === message.speakerId) || message.speakerId === 'narrator') && message.line)
      : [];

    // Prepend entrance narrator messages
    if (entrances.length > 0) {
      entrances.forEach(id => {
        const npcName = cachedNpcs.find(n => n.id === id)?.name || id;
        messages.unshift({
          speakerId: 'narrator',
          line: `[Especial] ${npcName} se une a la conversación.`,
          expression: 'neutral'
        });
      });
    }

    // Append exit narrator messages
    if (exits.length > 0) {
      exits.forEach(id => {
        const npcName = cachedNpcs.find(n => n.id === id)?.name || id;
        messages.push({
          speakerId: 'narrator',
          line: `[Especial] ${npcName} se retira de la escena.`,
          expression: 'neutral'
        });
      });
    }

    if (activeEvent) {
      messages.unshift({
        speakerId: 'narrator',
        line: `[Especial - ${activeEvent.name}] ${activeEvent.description}`,
        expression: 'neutral'
      });
    }

    const slicedMessages = messages.slice(0, 8);

    if (!slicedMessages.length) {
      return this.makeFallbackScene({ locationId: location.id, participantIds, playerText: '' });
    }

    // Compute the final participantIds list to send to the client (who remains on screen)
    let finalParticipantIds = [...participantIds];
    if (exits.length > 0) {
      finalParticipantIds = finalParticipantIds.filter(id => !exits.includes(id));
    }
    if (entrances.length > 0) {
      entrances.forEach(id => {
        if (!finalParticipantIds.includes(id) && cachedNpcs.some(n => n.id === id)) {
          finalParticipantIds.push(id);
        }
      });
      finalParticipantIds = finalParticipantIds.slice(0, 4);
    }

    const finalParticipantSet = new Set(finalParticipantIds);

    const inventoryDeltas = Array.isArray(scene.inventoryDeltas) 
      ? scene.inventoryDeltas.filter(d => d.id && d.id !== '') 
      : [];
    const goldDelta = typeof scene.goldDelta === 'number' ? scene.goldDelta : 0;
    const questUpdates = Array.isArray(scene.questUpdates) 
      ? scene.questUpdates.filter(q => q.id && q.id !== '') 
      : [];

    // Convert array of delta objects back into dynamic key maps for compatibility
    const relationshipDeltasMap = {};
    if (Array.isArray(scene.relationshipDeltas)) {
      scene.relationshipDeltas.forEach(d => {
        if (d.npcId && d.npcId !== '') relationshipDeltasMap[d.npcId] = d.delta;
      });
    }
    const trustDeltasMap = {};
    if (Array.isArray(scene.trustDeltas)) {
      scene.trustDeltas.forEach(d => {
        if (d.npcId && d.npcId !== '') trustDeltasMap[d.npcId] = d.delta;
      });
    }

    // Convert empty-string ids to null to maintain backwards compatibility
    const newNpc = (scene.newNpc && scene.newNpc.id && scene.newNpc.id !== '') ? scene.newNpc : null;
    const newLocation = (scene.newLocation && scene.newLocation.id && scene.newLocation.id !== '') ? scene.newLocation : null;
    const generateQuest = (scene.generateQuest && scene.generateQuest.npcId && scene.generateQuest.npcId !== '') ? scene.generateQuest : null;
    
    // Clean suggestions array if empty
    if (newNpc && Array.isArray(newNpc.suggestions)) {
      newNpc.suggestions = newNpc.suggestions.filter(s => s && s !== '');
    }

    return {
      locationId: String(scene.locationId || location.id),
      participantIds: finalParticipantIds,
      narration: String(scene.narration || ''),
      messages: slicedMessages,
      relationshipDeltas: normalizeDeltaMap(relationshipDeltasMap, finalParticipantSet),
      trustDeltas: normalizeDeltaMap(trustDeltasMap, finalParticipantSet),
      newNpc,
      newLocation,
      minutesPassed: typeof scene.minutesPassed === 'number' ? Math.max(1, scene.minutesPassed) : 2,
      inventoryDeltas,
      goldDelta,
      questUpdates,
      generateQuest
    };
  }

  makeFallbackScene({ locationId = 'plaza', participantIds, playerText = '', state = {} }) {
    const location = getLocation(locationId);
    const participants = this.resolveParticipants(participantIds, location, cachedNpcs);
    const ids = participants.map((npc) => npc.id);
    const hasSecretTone = /secreto|recaudador|llave|cartas|molino|consejo|ruinas/i.test(playerText);
    const isHelpful = /ayuda|ayudar|proteger|favor|confia|honor/i.test(playerText);
    const knownTrust = Object.values(state?.trust || {}).reduce((total, value) => total + Number(value || 0), 0);

    const templates = [
      {
        speakerId: 'narrator',
        expression: 'neutral',
        line: 'Las voces de la aldea se mezclan con el susurro del viento medieval.'
      },
      {
        speakerId: ids[0],
        expression: hasSecretTone ? 'smirky' : isHelpful ? 'happy' : 'neutral',
        line: hasSecretTone
          ? 'Nombras heridas que Robledal aprendio a cubrir con barro y silencio.'
          : 'Habla claro, viajero; esta plaza escucha mejor de lo que aparenta.'
      },
      {
        speakerId: ids[1] || ids[0],
        expression: hasSecretTone ? 'angry' : 'smirky',
        line: hasSecretTone
          ? 'Si vienes a remover el molino viejo, mide primero cuantos pasos hay hasta la puerta.'
          : 'Prometer es facil. Lo dificil empieza cuando cae la noche y nadie quiere mirar afuera.'
      }
    ];

    return {
      locationId: location.id,
      participantIds: ids,
      narration: 'El aire se siente expectante.',
      messages: templates.filter((message) => message.speakerId === 'narrator' || ids.includes(message.speakerId)),
      relationshipDeltas: isHelpful ? { [ids[0]]: 1 } : {},
      trustDeltas: hasSecretTone && ids[2] ? { [ids[2]]: 1 } : {},
      newNpc: null
    };
  }
}

function parseModelJson(text = '') {
  const trimmed = text.trim();
  
  // Find the first '{'
  const firstBraceIdx = trimmed.indexOf('{');
  if (firstBraceIdx === -1) {
    return JSON.parse(trimmed);
  }
  
  // Balance braces to find the matching closing brace
  let openBraces = 0;
  let inString = false;
  let escapeNext = false;
  let lastBraceIdx = -1;
  
  for (let i = firstBraceIdx; i < trimmed.length; i++) {
    const char = trimmed[i];
    
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '{') {
        openBraces++;
      } else if (char === '}') {
        openBraces--;
        if (openBraces === 0) {
          lastBraceIdx = i;
          break;
        }
      }
    }
  }
  
  if (lastBraceIdx !== -1) {
    const jsonCandidate = trimmed.substring(firstBraceIdx, lastBraceIdx + 1);
    try {
      return JSON.parse(jsonCandidate);
    } catch (err) {
      console.warn('[QuestEngine] Balanced brace JSON parsing failed. Retrying with regex matched substring...', err.message);
    }
  }
  
  // Fallback to regex matching
  const jsonLike = trimmed.match(/\{[\s\S]*\}/)?.[0] ?? trimmed;
  return JSON.parse(jsonLike);
}

function normalizeDeltaMap(map, participantSet) {
  if (!map || typeof map !== 'object') return {};
  return Object.fromEntries(
    Object.entries(map)
      .filter(([npcId]) => participantSet.has(npcId))
      .map(([npcId, value]) => [npcId, clampNumber(value, -2, 2)])
  );
}

function clampNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(min, Math.min(max, numeric));
}

function getLocation(id) {
  return cachedLocations.find((location) => location.id === id) ?? cachedLocations[0] ?? LOCATIONS[0];
}

// Initialize database caches on startup
const initialNpcs = await loadNpcs();
const initialLocations = await loadLocations();
const initialEvents = await loadEvents();
if (vectorManager) {
  await vectorManager.init();
  await syncAllToVectorDb();
}

const conversationManager = new ConversationManager({ client, model: modelName, isGemini: useGemini });

async function syncAssetsForCurrentData() {
  const currentNpcs = await loadNpcs();
  const currentLocations = await loadLocations();
  const plan = buildAssetSyncPlan(initialNpcs, currentNpcs, initialLocations, currentLocations);

  for (const npcId of plan.addedNpcIds) {
    const npc = currentNpcs.find((item) => item.id === npcId);
    if (!npc) continue;
    console.log(`[Assets] New NPC detected, generating portrait assets: ${npcId}`);
    await generateNpcPortraits(npc.id, npc.color, npc);
  }

  for (const locationId of plan.addedLocationIds) {
    const location = currentLocations.find((item) => item.id === locationId);
    if (!location) continue;
    console.log(`[Assets] New location detected, generating background asset: ${locationId}`);
    await generateLocationBackground(location.id, location.prompt);
  }
}

await syncAssetsForCurrentData();

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(rootDir, 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`[Server] Aldea disponible en http://localhost:${port}`);
});

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
