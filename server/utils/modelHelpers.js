// Utilidades puras para parsear e higienizar respuestas de la IA

export function parseModelJson(text = '') {
  const trimmed = text.trim();
  
  // Find the first '{'
  const firstBraceIdx = trimmed.indexOf('{');
  if (firstBraceIdx === -1) {
    return JSON.parse(trimmed);
  }
  
  // Balance braces to find the matching closing brace
  let openBraces = 0;
  let inString = false;
  let escapeNext = false;
  let lastBraceIdx = -1;
  
  for (let i = firstBraceIdx; i < trimmed.length; i++) {
    const char = trimmed[i];
    
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '{') {
        openBraces++;
      } else if (char === '}') {
        openBraces--;
        if (openBraces === 0) {
          lastBraceIdx = i;
          break;
        }
      }
    }
  }
  
  if (lastBraceIdx !== -1) {
    const jsonCandidate = trimmed.substring(firstBraceIdx, lastBraceIdx + 1);
    try {
      return JSON.parse(jsonCandidate);
    } catch (err) {
      console.warn('[QuestEngine] Balanced brace JSON parsing failed. Retrying with regex matched substring...', err.message);
    }
  }
  
  // Fallback to regex matching
  const jsonLike = trimmed.match(/\{[\s\S]*\}/)?.[0] ?? trimmed;
  return JSON.parse(jsonLike);
}

export function normalizeDeltaMap(map, participantSet) {
  if (!map || typeof map !== 'object') return {};
  return Object.fromEntries(
    Object.entries(map)
      .filter(([npcId]) => participantSet.has(npcId))
      .map(([npcId, value]) => [npcId, clampNumber(value, -2, 2)])
  );
}

export function clampNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(min, Math.min(max, numeric));
}


export function getRelationshipLabel(npcId, points, isRomanceActive) {
  if (points === undefined) {
    return 'DESCONOCIDO (Stranger - You have NEVER met or spoken to this traveler before. Act distant, formal, ask who they are, show caution, and do not act familiar or friendly)';
  }
  if (isRomanceActive) return 'PAREJA / ROMANCE (Romantic Partner - Treat them with deep affection, intimacy, warmth, and care)';
  if (points >= 8) return 'AMIGO ÍNTIMO (Very Close Friend - Extreme trust and warmth)';
  if (points >= 5) return 'CONFIDENTE (Confidant - High trust, willing to share deep secrets)';
  if (points >= 2) return 'AMIGO (Friend - Warm, friendly, cooperative)';
  if (points <= -6) return 'ENEMIGO (Enemy - Active hostility, anger, and opposition)';
  if (points <= -2) return 'HOSTIL (Hostile - Coolness, suspicion, and anger)';
  return 'CONOCIDO (Acquaintance - You know of them, speak with basic politeness)';
}
