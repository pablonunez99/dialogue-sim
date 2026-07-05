// Rutas de mundo/infraestructura: portraits, config, reset de base de datos, salud del servidor
import path from 'node:path';
import { rm } from 'node:fs/promises';
import { rootDir } from '../config/paths.js';
import {
  loadNpcs, loadLocations, loadEvents,
  loadPendingUpdates, savePendingUpdates,
  npcsFilePath, locationsFilePath, eventsFilePath, pendingUpdatesFilePath, historyFilePath
} from '../data/repository.js';
import { fileExists, generateNpcPortraits } from '../images/portraitGenerator.js';
import { geminiClient, geminiModel, openaiClient, openaiModel, client, useGemini, modelName, vectorManager } from '../config/aiProviders.js';
import { EXPRESSIONS } from '../../src/data/world.js';

export function registerWorldRoutes(app) {
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

app.post('/api/world/reset', async (_req, res) => {
  console.log('[Server] POST /api/world/reset - Wiping all game databases, history, and vector index...');
  try {
    // 1. Delete database files
    const filesToDelete = [
      npcsFilePath,
      locationsFilePath,
      eventsFilePath,
      pendingUpdatesFilePath,
      historyFilePath,
      vectorManager?.persistPath
    ].filter(Boolean);

    for (const file of filesToDelete) {
      try {
        await rm(file, { force: true });
        console.log(`[Reset] Deleted: ${path.basename(file)}`);
      } catch (err) {
        console.log(`[Reset] Skip deleting ${path.basename(file)}: ${err.message}`);
      }
    }

    // 2. Clear vector index folder
    if (vectorManager?.indexPath) {
      try {
        await rm(vectorManager.indexPath, { recursive: true, force: true });
        console.log('[Reset] Deleted vector index folder');
      } catch (err) {
        console.log(`[Reset] Skip deleting vector index folder: ${err.message}`);
      }
    }

    // 3. Re-initialize databases from static templates
    await loadNpcs();
    await loadLocations();
    await loadEvents();
    if (vectorManager) {
      await vectorManager.init();
    }

    res.json({ success: true, message: 'All database files, history, and vector indexes have been successfully reset.' });
  } catch (err) {
    console.error('[Reset] Failed to execute full database reset:', err.message);
    res.status(500).json({ success: false, error: err.message });
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

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(rootDir, 'dist', 'index.html'));
  });
}
