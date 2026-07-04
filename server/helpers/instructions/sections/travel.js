/**
 * Builds travel-related context blocks.
 * Covers both "recent travel arrival" and "intermediate stop" scenarios.
 * @param {{ travelMinutes: number, travelQueue: Array, currentLocations: Array, locationName: string }} params
 * @returns {string}
 */
export function buildTravelContext({ travelMinutes, travelQueue, currentLocations, locationName }) {
  const parts = [];

  if (travelMinutes > 0) {
    parts.push([
      '\n\n=== RECIENTE VIAJE DEL JUGADOR ===',
      `El jugador acaba de viajar hasta aquí desde su ubicación anterior. Este trayecto le ha tomado exactamente ${travelMinutes} minutos. El reloj de la aldea ha avanzado de acuerdo a este tiempo de viaje. Narra la llegada de forma natural habiendo transcurrido este trayecto (por ejemplo, comentando la caminata, el cansancio del viaje, o el cambio en la luz del día si corresponde).`
    ].join('\n'));
  }

  if (travelQueue.length > 0) {
    const finalDestId = travelQueue[travelQueue.length - 1];
    const finalDestName = currentLocations.find(l => l.id === finalDestId)?.name || finalDestId;
    parts.push([
      '\n\n=== PARADA INTERMEDIA DE VIAJE ===',
      `ATENCIÓN: El grupo se encuentra actualmente en tránsito hacia su destino final: "${finalDestName}". Esta es una PARADA INTERMEDIA en la que acabas de detenerte temporalmente ("${locationName}"). La conversación o narración debe enfocarse únicamente en el trayecto, el descanso temporal o los diálogos durante la caminata, sin actuar como si ya hubieran llegado a la meta final. Al final del turno, el viaje continuará hacia el siguiente paso de la ruta.`
    ].join('\n'));
  }

  return parts.join('');
}
