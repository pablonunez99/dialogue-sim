const WEATHERS = [
  'soleado y cálido con una brisa ligera',
  'nublado y fresco con neblina matutina en las zonas bajas',
  'lluvioso con ráfagas de viento frío y nubes densas',
  'tormentoso con truenos distantes y lluvias torrenciales',
  'fresco y despejado con un sol brillante pero viento del norte',
  'húmedo y templado con llovizna intermitente',
  'despejado y caluroso, ideal para trabajar al aire libre'
];

export function getWeatherForDay(day) {
  return WEATHERS[(day - 1) % WEATHERS.length];
}

export function getRelationshipLabel(npcId, points, isRomanceActive) {
  if (points === undefined) {
    return 'DESCONOCIDO (Stranger - You have NEVER met or spoken to this traveler before. Act distant, formal, ask who they are, show caution, and do not act familiar or friendly)';
  }
  if (isRomanceActive) return 'PAREJA / ROMANCE (Romantic Partner - Treat them with deep affection, intimacy, warmth, and care)';
  if (points >= 8)  return 'AMIGO ÍNTIMO (Very Close Friend - Extreme trust and warmth)';
  if (points >= 5)  return 'CONFIDENTE (Confidant - High trust, willing to share deep secrets)';
  if (points >= 2)  return 'AMIGO (Friend - Warm, friendly, cooperative)';
  if (points <= -6) return 'ENEMIGO (Enemy - Active hostility, anger, and opposition)';
  if (points <= -2) return 'HOSTIL (Hostile - Coolness, suspicion, and anger)';
  return 'CONOCIDO (Acquaintance - You know of them, speak with basic politeness)';
}
