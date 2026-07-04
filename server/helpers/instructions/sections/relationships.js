import { getRelationshipLabel } from '../utils.js';

/**
 * Builds the NPC relationship and trust context block.
 * @param {{ currentNpcs: Array, relationships: object, trust: object, flags: Array }} params
 * @returns {string}
 */
export function buildRelationshipContext({ currentNpcs, relationships, trust, flags }) {
  const lines = [
    '\n\n=== RELACIÓN Y CONFIANZA CON TODOS LOS HABITANTES DE LA ALDEA ===',
    'Usa esta información para determinar cómo trata cada personaje al Viajero. Si es "DESCONOCIDO", deben actuar como si nunca lo hubieran visto antes (preguntar nombre, mantener distancia, mostrar cautela y formalidad). Si es "PAREJA/ROMANCE", deben mostrar afecto romántico íntimo e incondicional:'
  ];

  for (const npc of currentNpcs) {
    const points        = relationships[npc.id];
    const trustPoints   = trust[npc.id] || 0;
    const isRomance     = flags.includes(`romance_${npc.id}`);
    const label         = getRelationshipLabel(npc.id, points, isRomance);
    const pointsDisplay = points !== undefined ? points : 'n/a';
    lines.push(`- ${npc.name} (${npc.id}): Nivel de Relación: ${pointsDisplay} (Etiqueta: ${label}). Nivel de Confianza: ${trustPoints}.`);
  }

  return lines.join('\n');
}
