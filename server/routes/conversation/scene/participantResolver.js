import { getNpcLocation } from "../../../../src/data/world.js";

/**
 * Resuelve qué NPCs deben participar en la conversación (máximo 4).
 * Si se solicitan específicos, se validan y usan; si no, se buscan NPCs cercanos según su horario/locación actual.
 */
export function resolveParticipants(participantIds, location, currentNpcs, timeOfDay = 'mañana') {
    const requested = Array.isArray(participantIds) ? participantIds : [];
    const validRequested = requested.map((id) => currentNpcs.find((npc) => npc.id === id)).filter(Boolean);
    if (validRequested.length > 0) return validRequested.slice(0, 4);

    const nearby = currentNpcs.filter((npc) => {
        const currentLoc = getNpcLocation(npc.id, timeOfDay, npc.locationId, npc);
        return currentLoc === location.id;
    });
    return nearby.slice(0, 4);
}

/**
 * Extrae y formatea los detalles de personalidad y trasfondo de un NPC para ser consumidos por el modelo de IA.
 */
export function getNpcDetails(npc) {
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
        knownSuggestions: npc.suggestions,
        memorySummary: npc.memorySummary || ''
    };
}
