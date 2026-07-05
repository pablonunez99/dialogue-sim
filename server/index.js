import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { rootDir } from './config/paths.js';
import { vectorManager } from './config/aiProviders.js';
import { loadNpcs, loadLocations, loadEvents } from './data/repository.js';
import { syncAllToVectorDb, syncAssetsForCurrentData } from './vectorSync.js';
import { registerTurnHandlers } from './triggers/turnTriggers.js';
import { registerDayPhaseHandlers } from './triggers/dayPhaseTriggers.js';
import { registerWorldRoutes } from './routes/worldRoutes.js';
import { registerConversationRoutes } from './routes/conversation/conversationRoutes.js';

const app = express();
const port = Number(process.env.PORT || 5174);

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(rootDir, 'dist')));

// Rutas de la aplicacion. registerWorldRoutes incluye la ruta catch-all '*', por eso va al final.
registerConversationRoutes(app);
registerWorldRoutes(app);

// Registro de handlers del sistema de triggers (turno y fases del dia)
registerTurnHandlers();
registerDayPhaseHandlers();

// Inicializacion de caches de base de datos y del indice vectorial
const initialNpcs = await loadNpcs();
const initialLocations = await loadLocations();
await loadEvents();
if (vectorManager) {
  await vectorManager.init();
  await syncAllToVectorDb();
}

// Genera assets faltantes (portraits/fondos) para cualquier NPC o ubicacion nueva desde el ultimo arranque
await syncAssetsForCurrentData(initialNpcs, initialLocations);

app.listen(port, () => {
  console.log(`[Server] Aldea disponible en http://localhost:${port}`);
});
