import { cachedNpcs } from "../../../data/repository.js";
import { EXPRESSIONS } from "../../../../src/data/world.js";
import { normalizeDeltaMap } from "../../../utils/modelHelpers.js";
import { makeFallbackScene } from "./fallbackGenerator.js";

/**
 * Normaliza y sanea el JSON devuelto por el modelo de IA para asegurar
 * la compatibilidad con el esquema visual novel y aplicar reglas de negocio.
 */
export function normalizeScene(scene, location, participants, activeEvent = null) {
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

    if (!slicedMessages.length && !scene.narration) {
      return makeFallbackScene({ locationId: location.id, participantIds, playerText: '' });
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
      sceneContext: String(scene.sceneContext || ''),
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
