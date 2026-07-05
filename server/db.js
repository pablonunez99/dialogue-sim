// Facade de conveniencia: agrupa las funciones del repositorio bajo un solo objeto `db`,
// usado por los triggers/handlers que reciben `db` como parte de su contexto.
import {
  loadNpcs,
  saveNpcs,
  loadLocations,
  saveLocations,
  loadEvents,
  saveEvents,
  savePendingUpdates,
  loadHistory,
  saveHistory
} from './data/repository.js';

export const db = {
  loadNpcs,
  saveNpcs,
  loadLocations,
  saveLocations,
  loadEvents,
  saveEvents,
  savePendingUpdates,
  loadHistory,
  saveHistory
};
