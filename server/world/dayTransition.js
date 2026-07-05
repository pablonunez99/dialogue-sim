// Orquestacion de la transicion de dia: delega en el trigger bus y persiste el resultado
import { runDayTransition } from '../triggers/dayPhaseTriggers.js';
import { loadNpcs, saveNpcs, loadLocations, saveLocations, loadEvents, saveEvents, savePendingUpdates } from '../data/repository.js';
import { vectorManager } from '../config/aiProviders.js';

export async function runMorningWorldUpdate(manager, day, history, state) {
  try {
    const npcsList = await loadNpcs();
    const locationsList = await loadLocations();
    const currentEvents = await loadEvents();

    const pending = { quests: [], npcActions: [], npcUpdates: [] };
    const db = {
      loadNpcs,
      saveNpcs,
      loadLocations,
      saveLocations,
      loadEvents,
      saveEvents,
      savePendingUpdates
    };

    const context = {
      manager,
      day,
      history,
      state,
      npcsList,
      locationsList,
      currentEvents,
      db,
      pending,
      vectorManager
    };

    // Run the Pub/Sub day transition triggers!
    await runDayTransition(day, context);

    // Save all accumulated pending updates to the JSON database
    await savePendingUpdates(pending);
  } catch (err) {
    console.error('[QuestEngine] Refactored day transition failed, using fallbacks:', err.message);
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
