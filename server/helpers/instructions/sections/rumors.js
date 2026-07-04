/**
 * Builds the gossip and notable relationships rumor block.
 * Only surfaces relationships that are significant enough to be village gossip
 * (romance, close friendship ≥ 6, or enmity ≤ -5).
 *
 * @param {{ participants: Array, currentNpcs: Array, relationships: object, flags: Array }} params
 * @returns {string}
 */
export function buildRumorContext({ participants, currentNpcs, relationships, flags }) {
  const lines = ['\n\n=== NOTICIAS Y RUMORES DE OTRAS RELACIONES ==='];
  let hasNotable = false;

  for (const [npcId, points] of Object.entries(relationships)) {
    // Skip NPCs already present in the current scene
    if (participants.some(p => p.id === npcId)) continue;

    const targetNpc = currentNpcs.find(n => n.id === npcId);
    if (!targetNpc) continue;

    const isRomance = flags.includes(`romance_${npcId}`);

    if (isRomance) {
      lines.push(`- El Viajero tiene una relación sentimental activa de PAREJA/ROMANCE con ${targetNpc.name} (${targetNpc.id}). Toda la aldea lo sabe.`);
      hasNotable = true;
    } else if (points >= 6) {
      lines.push(`- El Viajero es muy cercano con ${targetNpc.name} (${targetNpc.id}) (Relación: ${points}, Etiqueta: Amigo Íntimo).`);
      hasNotable = true;
    } else if (points <= -5) {
      lines.push(`- El Viajero tiene una fuerte rivalidad u hostilidad con ${targetNpc.name} (${targetNpc.id}) (Relación: ${points}, Etiqueta: Enemigo).`);
      hasNotable = true;
    }
  }

  if (!hasNotable) {
    lines.push('No hay rumores notables sobre relaciones del Viajero con otros personajes en este momento.');
  }

  return lines.join('\n');
}
