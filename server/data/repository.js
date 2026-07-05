// Capa de acceso a datos: npcs, locations, events, history y pending updates
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { rootDir } from '../config/paths.js';
import { buildAssetSyncPlan } from '../asset-sync.js';
import { generateNpcPortraits, generateLocationBackground } from '../images/portraitGenerator.js';
import { LOCATIONS, NPCS, CONNECTIONS as STATIC_CONNECTIONS } from '../../src/data/world.js';

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

const npcsFilePath = path.join(rootDir, 'server', 'data', 'npcs.json');
const historyFilePath = path.join(rootDir, 'server', 'data', 'history.json');
const locationsFilePath = path.join(rootDir, 'server', 'data', 'locations.json');
const eventsFilePath = path.join(rootDir, 'server', 'data', 'events.json');
const pendingUpdatesFilePath = path.join(rootDir, 'server', 'data', 'pending_updates.json');

export async function loadHistory() {
  try {
    const data = await readFile(historyFilePath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

export async function saveHistory(history) {
  try {
    await mkdir(path.dirname(historyFilePath), { recursive: true });
    await writeFile(historyFilePath, JSON.stringify(history || [], null, 2), 'utf8');
  } catch (error) {
    console.error('[Database] Failed to write history.json', error);
  }
}

export let cachedNpcs = [];
export async function loadNpcs() {
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

export async function saveNpcs(npcs) {
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

export let cachedLocations = [];
export async function loadLocations() {
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

export async function saveLocations(locations) {
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

let cachedEvents = [];

export async function loadEvents() {
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

export async function saveEvents(events) {
  try {
    await mkdir(path.dirname(eventsFilePath), { recursive: true });
    await writeFile(eventsFilePath, JSON.stringify(events, null, 2), 'utf8');
    cachedEvents = events;
  } catch (error) {
    console.error('[Database] Failed to write events.json', error);
  }
}

export async function loadPendingUpdates() {
  try {
    const data = await readFile(pendingUpdatesFilePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return { quests: [], npcActions: [], npcUpdates: [] };
  }
}

export async function savePendingUpdates(updates) {
  try {
    await mkdir(path.dirname(pendingUpdatesFilePath), { recursive: true });
    await writeFile(pendingUpdatesFilePath, JSON.stringify(updates, null, 2), 'utf8');
  } catch (error) {
    console.error('[Database] Failed to write pending_updates.json', error);
  }
}

export function getLocation(id) {
  return cachedLocations.find((location) => location.id === id) ?? cachedLocations[0] ?? LOCATIONS[0];
}

export { npcsFilePath, historyFilePath, locationsFilePath, eventsFilePath, pendingUpdatesFilePath };
