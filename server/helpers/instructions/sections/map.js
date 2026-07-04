/**
 * Builds the village connection map block for spatial awareness.
 * @param {{ currentLocations: Array }} params
 * @returns {string}
 */
export function buildMapContext({ currentLocations }) {
  const lines = [
    '\n\n=== MAPA DE CONEXIONES Y DISTANCIAS DE LA ALDEA ===',
    'Los personajes y el jugador solo pueden viajar entre ubicaciones que estén conectadas directamente. Aquí tienes el mapa actual de caminos (las ubicaciones adyacentes a las que se puede caminar directamente y el tiempo requerido):'
  ];

  for (const loc of currentLocations) {
    const conns = loc.connections || [];
    if (conns.length > 0) {
      const connList = conns.map(c => {
        const target = currentLocations.find(l => l.id === c.to);
        const targetName = target ? target.name : c.to;
        return `${targetName} (${c.to} - ${c.distance} min)`;
      }).join(', ');
      lines.push(`- ${loc.name} (${loc.id}) conecta directamente con: ${connList}.`);
    } else {
      lines.push(`- ${loc.name} (${loc.id}) no tiene caminos de salida.`);
    }
  }

  return lines.join('\n');
}
