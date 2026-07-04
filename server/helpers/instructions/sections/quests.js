/**
 * Builds the active quests block, including the urgent direct-meet trigger section.
 * @param {{ quests: Array, currentNpcs: Array }} params
 * @returns {string}
 */
export function buildQuestContext({ quests, currentNpcs }) {
  const activeQuests = quests.filter(q => q.status === 'active');
  const lines = ['\nMisiones Activas en la aldea y su Estado:'];

  if (activeQuests.length === 0) {
    lines.push('- (No hay misiones activas en este momento)');
  } else {
    activeQuests.forEach(q => {
      lines.push(`- Misión ID [${q.id}]: "${q.title}" de [${q.npcId}]. Objetivo: "${q.objective}". Urgencia: "${q.urgency}".`);
    });
  }

  // Urgent quests that require the NPC to approach the player immediately
  const urgentDirect = activeQuests.filter(q => q.urgency === 'alta' && q.triggerDirectMeet === true);
  if (urgentDirect.length > 0) {
    lines.push(
      '\n=== ENCUENTROS URGENTES DE MISIÓN (OBLIGATORIO) ===',
      'Los siguientes personajes tienen misiones sumamente urgentes y deben abordar al jugador en esta ubicación inmediatamente para presentárselas:'
    );
    urgentDirect.forEach(q => {
      const npcName = currentNpcs.find(n => n.id === q.npcId)?.name || q.npcId;
      lines.push(
        `- NPC: ${npcName} (id: ${q.npcId}). Misión: "${q.title}". Objetivo: "${q.objective}". Descripción: "${q.description}".`,
        `INSTRUCCIÓN: Como esta misión es sumamente urgente, el personaje ${npcName} (${q.npcId}) DEBE aparecer en escena en esta ubicación para hablarle al jugador sobre esta tarea de forma apresurada en este turno. Si no está en 'participantIds', DEBES incluirlo en tu respuesta en 'participantIds' para que aparezca en pantalla, y hacer que hable directamente en 'messages'. Menciónalo en la narración y haz que inicie su diálogo sobre este asunto inmediatamente.`
      );
    });
  }

  lines.push(
    '\nREGLAS DE INVENTARIO Y MISIONES:',
    '- Si las acciones o las palabras del jugador completan lógicamente los requisitos de una misión activa (por ejemplo, te da el objeto requerido o habla de haber resuelto la tarea), DEBES marcar la misión como completada en tu respuesta JSON en "questUpdates" (ej: { "id": "fb_quest_herrero_1", "status": "completed" }).',
    '- Si decides que un NPC le entrega un objeto físico al jugador o se lo quita, DEBES registrarlo en "inventoryDeltas" (ej: para añadir: { "id": "carta_secreta", "name": "Carta Secreta", "description": "Una carta sellada.", "action": "add" }; para quitar: { "id": "carta_secreta", "action": "remove" }).',
    '- Si el jugador realiza un servicio por oro o compra algo, DEBES reflejar la ganancia o pérdida en "goldDelta" (ej: 15 o -10).'
  );

  return lines.join('\n');
}
