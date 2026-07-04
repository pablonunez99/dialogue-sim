/**
 * Builds the active narrative event block.
 * Returns an empty string if there is no active event.
 * @param {{ activeEvent: object|null }} params
 * @returns {string}
 */
export function buildEventContext({ activeEvent }) {
  if (!activeEvent) return '';

  return [
    '\n\n=== EVENTO NARRATIVO ACTIVO ===',
    `El siguiente suceso especial ha ocurrido en esta ubicación: "${activeEvent.name}".`,
    `Descripción: ${activeEvent.description}`,
    `Consecuencia: ${activeEvent.consequence}`,
    `NPCs Involucrados: ${activeEvent.involvedNpcs.join(', ')}`,
    'DEBES estructurar tu respuesta para reflejar e integrar este evento en los diálogos y la narración de forma coherente. El tono y reacciones de los NPCs involucrados deben reflejar la consecuencia indicada.'
  ].join('\n');
}
