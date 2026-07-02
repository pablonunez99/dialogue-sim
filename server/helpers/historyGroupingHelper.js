export function groupHistoryIntoTurns(fullHistory, currentNpcs, defaultLocationId, defaultDay = 1, defaultTime = '08:00') {
  const turns = [];
  let currentTurn = null;

  for (const entry of fullHistory) {
    if (entry.type === 'player') {
      if (currentTurn) turns.push(currentTurn);
      currentTurn = { 
        player: entry.line, 
        npcs: [], 
        npcIds: [], 
        locationId: entry.locationId || defaultLocationId,
        day: entry.day || defaultDay,
        time: entry.time || defaultTime
      };
    } else if (entry.type === 'npc') {
      const speakerName = entry.speaker || currentNpcs.find(n => n.id === entry.speakerId)?.name || 'Narrador';
      const msgStr = `[${speakerName}]: ${entry.line}`;
      const speakerId = entry.speakerId;
      if (currentTurn) {
        currentTurn.npcs.push(msgStr);
        if (speakerId && speakerId !== 'narrator' && !currentTurn.npcIds.includes(speakerId)) {
          currentTurn.npcIds.push(speakerId);
        }
        // If the entry has a valid locationId, correct the turn's location
        if (entry.locationId && (!currentTurn.locationId || currentTurn.locationId === defaultLocationId)) {
          currentTurn.locationId = entry.locationId;
        }
        if (entry.day) currentTurn.day = entry.day;
        if (entry.time) currentTurn.time = entry.time;
      } else {
        currentTurn = {
          player: '(Inicio)',
          npcs: [msgStr],
          npcIds: speakerId && speakerId !== 'narrator' ? [speakerId] : [],
          locationId: entry.locationId || defaultLocationId,
          day: entry.day || defaultDay,
          time: entry.time || defaultTime
        };
        turns.push(currentTurn);
        currentTurn = null;
      }
    }
  }
  if (currentTurn) turns.push(currentTurn);
  return turns;
}
