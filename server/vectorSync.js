// Sincronizacion de NPCs y ubicaciones con el indice vectorial + generacion de assets faltantes
import { vectorManager } from './config/aiProviders.js';
import { loadNpcs, loadLocations } from './data/repository.js';
import { generateNpcPortraits, generateLocationBackground } from './images/portraitGenerator.js';
import { buildAssetSyncPlan } from './asset-sync.js';

export async function syncNpcToVectorDb(npc) {
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

export async function syncLocationToVectorDb(loc) {
  if (!vectorManager) return;
  const text = `Ubicación: ${loc.name} (id: ${loc.id}).
Ambiente visual: ${loc.prompt}.
Sonidos y atmósfera: ${loc.ambient}.`;
  await vectorManager.upsertItem(`location_${loc.id}`, text, { type: 'location', id: loc.id });
}

export async function syncAllToVectorDb() {
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

export async function syncAssetsForCurrentData(initialNpcs, initialLocations) {
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
