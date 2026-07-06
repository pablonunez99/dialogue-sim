import { findPath, CONNECTIONS, saveHistory } from "../../../data/repository.js";
import { addMinutesToTime, getTimeOfDay } from "../../../world/time.js";
import { triggerBackgroundEvents } from "../../../world/eventEngine.js";
import { getPathDistance } from "../../../../src/data/world.js";
import * as worldUpdater from "../world/worldUpdater.js";

/**
 * Procesa la escena generada (o el fallback) actualizando el estado del mundo,
 * resolviendo viajes narrativos de la IA, aplicando deltas, actualizando el historial y guardándolo.
 */
export async function process(context, activeConversationManager, oldTOD) {
    const scene = context.scene;
    const inputState = context.state;
    const history = context.history;
    const currentLocations = context.locations;
    const currentNpcs = context.npcs;
    const locationId = context.locationId;
    const events = context.events;

    // 1. Resolve narrative travel if the AI shifted the location ID
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

    // 2. Advance time based on generated minutes and AI travel minutes
    const minutes = (scene.minutesPassed || 2) + aiTravelMinutes;
    const { day: nextDay, time: nextTime } = addMinutesToTime(inputState.day, inputState.time, minutes);
    
    inputState.day = nextDay;
    inputState.time = nextTime;
    inputState.timeOfDay = getTimeOfDay(nextTime);

    // 3. Trigger World Updates (Day phase transitions)
    worldUpdater.update(context, activeConversationManager, oldTOD);

    // 4. Trigger background events at the end of the turn
    const bgEndResult = await triggerBackgroundEvents(inputState, events, currentLocations);

    // Combine pre-generation (bgStartResult) and post-generation background notifications
    const allBgNotifications = [
      ...(context.bgStartResult?.notifications || []),
      ...(bgEndResult?.notifications || [])
    ];
    if (allBgNotifications.length > 0) {
      scene.messages.unshift(...allBgNotifications);
    }

    // 5. Accumulate relationship and trust deltas (add instead of replace)
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

    // 6. Apply inventory deltas
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

    // 7. Apply gold delta
    if (typeof scene.goldDelta === 'number') {
      inputState.gold = (inputState.gold || 0) + scene.goldDelta;
    }

    // 8. Apply quest updates
    const updatedQuests = inputState.quests.map(q => {
      let triggerDirectMeet = q.triggerDirectMeet;
      if (q.status === 'active' && q.urgency === 'alta' && q.triggerDirectMeet === true) {
        triggerDirectMeet = false;
      }
      const update = Array.isArray(scene.questUpdates) ? scene.questUpdates.find(u => u.id === q.id) : null;
      const status = update ? update.status : q.status;
      return { ...q, status, triggerDirectMeet };
    });

    // 9. Attach the updated state back to the scene
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

    // 10. Append turn messages/narration to the history log
    if (scene.narration) {
      context.appendHistory({
        speakerId: 'narrator',
        speaker: 'Narrador',
        line: scene.narration,
        type: 'npc',
        locationId: inputState.locationId,
        participantIds: scene.participantIds,
        day: inputState.day,
        time: inputState.time
      });
    }
    if (Array.isArray(scene.messages)) {
      scene.messages.forEach(m => {
        context.appendHistory({
          speakerId: m.speakerId,
          speaker: currentNpcs.find(n => n.id === m.speakerId)?.name || m.speakerId,
          line: m.line,
          type: 'npc',
          locationId: inputState.locationId,
          participantIds: scene.participantIds,
          day: inputState.day,
          time: inputState.time
        });
      });
    }

    // 11. Save the history to the repository
    await saveHistory(history);
    scene.history = history;
}

/**
 * Procesa la escena de parada transitoria en el viaje (logs en historial y guardado).
 */
export async function processTransition(context) {
    const scene = context.scene;
    const inputState = context.state;
    const history = context.history;

    if (scene.narration) {
      context.appendHistory({
        speakerId: 'narrator',
        speaker: 'Narrador',
        line: scene.narration,
        type: 'npc',
        locationId: inputState.locationId,
        participantIds: scene.participantIds,
        day: inputState.day,
        time: inputState.time
      });
    }
    if (Array.isArray(scene.messages)) {
      scene.messages.forEach(m => {
        context.appendHistory({
          speakerId: m.speakerId,
          speaker: m.speakerId === 'narrator' ? 'Narrador' : m.speakerId,
          line: m.line,
          type: 'npc',
          locationId: inputState.locationId,
          participantIds: scene.participantIds,
          day: inputState.day,
          time: inputState.time
        });
      });
    }

    await saveHistory(history);
    scene.history = history;
}
